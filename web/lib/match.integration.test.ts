/**
 * Batch matching against a REAL local chain: the same runner the UI uses (`runMatch`: re-read, simulate, sign, receipt
 * wait, decode, reconcile) driven with Anvil's unlocked dev accounts through viem, against the deployed contracts and the
 * merged engine (`matchOrders` implemented).
 *
 * This is NOT MetaMask and NOT a browser. Same safety rules as the other integration suites: it mutates the chain, so it
 * only runs when explicitly enabled, refuses port 8545, and wraps every test in evm_snapshot / evm_revert:
 *   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 npx vitest run --no-file-parallelism lib/match.integration.test.ts
 *
 * State is CHECKED, not assumed (a leftover allowance on a reused scratch chain once broke a browser suite,
 * docs/ai-audit/test-evidence/person2/p2-8b01-preflight.md): before the suite the chain must be freshly deployed (no
 * allowances, no orders, an empty book, a token-less keeper). After EVERY test, whether it passed or threw, the revert
 * is verified against chain state (head block, allowances, order ids, book heads), never by balances alone.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, http, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { foundry } from "viem/chains";
import { demoTokenAbi, orderBookAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { crossedBook } from "./crossed-book";
import { describeTxError } from "./errors";
import { matchDeps, runMatch, type MatchOutcome } from "./match-runner";
import { flowReducer, initialFlowState, type FlowContext, type FlowEvent, type FlowState } from "./order-flow";
import { decodeMatchReceipt } from "./receipt";
import { requiredQuote } from "./units";

const RPC = process.env.E2E_RPC_URL;
const ENABLED = Boolean(RPC);
const D = PRIMARY_DEPLOYMENT;
const MARKET = D.market as Address;
const NTU = D.baseToken.address as Address;
const SGDX = D.quoteToken.address as Address;
const E18 = 10n ** 18n;
const dec = (s: string) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};

// Anvil's public dev accounts (unlocked on the scratch chain). No private keys are used anywhere.
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address; // account 0, holds the token supply
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address; // account 1: funded 10,000 NTU + SGDx
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address; // account 2
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address; // account 3
const KEEPER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as Address; // account 4: holds NO trading tokens
const BUY = 0;
const SELL = 1;

let pub: PublicClient;
let snapshot: string | undefined;
let snapshotBlock = 0n;
/** The head block read straight from the node. viem's `getBlockNumber` is cached for the polling interval, which hides a revert. */
const headBlock = async () => BigInt((await pub.request({ method: "eth_blockNumber" })) as string);

const walletFor = (account: Address) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const bal = (token: Address, who: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
const allowance = (token: Address, owner: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [owner, MARKET] }) as Promise<bigint>;
const userIds = (who: Address) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getUserOrderIds", args: [who] }) as Promise<bigint[]>;
const best = async () => {
  const [bid, ask] = await Promise.all([
    pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBestBid" }) as Promise<readonly [bigint, bigint]>,
    pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBestAsk" }) as Promise<readonly [bigint, bigint]>,
  ]);
  return { bid: { id: bid[0], price: bid[1] }, ask: { id: ask[0], price: ask[1] } };
};
const getOrder = (id: bigint) =>
  pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getOrder", args: [id] }) as Promise<{ id: bigint; trader: Address; side: number; price: bigint; amount: bigint; filled: bigint; lockedQuote: bigint; status: number }>;

async function send(account: Address, address: Address, abi: typeof orderBookAbi | typeof demoTokenAbi, functionName: string, args: readonly unknown[]): Promise<Hex> {
  const { request } = await pub.simulateContract({ account, address, abi, functionName, args } as never);
  const hash = await walletFor(account).writeContract(request as never);
  const rc = await pub.waitForTransactionReceipt({ hash });
  expect(rc.status).toBe("success");
  return hash;
}
/** Places a limit order the plain way (exact approval, then the order) and returns its id. */
async function place(account: Address, side: number, price: string, amount: string): Promise<bigint> {
  const p = dec(price);
  const a = dec(amount);
  await send(account, side === BUY ? SGDX : NTU, demoTokenAbi, "approve", [MARKET, side === BUY ? requiredQuote(a, p) : a]);
  const before = (await userIds(account)).length;
  await send(account, MARKET, orderBookAbi, "placeLimitOrder", [side, p, a]);
  const after = await userIds(account);
  expect(after.length).toBe(before + 1);
  return after[after.length - 1]!;
}

const ctxFor = (account: Address): FlowContext => ({ account, chainId: 31337, market: MARKET });
let attemptCounter = 0;
const limit = async () => (await pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "MAX_MATCHES_PER_TX" })) as bigint;

/** Drives one matching call through the real reducer, exactly as `useMatchFlow` does, and returns the final state. */
async function matchAs(account: Address) {
  const attempt = ++attemptCounter;
  const ctx = ctxFor(account);
  let state: FlowState<MatchOutcome> = flowReducer(initialFlowState<MatchOutcome>(), { type: "START_ORDER", attempt, ctx });
  const events: FlowEvent<MatchOutcome>[] = [];
  const deps = matchDeps(pub, async (req) =>
    walletFor(account).writeContract({ address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, account, chain: foundry } as never),
  );
  await runMatch(
    deps,
    { ctx, pair: { market: MARKET, baseToken: NTU, quoteToken: SGDX }, limit: await limit(), attempt },
    (e) => {
      events.push(e);
      state = flowReducer(state, e);
    },
    () => true,
  );
  return { state, types: events.map((e) => e.type) };
}
const doneOf = (r: Awaited<ReturnType<typeof matchAs>>) => {
  expect(r.state.failure, JSON.stringify(r.state.failure)).toBeUndefined();
  expect(r.state.phase).toBe("done");
  return r.state.result!;
};

/** The state a freshly deployed scratch chain is in, as chain reads (not balances). Returns what differs. */
async function dirtiness(): Promise<string[]> {
  const dirty: string[] = [];
  for (const [name, who] of [["Deployer", DEPLOYER], ["Alice", ALICE], ["Bob", BOB], ["Carol", CAROL], ["Keeper", KEEPER]] as const) {
    if ((await allowance(NTU, who)) !== 0n) dirty.push(`${name} has a leftover NTU allowance for the market`);
    if ((await allowance(SGDX, who)) !== 0n) dirty.push(`${name} has a leftover SGDx allowance for the market`);
    if ((await userIds(who)).length !== 0) dirty.push(`${name} already has orders on the market`);
  }
  const b = await best();
  if (b.bid.id !== 0n || b.ask.id !== 0n) dirty.push("the book is not empty");
  return dirty;
}

/** Alice and Carol alternate 22 sells of 1 NTU at 2; Bob bids 11 at 3 and the deployer bids 11 at 2.5. Each bid hits the cap. */
async function buildCrossedBook() {
  const asks: bigint[] = [];
  for (let i = 0; i < 22; i++) asks.push(await place(i % 2 === 0 ? ALICE : CAROL, SELL, "2", "1"));
  const bobBid = await place(BOB, BUY, "3", "11");
  const deployerBid = await place(DEPLOYER, BUY, "2.5", "11");
  return { asks, bobBid, deployerBid };
}

describe.skipIf(!ENABLED)("batch matching on a real scratch chain (Anvil, unlocked dev accounts; NOT MetaMask)", () => {
  beforeAll(async () => {
    if (!RPC) return;
    if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain. Use a scratch Anvil (for example port 8546).");
    if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
    pub = createPublicClient({ chain: foundry, transport: http(RPC) });
    expect(await pub.getChainId()).toBe(31337);
    const code = await pub.getCode({ address: MARKET });
    expect(code && code !== "0x", "the exported market has no code on this chain: deploy to the scratch chain first").toBe(true);
    expect(await limit(), "the market's MAX_MATCHES_PER_TX is not 10: this suite's scenario assumes the engine's default").toBe(10n);
    // `matchOrders` must exist in the deployed bytecode (an engine redeploy is needed otherwise): an empty book simulates 0.
    const probe = await pub.simulateContract({ account: KEEPER, address: MARKET, abi: orderBookAbi, functionName: "matchOrders", args: [1n] });
    expect(probe.result).toBe(0n);
    for (const who of [KEEPER]) {
      expect(await bal(NTU, who), "the keeper must hold no NTU").toBe(0n);
      expect(await bal(SGDX, who), "the keeper must hold no SGDx").toBe(0n);
    }
    const dirty = await dirtiness();
    expect(dirty, `The scratch chain is not in its freshly deployed state: ${dirty.join("; ")}. Restart and redeploy it before running this suite.`).toEqual([]);
  });

  beforeEach(async () => {
    snapshot = (await pub.request({ method: "evm_snapshot" as never })) as string;
    snapshotBlock = await headBlock();
  });
  afterEach(async () => {
    // Runs even when the test threw. The revert is proven by chain state, not by balances.
    if (!snapshot) return;
    const reverted = await pub.request({ method: "evm_revert" as never, params: [snapshot] as never });
    snapshot = undefined;
    expect(reverted, "evm_revert reported failure").toBe(true);
    expect(await headBlock(), "the head block is not the snapshot's: the revert did not restore the chain").toBe(snapshotBlock);
    const dirty = await dirtiness();
    expect(dirty, `The revert left state behind: ${dirty.join("; ")}`).toEqual([]);
  });

  it("the multi-party scenario: a token-less keeper settles orders of FOUR traders in ONE transaction", async () => {
    const { asks, bobBid, deployerBid } = await buildCrossedBook();
    expect(asks).toHaveLength(22);

    // Each capped bid rests 1 NTU crossed against the remaining asks (the engine matched 10 for each, then stopped).
    const b0 = await best();
    expect(crossedBook(b0.bid, b0.ask).crossed).toBe(true);
    expect(b0.bid.id).toBe(bobBid); // Bob's bid at 3 is the best bid
    expect(b0.ask.id).toBe(asks[20]); // asks 1..20 were consumed; the oldest remaining ask is the 21st
    expect(await getOrder(bobBid)).toMatchObject({ filled: dec("10"), status: 1 });
    expect(await getOrder(deployerBid)).toMatchObject({ filled: dec("10"), status: 1 });

    const accounts = [DEPLOYER, ALICE, BOB, CAROL, KEEPER, MARKET] as const;
    const read = async () => Object.fromEntries(await Promise.all(accounts.map(async (a) => [a, { ntu: await bal(NTU, a), sgd: await bal(SGDX, a) }]))) as Record<string, { ntu: bigint; sgd: bigint }>;
    const keeperEth0 = await pub.getBalance({ address: KEEPER });
    const before = await read();
    expect(before[KEEPER]).toEqual({ ntu: 0n, sgd: 0n });
    // The market holds exactly the unfilled escrow: 2 NTU of asks, 3 + 2.5 SGDx locked by the two remainders.
    expect(before[MARKET]).toEqual({ ntu: dec("2"), sgd: dec("5.5") });

    const out = doneOf(await matchAs(KEEPER));

    // The result comes from the receipt, checked here against an independent decode of the same logs.
    expect(out.problems).toEqual([]);
    expect(out).toMatchObject({ requested: 10n, simulatedFills: 2n, noop: false, stillCrossed: false, totalBase: dec("2"), totalQuote: dec("4"), baseOut: dec("2"), quoteOut: dec("5.5") });
    const rc = await pub.getTransactionReceipt({ hash: out.hash });
    expect(rc.status).toBe("success");
    expect(rc.from.toLowerCase()).toBe(KEEPER.toLowerCase());
    const trades = parseEventLogs({ abi: orderBookAbi, logs: rc.logs.filter((l) => l.address.toLowerCase() === MARKET.toLowerCase()), eventName: "Trade" });
    expect(trades).toHaveLength(2);
    expect(out.fills).toHaveLength(2);
    // Makers are the two OLDER resting asks (they entered the book before the bids), so both fills are at their price, 2.
    expect(trades.map((t) => [t.args.makerOrderId, t.args.takerOrderId, t.args.maker, t.args.taker])).toEqual([
      [asks[20], bobBid, ALICE, BOB],
      [asks[21], deployerBid, CAROL, DEPLOYER],
    ]);
    for (const t of trades) expect(t.args).toMatchObject({ price: dec("2"), baseAmount: dec("1"), quoteAmount: dec("2") });
    expect(out.fills.map((f) => [f.makerOrderId, f.takerOrderId])).toEqual(trades.map((t) => [t.args.makerOrderId, t.args.takerOrderId]));
    expect(decodeMatchReceipt({ logs: rc.logs, market: MARKET, baseToken: NTU, quoteToken: SGDX }).fills).toHaveLength(2);

    // Exact token movements, trader by trader.
    const after = await read();
    const delta = (who: Address) => ({ ntu: after[who]!.ntu - before[who]!.ntu, sgd: after[who]!.sgd - before[who]!.sgd });
    expect(delta(ALICE)).toEqual({ ntu: 0n, sgd: dec("2") }); // sold 1 NTU at 2
    expect(delta(CAROL)).toEqual({ ntu: 0n, sgd: dec("2") });
    expect(delta(BOB)).toEqual({ ntu: dec("1"), sgd: dec("1") }); // bought 1 NTU; his 3-limit escrow gives back 1 of price improvement
    expect(delta(DEPLOYER)).toEqual({ ntu: dec("1"), sgd: dec("0.5") }); // bought 1 NTU; 2.5 escrow, cost 2
    expect(delta(KEEPER)).toEqual({ ntu: 0n, sgd: 0n }); // the caller neither paid nor received a trading token
    expect(await pub.getBalance({ address: KEEPER })).toBeLessThan(keeperEth0); // it paid gas
    expect(delta(MARKET)).toEqual({ ntu: -dec("2"), sgd: -dec("5.5") });
    expect(after[MARKET]).toEqual({ ntu: 0n, sgd: 0n }); // no escrow left anywhere

    // Final order statuses.
    for (const id of [asks[20]!, asks[21]!, bobBid, deployerBid]) expect(await getOrder(id), `order ${id}`).toMatchObject({ status: 2, lockedQuote: 0n });
    expect(out.effects.map((e) => [e.orderId, e.after.status])).toEqual(expect.arrayContaining([[asks[20], 2], [asks[21], 2], [bobBid, 2], [deployerBid, 2]]));
    const b1 = await best();
    expect(b1.bid.id).toBe(0n);
    expect(b1.ask.id).toBe(0n);

    // A second call finds nothing: the flow refuses before the wallet, and the contract simulates zero.
    const again = await matchAs(KEEPER);
    expect(again.state.failure?.title).toBe("The book is no longer crossed");
    expect(again.types).toEqual(["FAILED"]);
    const probe = await pub.simulateContract({ account: KEEPER, address: MARKET, abi: orderBookAbi, functionName: "matchOrders", args: [1n] });
    expect(probe.result).toBe(0n);
  });

  it("repeated matching: a remainder of 12 crossed asks needs TWO deliberate calls (10 fills, then 2)", async () => {
    const asks: bigint[] = [];
    for (let i = 0; i < 22; i++) asks.push(await place(i % 2 === 0 ? ALICE : CAROL, SELL, "2", "1"));
    const bid = await place(BOB, BUY, "2", "22"); // matches 10 asks, rests 12 NTU still crossing 12 asks
    expect(await getOrder(bid)).toMatchObject({ filled: dec("10"), status: 1 });

    const first = doneOf(await matchAs(KEEPER));
    expect(first.fills).toHaveLength(10);
    expect(first.stillCrossed).toBe(true); // the UI would offer another deliberate click
    expect(first.problems).toEqual([]);
    expect(await getOrder(bid)).toMatchObject({ filled: dec("20"), status: 1 });

    const second = doneOf(await matchAs(KEEPER));
    expect(second.fills).toHaveLength(2);
    expect(second.stillCrossed).toBe(false);
    expect(second.problems).toEqual([]);
    expect(await getOrder(bid)).toMatchObject({ filled: dec("22"), status: 2 });
    expect(await bal(NTU, MARKET)).toBe(0n);
    expect(await bal(SGDX, MARKET)).toBe(0n);
    expect(await bal(NTU, KEEPER)).toBe(0n);
    expect(await bal(SGDX, KEEPER)).toBe(0n);
  });

  it("the engine's own limits: matchOrders(0) and matchOrders(11) revert InvalidMaxCount, in plain words", async () => {
    for (const bad of [0n, 11n]) {
      const err = await pub.simulateContract({ account: KEEPER, address: MARKET, abi: orderBookAbi, functionName: "matchOrders", args: [bad] }).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err, `matchOrders(${bad}) should revert`).toBeDefined();
      expect(describeTxError(err)).toMatchObject({ kind: "reverted", errorName: "InvalidMaxCount", title: "Invalid match count" });
    }
  });

  it("a matching transaction on an uncrossed book mines with zero Trade events: decoded as a no-op, never as fills", async () => {
    await place(ALICE, SELL, "2", "1"); // asks only: nothing crosses
    const hash = await send(KEEPER, MARKET, orderBookAbi, "matchOrders", [10n]);
    const rc = await pub.getTransactionReceipt({ hash });
    const decoded = decodeMatchReceipt({ logs: rc.logs, market: MARKET, baseToken: NTU, quoteToken: SGDX });
    expect(decoded).toEqual({ fills: [], baseOut: 0n, quoteOut: 0n, baseTo: {}, quoteTo: {} });
    // And the flow itself never even asks the wallet: the book is not crossed.
    const r = await matchAs(KEEPER);
    expect(r.state.failure?.title).toBe("The book is no longer crossed");
    expect(r.types).toEqual(["FAILED"]);
  });

  it("any funded trader may call it too (permissionless), and balances change only by what the fills settle", async () => {
    const { asks, bobBid } = await buildCrossedBook();
    const before = { ntu: await bal(NTU, ALICE), sgd: await bal(SGDX, ALICE) };
    // Alice owns ask #21 (index 20) which is about to be settled by SOMEONE ELSE's call: she gains 2 SGDx, nothing else.
    const out = doneOf(await matchAs(CAROL));
    expect(out.problems).toEqual([]);
    expect(out.fills.map((f) => f.makerOrderId)).toEqual([asks[20], asks[21]]);
    expect((await getOrder(bobBid)).status).toBe(2);
    expect({ ntu: (await bal(NTU, ALICE)) - before.ntu, sgd: (await bal(SGDX, ALICE)) - before.sgd }).toEqual({ ntu: 0n, sgd: dec("2") });
  });
});
