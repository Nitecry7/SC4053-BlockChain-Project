/**
 * Stop-limit orders against a REAL local chain: the same runners the UI uses (`runApproval` + `runStopOrder` to place,
 * `runTrigger` to trigger, `runCancel` to cancel, `runMatch` to clear a crossed remainder) driven with Anvil's unlocked
 * dev accounts through viem, against the deployed contracts and the merged engine.
 *
 * This is NOT MetaMask and NOT a browser. It mutates the chain, so it only runs when explicitly enabled, refuses port
 * 8545, and wraps every test in evm_snapshot / evm_revert:
 *   E2E_RPC_URL=http://127.0.0.1:8547 E2E_ALLOW_MUTATE=1 npx vitest run --no-file-parallelism lib/stop.integration.test.ts
 *
 * State is CHECKED, not assumed (a leftover allowance on a reused scratch chain once broke a browser suite): before the
 * suite the chain must be freshly deployed (no allowance, no order, an empty book, no trade price, a token-less keeper).
 * After EVERY test, even one that threw, the revert is verified from the node (uncached head block, allowances, order ids,
 * book heads, "nothing to trigger"), never by balances alone. Every scenario ends with a solvency check: the market's
 * token balances equal what its orders still owe.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, http, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { foundry } from "viem/chains";
import { demoTokenAbi, orderBookAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { runCancel, type CancelDeps, type CancelOutcome } from "./cancel-runner";
import { matchDeps, runMatch, type MatchOutcome } from "./match-runner";
import { flowReducer, initialFlowState, type FlowContext, type FlowEvent, type FlowState } from "./order-flow";
import type { ValidOrder } from "./order-input";
import { runApproval, viemDeps } from "./order-runner";
import { classifyStop, readStopHistory, UNREAD_HISTORY } from "./stop-history";
import { stopState, validateStopInput } from "./stop-orders";
import { isStopOutcome, runStopOrder, type StopOutcome, type TicketOutcome } from "./stop-runner";
import { runTrigger, triggerDeps, type TriggerOutcome } from "./trigger-runner";
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
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address; // account 0
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address; // account 1: 10,000 NTU + SGDx
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address; // account 2
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address; // account 3
const KEEPER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as Address; // account 4: holds NO trading tokens
const ACCOUNTS = [DEPLOYER, ALICE, BOB, CAROL, KEEPER] as const;
const BUY = 0;
const SELL = 1;

let pub: PublicClient;
let snapshot: string | undefined;
let snapshotBlock = 0n;
/** viem's `getBlockNumber` is cached for the polling interval, which hides a revert: read the node directly. */
const headBlock = async () => BigInt((await pub.request({ method: "eth_blockNumber" })) as string);

const walletFor = (account: Address) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const writerFor = (account: Address) => async (req: { address: Address; abi: unknown; functionName: string; args: readonly unknown[] }) =>
  walletFor(account).writeContract({ address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, account, chain: foundry } as never);
const bal = (token: Address, who: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
const allowance = (token: Address, owner: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [owner, MARKET] }) as Promise<bigint>;
const userIds = (who: Address) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getUserOrderIds", args: [who] }) as Promise<bigint[]>;
type Order = { id: bigint; trader: Address; side: number; price: bigint; triggerPrice: bigint; amount: bigint; filled: bigint; lockedQuote: bigint; createdAt: bigint; status: number };
const getOrder = (id: bigint) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getOrder", args: [id] }) as Promise<Order>;
const book = (side: number) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBook", args: [side, 200n] }) as Promise<Order[]>;
const best = async () => {
  const [bid, ask] = await Promise.all([
    pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBestBid" }) as Promise<readonly [bigint, bigint]>,
    pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBestAsk" }) as Promise<readonly [bigint, bigint]>,
  ]);
  return { bid: { id: bid[0], price: bid[1] }, ask: { id: ask[0], price: ask[1] } };
};
const lastTrade = async () => ({
  price: (await pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "lastTradePrice" })) as bigint,
  has: (await pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "hasTradePrice" })) as boolean,
});
const simulateTrigger = async (count = 10n) =>
  (await pub.simulateContract({ account: KEEPER, address: MARKET, abi: orderBookAbi, functionName: "triggerStopOrders", args: [count] })).result as bigint;
const limit = async () => (await pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "MAX_MATCHES_PER_TX" })) as bigint;

async function send(account: Address, address: Address, abi: typeof orderBookAbi | typeof demoTokenAbi, functionName: string, args: readonly unknown[]): Promise<Hex> {
  const { request } = await pub.simulateContract({ account, address, abi, functionName, args } as never);
  const hash = await walletFor(account).writeContract(request as never);
  const rc = await pub.waitForTransactionReceipt({ hash });
  expect(rc.status).toBe("success");
  return hash;
}
const approve = (account: Address, token: Address, amount: bigint) => send(account, token, demoTokenAbi, "approve", [MARKET, amount]);
/** A plain limit order (exact approval, then the order). Returns its id. */
async function place(account: Address, side: number, price: string, amount: string): Promise<bigint> {
  const p = dec(price);
  const a = dec(amount);
  await approve(account, side === BUY ? SGDX : NTU, side === BUY ? requiredQuote(a, p) : a);
  const before = (await userIds(account)).length;
  await send(account, MARKET, orderBookAbi, "placeLimitOrder", [side, p, a]);
  const after = await userIds(account);
  expect(after.length).toBe(before + 1);
  return after[after.length - 1]!;
}
/** Establishes a last trade price: `seller` sells 1 NTU at `price`, `buyer` buys it. */
async function tradeAt(price: string, seller: Address = CAROL, buyer: Address = BOB, amount = "1") {
  await place(seller, SELL, price, amount);
  await place(buyer, BUY, price, amount);
  expect((await lastTrade()).price).toBe(dec(price));
}

const ctxFor = (account: Address): FlowContext => ({ account, chainId: 31337, market: MARKET });
let attemptCounter = 0;
const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };

/** Places a stop-limit order through the REAL runners: the approval step when needed, then `runStopOrder`, through the reducer. */
async function placeStopAs(account: Address, side: "buy" | "sell", trigger: string, limitPrice: string, amount: string) {
  const ctx = ctxFor(account);
  const v = validateStopInput({ side, triggerText: trigger, priceText: limitPrice, amountText: amount, lotSize: 10n ** 9n, tickSize: 10n ** 9n });
  if (!v.ok) throw new Error(`invalid test input: ${JSON.stringify(v.errors)}`);
  const order: ValidOrder = v.order;
  const deps = viemDeps(pub, writerFor(account) as never);
  const events: FlowEvent<TicketOutcome>[] = [];
  let state: FlowState<TicketOutcome> = initialFlowState<TicketOutcome>();
  const send = (e: FlowEvent<TicketOutcome>) => (events.push(e), (state = flowReducer(state, e)));
  const have = await allowance(order.collateralToken === "quote" ? SGDX : NTU, account);
  let attempt = ++attemptCounter;
  if (have < order.collateral) {
    state = flowReducer(state, { type: "START_APPROVAL", attempt, ctx });
    await runApproval<TicketOutcome>(deps, { ctx, pair, order, attempt }, send, () => true);
    expect(state.failure, JSON.stringify(state.failure)).toBeUndefined();
    expect(state.approvedAmount).toBe(order.collateral); // the allowance was re-read and covers exactly the escrow
    state = flowReducer(state, { type: "RESET", attempt: ++attemptCounter });
  }
  attempt = ++attemptCounter;
  state = flowReducer(state, { type: "START_ORDER", attempt, ctx });
  await runStopOrder(deps, { ctx, pair, order, attempt }, send, () => true);
  expect(state.failure, JSON.stringify(state.failure)).toBeUndefined();
  expect(state.phase).toBe("done");
  const result = state.result;
  if (!isStopOutcome(result)) throw new Error("expected a stop outcome");
  return result as StopOutcome;
}

/** One trigger call through the REAL runner, `count` stops at most. */
async function triggerAs(account: Address, count: bigint = 10n) {
  const attempt = ++attemptCounter;
  const ctx = ctxFor(account);
  let state: FlowState<TriggerOutcome> = flowReducer(initialFlowState<TriggerOutcome>(), { type: "START_ORDER", attempt, ctx });
  const events: FlowEvent<TriggerOutcome>[] = [];
  await runTrigger(triggerDeps(pub, writerFor(account) as never), { ctx, pair, limit: count, attempt }, (e) => (events.push(e), (state = flowReducer(state, e))), () => true);
  return { state, types: events.map((e) => e.type) };
}
const triggeredOf = (r: Awaited<ReturnType<typeof triggerAs>>) => {
  expect(r.state.failure, JSON.stringify(r.state.failure)).toBeUndefined();
  expect(r.state.phase).toBe("done");
  expect(r.state.result!.problems).toEqual([]);
  return r.state.result!;
};
async function matchAs(account: Address) {
  const attempt = ++attemptCounter;
  const ctx = ctxFor(account);
  let state: FlowState<MatchOutcome> = flowReducer(initialFlowState<MatchOutcome>(), { type: "START_ORDER", attempt, ctx });
  await runMatch(matchDeps(pub, writerFor(account) as never), { ctx, pair, limit: await limit(), attempt }, (e) => (state = flowReducer(state, e)), () => true);
  return state;
}
async function cancelAs(account: Address, orderId: bigint) {
  const attempt = ++attemptCounter;
  const ctx = ctxFor(account);
  let state: FlowState<CancelOutcome> = flowReducer(initialFlowState<CancelOutcome>(), { type: "START_ORDER", attempt, ctx });
  await runCancel(viemDeps(pub, writerFor(account) as never) as CancelDeps, { ctx, pair, orderId, attempt }, (e) => (state = flowReducer(state, e)), () => true);
  return state;
}

/** The market holds exactly what its orders still owe: base for sells (resting, partly filled or pending), quote for buys' locked quote. */
async function assertSolvent(label: string) {
  let base = 0n;
  let quote = 0n;
  for (const who of ACCOUNTS) {
    for (const id of await userIds(who)) {
      const o = await getOrder(id);
      if (o.side === SELL && (o.status === 0 || o.status === 1 || o.status === 4)) base += o.amount - o.filled;
      if (o.side === BUY && (o.status === 0 || o.status === 1 || o.status === 4)) quote += o.lockedQuote;
    }
  }
  expect(await bal(NTU, MARKET), `${label}: the market's NTU equals what sells still owe`).toBe(base);
  expect(await bal(SGDX, MARKET), `${label}: the market's SGDx equals what buys have locked`).toBe(quote);
}
const snap = async (accounts: readonly Address[]) => Object.fromEntries(await Promise.all(accounts.map(async (a) => [a, { ntu: await bal(NTU, a), sgd: await bal(SGDX, a) }]))) as Record<string, { ntu: bigint; sgd: bigint }>;

/** The state a freshly deployed scratch chain is in, from node reads (not balances). Returns what differs. */
async function dirtiness(): Promise<string[]> {
  const dirty: string[] = [];
  for (const [i, who] of ACCOUNTS.entries()) {
    if ((await allowance(NTU, who)) !== 0n) dirty.push(`account ${i} has a leftover NTU allowance`);
    if ((await allowance(SGDX, who)) !== 0n) dirty.push(`account ${i} has a leftover SGDx allowance`);
    if ((await userIds(who)).length !== 0) dirty.push(`account ${i} already has orders`);
  }
  const b = await best();
  if (b.bid.id !== 0n || b.ask.id !== 0n) dirty.push("the book is not empty");
  if ((await lastTrade()).has) dirty.push("the market already has a trade price");
  return dirty;
}

describe.skipIf(!ENABLED)("stop-limit orders on a real scratch chain (Anvil, unlocked dev accounts; NOT MetaMask)", () => {
  beforeAll(async () => {
    if (!RPC) return;
    if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain. Use a scratch Anvil (for example port 8547).");
    if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
    pub = createPublicClient({ chain: foundry, transport: http(RPC) });
    expect(await pub.getChainId()).toBe(31337);
    const code = await pub.getCode({ address: MARKET });
    expect(code && code !== "0x", "the exported market has no code on this chain: deploy to the scratch chain first").toBe(true);
    expect(await limit(), "MAX_MATCHES_PER_TX is not 10: this suite assumes the engine's default").toBe(10n);
    expect(await simulateTrigger(), "triggerStopOrders must exist in the deployed code and return 0 before any trade").toBe(0n);
    expect(await bal(NTU, KEEPER), "the keeper must hold no NTU").toBe(0n);
    expect(await bal(SGDX, KEEPER), "the keeper must hold no SGDx").toBe(0n);
    const dirty = await dirtiness();
    expect(dirty, `The scratch chain is not in its freshly deployed state: ${dirty.join("; ")}. Restart and redeploy it before running this suite.`).toEqual([]);
  });

  beforeEach(async () => {
    snapshot = (await pub.request({ method: "evm_snapshot" as never })) as string;
    snapshotBlock = await headBlock();
  });
  afterEach(async () => {
    if (!snapshot) return;
    const reverted = await pub.request({ method: "evm_revert" as never, params: [snapshot] as never });
    snapshot = undefined;
    expect(reverted, "evm_revert reported failure").toBe(true);
    expect(await headBlock(), "the head block is not the snapshot's: the revert did not restore the chain").toBe(snapshotBlock);
    const dirty = await dirtiness();
    expect(dirty, `The revert left state behind: ${dirty.join("; ")}`).toEqual([]);
    expect(await simulateTrigger(), "after the revert nothing can be triggered").toBe(0n);
  });

  it("a pending SELL stop through the real runners (approval, then placement): exact escrow, PendingTrigger, outside the book", async () => {
    const before = await snap([ALICE, MARKET]);
    const out = await placeStopAs(ALICE, "sell", "1.8", "1.7", "10");
    expect(out.problems).toEqual([]);
    expect(out.decoded).toMatchObject({ side: "sell", triggerPrice: dec("1.8"), limitPrice: dec("1.7"), amount: dec("10"), escrowBase: dec("10"), escrowQuote: 0n });
    const o = await getOrder(out.decoded.orderId);
    expect(o).toMatchObject({ status: 4, triggerPrice: dec("1.8"), price: dec("1.7"), amount: dec("10"), filled: 0n, lockedQuote: 0n, trader: ALICE });
    const after = await snap([ALICE, MARKET]);
    expect(before[ALICE]!.ntu - after[ALICE]!.ntu).toBe(dec("10"));
    expect(after[MARKET]!.ntu - before[MARKET]!.ntu).toBe(dec("10"));
    expect(await allowance(NTU, ALICE)).toBe(0n); // the exact approval was consumed by the escrow
    expect(await book(SELL)).toEqual([]); // a pending stop is not book liquidity
    expect((await best()).ask.id).toBe(0n);
    await assertSolvent("after a sell stop");
  });

  it("a pending BUY stop: the escrow is requiredQuote at the LIMIT price (not the trigger), rounded up like the engine", async () => {
    const out = await placeStopAs(BOB, "buy", "2.5", "2.6", "4");
    expect(out.problems).toEqual([]);
    const want = (await pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "requiredQuote", args: [dec("4"), dec("2.6")] })) as bigint;
    expect(want).toBe(dec("10.4"));
    expect(out.decoded.escrowQuote).toBe(want);
    expect(await getOrder(out.decoded.orderId)).toMatchObject({ status: 4, lockedQuote: want, triggerPrice: dec("2.5"), price: dec("2.6") });
    expect(want).not.toBe(requiredQuote(dec("4"), dec("2.5")));
    // a ceiling case: 3 lots at a price with a remainder
    const odd = await placeStopAs(BOB, "buy", "1", "0.333333333", "0.000000003");
    const wantOdd = (await pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "requiredQuote", args: [3n * 10n ** 9n, 333333333n * 10n ** 9n] })) as bigint;
    expect(odd.decoded.escrowQuote).toBe(wantOdd);
    expect(wantOdd).toBe(requiredQuote(3n * 10n ** 9n, 333333333n * 10n ** 9n));
    expect(await book(BUY)).toEqual([]);
    await assertSolvent("after buy stops");
  });

  it("before the first trade nothing can trigger: simulate 0, the runner refuses before the wallet, the stop stays pending", async () => {
    const placed = await placeStopAs(ALICE, "sell", "1.8", "1.7", "1");
    expect(await simulateTrigger()).toBe(0n);
    expect((await lastTrade()).has).toBe(false);
    expect(stopState("sell", dec("1.8"), 0n, false).kind).toBe("no-trade-price");
    const r = await triggerAs(KEEPER);
    expect(r.state.failure?.title).toBe("No stop order can be triggered right now");
    expect(r.types).toEqual(["FAILED"]);
    expect((await getOrder(placed.decoded.orderId)).status).toBe(4);
  });

  it("a stop that is NOT eligible stays pending: last trade 2, sell trigger 1.8 waits for a FALL; a buy trigger 2.5 waits for a RISE", async () => {
    await tradeAt("2");
    const s = await placeStopAs(ALICE, "sell", "1.8", "1.7", "1");
    const b = await placeStopAs(DEPLOYER, "buy", "2.5", "2.6", "1");
    expect(stopState("sell", dec("1.8"), dec("2"), true)).toEqual({ kind: "waiting", need: "fall" });
    expect(stopState("buy", dec("2.5"), dec("2"), true)).toEqual({ kind: "waiting", need: "rise" });
    expect(await simulateTrigger()).toBe(0n);
    const r = await triggerAs(KEEPER);
    expect(r.state.failure?.title).toBe("No stop order can be triggered right now");
    expect((await getOrder(s.decoded.orderId)).status).toBe(4);
    expect((await getOrder(b.decoded.orderId)).status).toBe(4);
    await assertSolvent("not eligible");
  });

  it("the EXACT boundary: last trade 1.8 triggers a sell stop at 1.8, but not one at 1.799999999 (one tick lower); activation without a fill rests", async () => {
    await tradeAt("1.8");
    const a = await placeStopAs(ALICE, "sell", "1.8", "1.7", "2");
    const b = await placeStopAs(DEPLOYER, "sell", "1.799999999", "1.7", "2");
    expect(stopState("sell", dec("1.8"), dec("1.8"), true).kind).toBe("eligible");
    expect(stopState("sell", dec("1.799999999"), dec("1.8"), true).kind).toBe("waiting");
    expect(await simulateTrigger()).toBe(1n);
    const out = triggeredOf(await triggerAs(KEEPER));
    expect(out).toMatchObject({ noop: false, simulatedCount: 1n, stillEligible: 0n, crossed: false, totalBase: 0n });
    expect(out.triggered.map((t) => [t.orderId, t.outcome])).toEqual([[a.decoded.orderId, "resting"]]);
    // eligible-but-activated: Open, now on the ask side of the book at its LIMIT price; the other stop still pending
    expect(await getOrder(a.decoded.orderId)).toMatchObject({ status: 0, filled: 0n, price: dec("1.7") });
    expect((await book(SELL)).map((o) => o.id)).toEqual([a.decoded.orderId]);
    expect((await getOrder(b.decoded.orderId)).status).toBe(4);
    await assertSolvent("after an activation without a fill");
  });

  it("activation WITH an immediate fill: the stop is the taker at the resting bid's price; a token-less keeper triggers someone else's stop", async () => {
    await tradeAt("2");
    const stop = await placeStopAs(ALICE, "sell", "2", "1.7", "4"); // eligible at once (last 2 <= trigger 2), still pending
    expect((await getOrder(stop.decoded.orderId)).status).toBe(4);
    await place(BOB, BUY, "1.9", "4"); // a resting bid at 1.9, above the stop's limit 1.7
    expect(await simulateTrigger()).toBe(1n);
    const before = await snap([DEPLOYER, ALICE, BOB, CAROL, KEEPER, MARKET]);
    const out = triggeredOf(await triggerAs(KEEPER));
    const t = out.triggered[0]!;
    expect(t).toMatchObject({ orderId: stop.decoded.orderId, outcome: "filled", tradedBase: dec("4") });
    expect(t.fills[0]).toMatchObject({ takerOrderId: stop.decoded.orderId, price: dec("1.9"), baseAmount: dec("4"), quoteAmount: dec("7.6") });
    expect(out).toMatchObject({ totalBase: dec("4"), totalQuote: dec("7.6"), lastTradeAfter: dec("1.9") });
    const after = await snap([DEPLOYER, ALICE, BOB, CAROL, KEEPER, MARKET]);
    expect(after[ALICE]!.sgd - before[ALICE]!.sgd).toBe(dec("7.6")); // paid at the MAKER's price 1.9, not her limit 1.7
    expect(after[BOB]!.ntu - before[BOB]!.ntu).toBe(dec("4"));
    expect(after[KEEPER]).toEqual(before[KEEPER]); // the keeper neither paid nor received a trading token
    expect(await getOrder(stop.decoded.orderId)).toMatchObject({ status: 2, filled: dec("4") });
    const rc = await pub.getTransactionReceipt({ hash: out.hash });
    expect(rc.from.toLowerCase()).toBe(KEEPER.toLowerCase());
    // an independent decode of the same logs
    const logs = rc.logs.filter((l) => l.address.toLowerCase() === MARKET.toLowerCase());
    expect(parseEventLogs({ abi: orderBookAbi, logs, eventName: "StopOrderTriggered" })).toHaveLength(1);
    expect(parseEventLogs({ abi: orderBookAbi, logs, eventName: "Trade" })).toHaveLength(1);
    await assertSolvent("after an activation with a fill");
  });

  it("activation with a PARTIAL fill: the rest rests at the stop's limit price", async () => {
    await tradeAt("2");
    const stop = await placeStopAs(ALICE, "sell", "2", "1.7", "4");
    await place(BOB, BUY, "1.9", "3");
    const out = triggeredOf(await triggerAs(KEEPER));
    expect(out.triggered[0]).toMatchObject({ outcome: "partly-filled", tradedBase: dec("3") });
    expect(await getOrder(stop.decoded.orderId)).toMatchObject({ status: 1, filled: dec("3"), price: dec("1.7") });
    expect((await book(SELL)).map((o) => [o.id, o.price])).toEqual([[stop.decoded.orderId, dec("1.7")]]);
    await assertSolvent("after a partial fill");
  });

  it("a pending stop CANCELLED before activation (the Bonus 1 runner): the full escrow comes back, it can no longer trigger, history is kept", async () => {
    await tradeAt("2");
    const buy = await placeStopAs(BOB, "buy", "2.5", "2.6", "4");
    const sell = await placeStopAs(ALICE, "sell", "1.8", "1.7", "10");
    const before = await snap([ALICE, BOB, MARKET]);
    const c1 = await cancelAs(ALICE, sell.decoded.orderId);
    expect(c1.failure, JSON.stringify(c1.failure)).toBeUndefined();
    expect(c1.result).toMatchObject({ refundBase: dec("10"), refundQuote: 0n, transferredBase: dec("10"), problems: [] });
    const c2 = await cancelAs(BOB, buy.decoded.orderId);
    expect(c2.result).toMatchObject({ refundQuote: dec("10.4"), transferredQuote: dec("10.4"), problems: [] });
    const after = await snap([ALICE, BOB, MARKET]);
    expect(after[ALICE]!.ntu - before[ALICE]!.ntu).toBe(dec("10"));
    expect(after[BOB]!.sgd - before[BOB]!.sgd).toBe(dec("10.4"));
    expect(after[MARKET]!.ntu).toBe(0n);
    expect(after[MARKET]!.sgd).toBe(0n);
    expect((await getOrder(sell.decoded.orderId)).status).toBe(3);
    expect(await userIds(ALICE)).toContain(sell.decoded.orderId); // still in history
    // someone else cannot cancel it (NotOrderOwner), and it cannot be triggered any more
    const other = await cancelAs(CAROL, buy.decoded.orderId);
    expect(other.failure).toBeDefined();
    expect(await simulateTrigger()).toBe(0n);
    await assertSolvent("after cancelling stops");
  });

  it("several eligible stops in a BOUNDED call: maxCount 2 activates two, a second call the third (head order: buy first, then sells by trigger)", async () => {
    await tradeAt("2");
    const ids: bigint[] = [];
    for (const who of [ALICE, CAROL, DEPLOYER]) ids.push((await placeStopAs(who, "sell", "2", "1.5", "1")).decoded.orderId);
    expect(await simulateTrigger(10n)).toBe(3n);
    expect(await simulateTrigger(2n)).toBe(2n);
    const first = triggeredOf(await triggerAs(KEEPER, 2n));
    expect(first.triggered).toHaveLength(2);
    expect(first.stillEligible).toBe(1n);
    expect((await Promise.all(ids.map((id) => getOrder(id)))).map((o) => o.status).sort()).toEqual([0, 0, 4]);
    const second = triggeredOf(await triggerAs(KEEPER, 2n));
    expect(second.triggered).toHaveLength(1);
    expect(second.stillEligible).toBe(0n);
    expect((await Promise.all(ids.map((id) => getOrder(id)))).map((o) => o.status)).toEqual([0, 0, 0]);
    await assertSolvent("after bounded calls");
  });

  it("a stop that CANNOT be inserted (101 orders rank ahead) is AUTO-CANCELLED and refunded at activation, reported as the engine's cancel, not a fill", async () => {
    await tradeAt("1.5");
    const stop = await placeStopAs(ALICE, "sell", "1.8", "1.7", "1"); // eligible: last 1.5 <= trigger 1.8
    await approve(BOB, NTU, dec("101"));
    for (let i = 0; i < 101; i++) await send(BOB, MARKET, orderBookAbi, "placeLimitOrder", [SELL, dec("1.6"), dec("1")]); // 101 asks, all ahead of limit 1.7
    expect((await book(SELL)).length).toBe(101);
    const before = await snap([ALICE, MARKET]);
    const out = triggeredOf(await triggerAs(KEEPER));
    const t = out.triggered[0]!;
    expect(t).toMatchObject({ orderId: stop.decoded.orderId, outcome: "auto-cancelled", refundBase: dec("1"), tradedBase: 0n });
    expect(await getOrder(stop.decoded.orderId)).toMatchObject({ status: 3, filled: 0n });
    const after = await snap([ALICE, MARKET]);
    expect(after[ALICE]!.ntu - before[ALICE]!.ntu).toBe(dec("1")); // refunded in full
    expect(before[MARKET]!.ntu - after[MARKET]!.ntu).toBe(dec("1"));
    expect((await book(SELL)).length).toBe(101); // the stop never entered the book
    // P2-8C: the history read tells an ENGINE cancel (same transaction as the trigger) from an owner cancel
    const hist = await readStopHistory(pub, MARKET, [stop.decoded.orderId], BigInt(D.deployBlock));
    expect(hist.status).toBe("ok");
    const cls = classifyStop({ order: await getOrder(stop.decoded.orderId), snapshot: undefined, history: hist });
    expect(cls.kind).toBe("engine-cancelled-at-activation");
    expect(cls.text).not.toMatch(/you cancelled/i);
    await assertSolvent("after an auto-cancel");
  });

  it("stop history from the REAL chain (P2-8C): cancelled before activation, activated and filled, activated then cancelled by its owner; one bounded request; unreadable history is neutral", async () => {
    await tradeAt("2");
    const fromBlock = BigInt(D.deployBlock);
    // 1. cancelled while pending: it never activated
    const cancelled = await placeStopAs(ALICE, "sell", "1.8", "1.7", "1");
    await cancelAs(ALICE, cancelled.decoded.orderId);
    // 2. activated and filled against a resting bid, by a token-less keeper
    const filled = await placeStopAs(ALICE, "sell", "2", "1.5", "1");
    await place(BOB, BUY, "1.9", "1");
    triggeredOf(await triggerAs(KEEPER));
    expect((await getOrder(filled.decoded.orderId)).status).toBe(2);
    // 3. activated but nobody bids at its limit: it rests, then its owner cancels it
    const rested = await placeStopAs(ALICE, "sell", "2", "2.5", "1");
    triggeredOf(await triggerAs(KEEPER));
    expect((await getOrder(rested.decoded.orderId)).status).toBe(0);
    await cancelAs(ALICE, rested.decoded.orderId);
    const ids = [cancelled, filled, rested].map((o) => o.decoded.orderId);

    let requests = 0;
    const counting = { request: ((a: unknown) => (requests++, (pub.request as (x: unknown) => Promise<unknown>)(a))) as PublicClient["request"] };
    const hist = await readStopHistory(counting, MARKET, ids, fromBlock);
    expect(requests, "one eth_getLogs for all three orders").toBe(1);
    expect(hist.status).toBe("ok");
    const kind = async (id: bigint, h = hist) => classifyStop({ order: await getOrder(id), snapshot: undefined, history: h }).kind;
    expect(await kind(cancelled.decoded.orderId)).toBe("cancelled-before-activation");
    expect(await kind(filled.decoded.orderId)).toBe("activated-filled");
    expect(await kind(rested.decoded.orderId)).toBe("activated-then-cancelled");
    expect(Object.keys(hist.triggered).sort()).toEqual([filled, rested].map((o) => o.decoded.orderId.toString()).sort());
    expect(hist.triggered[cancelled.decoded.orderId.toString()], "no StopOrderTriggered exists for the stop cancelled while pending").toBeUndefined();

    // an RPC failure never becomes "never activated": the history is unavailable and the wording is neutral
    const broken = await readStopHistory({ request: (async () => { throw new Error("rpc down"); }) as PublicClient["request"] }, MARKET, ids, fromBlock);
    expect(broken).toEqual(UNREAD_HISTORY);
    expect(await kind(cancelled.decoded.orderId, broken)).toBe("cancelled-unknown");
    // a request bounded to the stops' own lifetime still finds them (fromBlock = the block they were placed in, not the chain's start)
    const placedAt = (await pub.getContractEvents({ address: MARKET, abi: orderBookAbi, eventName: "StopOrderPlaced", args: { orderId: ids }, fromBlock }))
      .map((l) => l.blockNumber as bigint)
      .reduce((a, b) => (a < b ? a : b));
    const narrow = await readStopHistory(pub, MARKET, ids, placedAt);
    expect(narrow).toEqual(hist);
    await assertSolvent("after the history scenarios");
  });

  it("activation hits the shared 10-fill budget and leaves a CROSSED book, which Bonus 2's matchOrders then clears", async () => {
    await tradeAt("2");
    const stop = await placeStopAs(ALICE, "sell", "2", "1.5", "15"); // eligible at once
    await approve(BOB, SGDX, dec("20"));
    await approve(CAROL, SGDX, dec("10"));
    for (let i = 0; i < 10; i++) await send(BOB, MARKET, orderBookAbi, "placeLimitOrder", [BUY, dec("2"), dec("1")]);
    for (let i = 0; i < 5; i++) await send(CAROL, MARKET, orderBookAbi, "placeLimitOrder", [BUY, dec("2"), dec("1")]); // 15 bids of 1 NTU at 2
    const out = triggeredOf(await triggerAs(KEEPER));
    expect(out.triggered[0]).toMatchObject({ orderId: stop.decoded.orderId, outcome: "partly-filled", tradedBase: dec("10") });
    expect(out.crossed).toBe(true); // the remainder (5 NTU at 1.5) crosses the 5 bids left at 2
    expect(await getOrder(stop.decoded.orderId)).toMatchObject({ status: 1, filled: dec("10") });
    const m = await matchAs(KEEPER);
    expect(m.failure, JSON.stringify(m.failure)).toBeUndefined();
    expect(m.result!.problems).toEqual([]);
    expect(m.result!.fills).toHaveLength(5);
    expect(await getOrder(stop.decoded.orderId)).toMatchObject({ status: 2, filled: dec("15") });
    expect((await best()).bid.id).toBe(0n);
    await assertSolvent("after the stop and the match");
  });
});
