/**
 * Cancellation against a REAL local chain: the same runner the UI uses (`runCancel`: simulate, sign, receipt wait,
 * decode, reconcile) driven with Anvil's unlocked dev accounts through viem, against the deployed contracts and the
 * merged engine (cancelOrder implemented, including pending stop orders).
 *
 * This is NOT MetaMask and NOT a browser. Same safety rules as the other integration suites: it mutates the chain, so it
 * only runs when explicitly enabled, refuses port 8545, and wraps every test in evm_snapshot / evm_revert:
 *   E2E_RPC_URL=http://127.0.0.1:8546 E2E_ALLOW_MUTATE=1 npx vitest run --no-file-parallelism lib/cancel.integration.test.ts
 *
 * Initial state is CHECKED, not assumed (a leftover allowance on a reused scratch chain once broke a browser suite,
 * docs/ai-audit/test-evidence/person2/p2-8b01-preflight.md): the test accounts must have no allowance for the market
 * and no orders. Restart and redeploy the scratch chain if this fails.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { foundry } from "viem/chains";
import { demoTokenAbi, orderBookAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { runCancel, type CancelOutcome } from "./cancel-runner";
import { flowReducer, initialFlowState, type FlowContext, type FlowEvent, type FlowState } from "./order-flow";
import { viemDeps, type ContractCall } from "./order-runner";
import { canCancel, collateralHeld, expectedRefund, type OrderSnapshot } from "./order-status";
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
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address; // funded 10,000 NTU + SGDx by Deploy.s.sol
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const BUY = 0;
const SELL = 1;

let pub: PublicClient;
let snapshot: string | undefined;

const walletFor = (account: Address) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const depsFor = (account: Address, rewrite?: (call: ContractCall) => ContractCall) =>
  viemDeps(pub, async (req) => {
    const call = rewrite ? rewrite(req as ContractCall) : (req as ContractCall);
    return walletFor(account).writeContract({ address: call.address, abi: call.abi, functionName: call.functionName, args: call.args, account, chain: foundry } as never);
  });

const bal = (token: Address, who: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
const getOrder = (id: bigint) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getOrder", args: [id] }) as Promise<OrderSnapshot>;
const allowance = (token: Address, owner: Address) => pub.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [owner, MARKET] }) as Promise<bigint>;
const book = (side: number) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getBook", args: [side, 50n] }) as Promise<OrderSnapshot[]>;
const ids = (who: Address) => pub.readContract({ address: MARKET, abi: orderBookAbi, functionName: "getUserOrderIds", args: [who] }) as Promise<bigint[]>;

async function send(account: Address, address: Address, abi: typeof orderBookAbi | typeof demoTokenAbi, functionName: string, args: readonly unknown[]): Promise<Hex> {
  const { request } = await pub.simulateContract({ account, address, abi, functionName, args } as never);
  const hash = await walletFor(account).writeContract(request as never);
  const rc = await pub.waitForTransactionReceipt({ hash });
  expect(rc.status).toBe("success");
  return hash;
}
const approve = (account: Address, token: Address, amount: bigint) => send(account, token, demoTokenAbi, "approve", [MARKET, amount]);
/** Places a limit order the plain way (exact approval, then the order) and returns its id. */
async function place(account: Address, side: number, price: string, amount: string): Promise<bigint> {
  const p = dec(price);
  const a = dec(amount);
  await approve(account, side === BUY ? SGDX : NTU, side === BUY ? requiredQuote(a, p) : a);
  const before = (await ids(account)).length;
  await send(account, MARKET, orderBookAbi, "placeLimitOrder", [side, p, a]);
  const after = await ids(account);
  expect(after.length).toBe(before + 1);
  return after[after.length - 1]!;
}
async function placeStop(account: Address, side: number, trigger: string, limit: string, amount: string): Promise<bigint> {
  const l = dec(limit);
  const a = dec(amount);
  await approve(account, side === BUY ? SGDX : NTU, side === BUY ? requiredQuote(a, l) : a);
  await send(account, MARKET, orderBookAbi, "placeStopLimitOrder", [side, dec(trigger), l, a]);
  const all = await ids(account);
  return all[all.length - 1]!;
}

const ctxFor = (account: Address): FlowContext => ({ account, chainId: 31337, market: MARKET });
let attemptCounter = 0;

/** Drives one cancellation through the real reducer, exactly as `useCancelFlow` does, and returns the final state. */
async function cancelAs(account: Address, orderId: bigint, rewrite?: (call: ContractCall) => ContractCall) {
  const attempt = ++attemptCounter;
  const ctx = ctxFor(account);
  let state: FlowState<CancelOutcome> = flowReducer(initialFlowState<CancelOutcome>(), { type: "START_ORDER", attempt, ctx });
  const events: FlowEvent<CancelOutcome>[] = [];
  await runCancel(
    depsFor(account, rewrite),
    { ctx, pair: { market: MARKET, baseToken: NTU, quoteToken: SGDX }, orderId, attempt },
    (e) => {
      events.push(e);
      state = flowReducer(state, e);
    },
    () => true,
  );
  return { state, types: events.map((e) => e.type) };
}
const doneOf = (r: Awaited<ReturnType<typeof cancelAs>>) => {
  expect(r.state.failure, JSON.stringify(r.state.failure)).toBeUndefined();
  expect(r.state.phase).toBe("done");
  return r.state.result!;
};

describe.skipIf(!ENABLED)("order cancellation on a real scratch chain (Anvil, unlocked dev accounts; NOT MetaMask)", () => {
  beforeAll(async () => {
    if (!RPC) return;
    if (new URL(RPC).port === "8545") throw new Error("Refusing to run: 8545 is the developer's own chain. Use a scratch Anvil (for example port 8546).");
    if (process.env.E2E_ALLOW_MUTATE !== "1") throw new Error("Refusing to run: set E2E_ALLOW_MUTATE=1 to confirm this chain may be mutated.");
    pub = createPublicClient({ chain: foundry, transport: http(RPC) });
    expect(await pub.getChainId()).toBe(31337);
    const code = await pub.getCode({ address: MARKET });
    expect(code && code !== "0x", "the exported market has no code on this chain: deploy to the scratch chain first").toBe(true);

    // Initial state is verified, not assumed.
    const dirty: string[] = [];
    for (const [name, who] of [["Alice", ALICE], ["Bob", BOB], ["Carol", CAROL]] as const) {
      if ((await allowance(NTU, who)) !== 0n) dirty.push(`${name} has a leftover NTU allowance for the market`);
      if ((await allowance(SGDX, who)) !== 0n) dirty.push(`${name} has a leftover SGDx allowance for the market`);
      if ((await ids(who)).length !== 0) dirty.push(`${name} already has orders on the market`);
    }
    expect(dirty, `The scratch chain is not in its freshly deployed state: ${dirty.join("; ")}. Restart and redeploy it before running this suite.`).toEqual([]);
  });

  beforeEach(async () => {
    snapshot = (await pub.request({ method: "evm_snapshot" as never })) as string;
  });
  afterEach(async () => {
    if (snapshot) await pub.request({ method: "evm_revert" as never, params: [snapshot] as never });
  });

  it("cancels an open sell: exact base refund, balances restored, escrow gone, order kept as history", async () => {
    const start = { alice: await bal(NTU, ALICE), market: await bal(NTU, MARKET) };
    const id = await place(ALICE, SELL, "2", "100");
    const listed = await getOrder(id);
    expect(canCancel(listed, ALICE)).toBe(true);
    expect(expectedRefund(listed)).toEqual({ token: "base", amount: dec("100") });
    expect(await bal(NTU, MARKET)).toBe(start.market + dec("100"));

    const out = doneOf(await cancelAs(ALICE, id));
    expect(out).toMatchObject({ orderId: id, side: "sell", refundBase: dec("100"), refundQuote: 0n, transferredBase: dec("100"), problems: [] });
    expect(await bal(NTU, ALICE)).toBe(start.alice); // exactly what she had before placing
    expect(await bal(NTU, MARKET)).toBe(start.market); // nothing left in escrow
    const after = await getOrder(id);
    expect(after.status).toBe(3);
    expect(collateralHeld(after)).toEqual({ token: "base", amount: 0n });
    expect((await book(SELL)).some((o) => o.id === id)).toBe(false); // no longer book liquidity
    expect(await ids(ALICE)).toContain(id); // still in history
    expect(canCancel(after, ALICE)).toBe(false);
  });

  it("cancels a partly filled sell: refund is exactly amount minus filled; the fills stay", async () => {
    const aliceNtu0 = await bal(NTU, ALICE);
    const aliceSgd0 = await bal(SGDX, ALICE);
    const id = await place(ALICE, SELL, "2", "100");
    await place(BOB, BUY, "2", "40"); // fills 40 at 2
    const partly = await getOrder(id);
    expect(partly).toMatchObject({ status: 1, filled: dec("40") });
    expect(expectedRefund(partly)).toEqual({ token: "base", amount: dec("60") });

    const out = doneOf(await cancelAs(ALICE, id));
    expect(out).toMatchObject({ refundBase: dec("60"), refundQuote: 0n, transferredBase: dec("60"), problems: [] });
    expect(out.before.filled).toBe(dec("40"));
    expect(await bal(NTU, ALICE)).toBe(aliceNtu0 - dec("40")); // sold 40, got 60 back
    expect(await bal(SGDX, ALICE)).toBe(aliceSgd0 + dec("80")); // paid 80 at the maker price, untouched by the cancel
    expect(await bal(NTU, MARKET)).toBe(0n);
    expect(await bal(SGDX, MARKET)).toBe(0n);
    expect((await getOrder(id)).filled).toBe(dec("40"));
  });

  it("cancels an open buy: the refund is exactly its lockedQuote (the engine's ceiling), in quote", async () => {
    const bobSgd0 = await bal(SGDX, BOB);
    const id = await place(BOB, BUY, "1.9", "5");
    const open = await getOrder(id);
    expect(open.lockedQuote).toBe(requiredQuote(dec("5"), dec("1.9")));
    expect(expectedRefund(open)).toEqual({ token: "quote", amount: open.lockedQuote });

    const out = doneOf(await cancelAs(BOB, id));
    expect(out).toMatchObject({ side: "buy", refundBase: 0n, refundQuote: open.lockedQuote, transferredQuote: open.lockedQuote, problems: [] });
    expect(await bal(SGDX, BOB)).toBe(bobSgd0); // every quote token is back
    expect(await bal(SGDX, MARKET)).toBe(0n);
    expect((await getOrder(id)).lockedQuote).toBe(0n);
    expect((await book(BUY)).some((o) => o.id === id)).toBe(false);
  });

  it("cancels a partly filled buy: the refund is the REMAINING lockedQuote, not the original escrow", async () => {
    const bobSgd0 = await bal(SGDX, BOB);
    await place(ALICE, SELL, "2", "4");
    const id = await place(BOB, BUY, "2.2", "10"); // fills 4 at the maker price 2, rests 6 at 2.2
    const partly = await getOrder(id);
    expect(partly).toMatchObject({ status: 1, filled: dec("4") });
    expect(partly.lockedQuote).toBe(requiredQuote(dec("6"), dec("2.2")));
    expect(await bal(SGDX, BOB)).toBe(bobSgd0 - dec("8") - partly.lockedQuote);

    const out = doneOf(await cancelAs(BOB, id));
    expect(out).toMatchObject({ refundQuote: partly.lockedQuote, transferredQuote: partly.lockedQuote, problems: [] });
    expect(await bal(SGDX, BOB)).toBe(bobSgd0 - dec("8")); // only the 4 NTU she actually bought were paid for
    expect(await bal(SGDX, MARKET)).toBe(0n);
  });

  it("cancels a pending SELL stop order: full escrow back, never on the book", async () => {
    const aliceNtu0 = await bal(NTU, ALICE);
    const id = await placeStop(ALICE, SELL, "1.8", "1.7", "10");
    const pending = await getOrder(id);
    expect(pending.status).toBe(4);
    expect(pending.triggerPrice).toBe(dec("1.8"));
    expect(canCancel(pending, ALICE)).toBe(true);
    expect(collateralHeld(pending)).toEqual({ token: "base", amount: dec("10") });
    expect((await book(SELL)).some((o) => o.id === id)).toBe(false); // a pending stop is not book liquidity

    const out = doneOf(await cancelAs(ALICE, id));
    expect(out).toMatchObject({ side: "sell", refundBase: dec("10"), transferredBase: dec("10"), problems: [] });
    expect(out.before.status).toBe(4);
    expect(await bal(NTU, ALICE)).toBe(aliceNtu0);
    expect(await bal(NTU, MARKET)).toBe(0n);
    expect((await getOrder(id)).status).toBe(3);
    expect(await ids(ALICE)).toContain(id);
  });

  it("cancels a pending BUY stop order: the full quote escrow (at the limit price) comes back", async () => {
    const carolSgd0 = await bal(SGDX, CAROL);
    const id = await placeStop(CAROL, BUY, "5", "2.5", "1");
    const pending = await getOrder(id);
    expect(pending).toMatchObject({ status: 4, lockedQuote: dec("2.5") });
    const out = doneOf(await cancelAs(CAROL, id));
    expect(out).toMatchObject({ side: "buy", refundQuote: dec("2.5"), transferredQuote: dec("2.5"), problems: [] });
    expect(await bal(SGDX, CAROL)).toBe(carolSgd0);
  });

  it("rejects a non-owner: NotOrderOwner by name, nothing sent, nothing moved, the order stays open", async () => {
    const id = await place(ALICE, SELL, "2", "10");
    const bobNtu = await bal(NTU, BOB);
    const market = await bal(NTU, MARKET);
    const r = await cancelAs(BOB, id);
    expect(r.state.phase).toBe("failed");
    expect(r.state.failure).toMatchObject({ kind: "reverted", errorName: "NotOrderOwner", title: "This is not your order" });
    expect(r.types).not.toContain("ORDER_SUBMITTED"); // the wallet was never asked
    expect(await bal(NTU, BOB)).toBe(bobNtu);
    expect(await bal(NTU, MARKET)).toBe(market);
    expect((await getOrder(id)).status).toBe(0);
  });

  it("an order number the engine never used reports NotOrderOwner too", async () => {
    const r = await cancelAs(ALICE, 987_654n);
    expect(r.state.failure).toMatchObject({ kind: "reverted", errorName: "NotOrderOwner" });
    expect(r.types).not.toContain("ORDER_SUBMITTED");
  });

  it("rejects a filled order and an already cancelled order with OrderNotActive", async () => {
    const sell = await place(ALICE, SELL, "2", "10");
    const buy = await place(BOB, BUY, "2", "10"); // fills both completely
    expect((await getOrder(sell)).status).toBe(2);
    expect(canCancel(await getOrder(sell), ALICE)).toBe(false);
    for (const [who, id] of [[ALICE, sell], [BOB, buy]] as const) {
      const r = await cancelAs(who, id);
      expect(r.state.failure).toMatchObject({ kind: "reverted", errorName: "OrderNotActive", title: "This order can no longer be cancelled" });
      expect(r.types).not.toContain("ORDER_SUBMITTED");
    }
    const open = await place(ALICE, SELL, "3", "5");
    doneOf(await cancelAs(ALICE, open));
    const again = await cancelAs(ALICE, open);
    expect(again.state.failure).toMatchObject({ kind: "reverted", errorName: "OrderNotActive" });
  });

  it("a transaction that cancels a DIFFERENT order is not reported as the requested cancellation", async () => {
    const first = await place(ALICE, SELL, "2", "10");
    const second = await place(ALICE, SELL, "3", "10");
    // The wallet (a stand-in for a replaced transaction) sends cancelOrder(second) although `first` was requested.
    const r = await cancelAs(ALICE, first, (call) => ({ ...call, args: [second] }));
    expect(r.state.phase).toBe("failed");
    expect(r.state.failure).toMatchObject({ kind: "unknown", title: "Confirmed, but the cancellation could not be verified" });
    expect(r.state.result).toBeUndefined();
    expect((await getOrder(first)).status).toBe(0); // the requested order is still open
    expect((await getOrder(second)).status).toBe(3); // the other one really was cancelled: the UI re-reads and shows it
  });

  it("the refund the ticket expects equals the refund the chain pays, for every cancellable shape", async () => {
    const shapes: { label: string; make: () => Promise<{ id: bigint; who: Address }> }[] = [
      { label: "open sell", make: async () => ({ id: await place(ALICE, SELL, "4", "7"), who: ALICE }) },
      { label: "open buy", make: async () => ({ id: await place(BOB, BUY, "1.1", "3"), who: BOB }) },
      { label: "sell stop", make: async () => ({ id: await placeStop(ALICE, SELL, "1.5", "1.4", "2"), who: ALICE }) },
      { label: "buy stop", make: async () => ({ id: await placeStop(CAROL, BUY, "6", "3.3", "2"), who: CAROL }) },
    ];
    for (const s of shapes) {
      const { id, who } = await s.make();
      const expected = expectedRefund(await getOrder(id));
      const out = doneOf(await cancelAs(who, id));
      const paid = expected?.token === "base" ? out.refundBase : out.refundQuote;
      expect(paid, s.label).toBe(expected?.amount);
      expect(out.problems, s.label).toEqual([]);
    }
    expect(await bal(NTU, MARKET)).toBe(0n);
    expect(await bal(SGDX, MARKET)).toBe(0n);
  });
});
