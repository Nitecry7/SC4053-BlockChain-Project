import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import type { ChainAnchor } from "./chain-reset";
import { runCancel, type CancelDeps, type CancelOutcome } from "./cancel-runner";
import type { FlowContext, FlowEvent, FlowState } from "./order-flow";
import { flowReducer, initialFlowState } from "./order-flow";
import type { ContractCall, ReceiptLike } from "./order-runner";
import type { OrderSnapshot } from "./order-status";
import { BOB, EVIL, MARKET, NTU, SGDX, dec, orderCancelled, orderPlaced, resetLogIndex, transfer } from "./test-logs";

// FAKE chain and wallet: these tests pin the orchestration order, the verification and the failure wording of the
// cancel runner. cancel.integration.test.ts runs the same code against a scratch Anvil.

const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };
const ctx: FlowContext = { account: BOB, chainId: 31337, market: MARKET };
const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;
const timeoutErr = () => Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });
const rpcRejected = () => Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 });
const named = (errorName: string) =>
  Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName } }) });
const anchor: ChainAnchor = { genesisHash: H(100), blockNumber: 9n, blockHash: H(109) };

const order = (over: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: 1n,
  trader: BOB,
  side: 1,
  price: dec("2"),
  triggerPrice: 0n,
  amount: dec("10"),
  filled: 0n,
  lockedQuote: 0n,
  createdAt: 1n,
  status: 0,
  ...over,
});
const cancelled = (o: OrderSnapshot): OrderSnapshot => ({ ...o, status: 3, lockedQuote: 0n });

function receiptFor(refundBase: bigint, refundQuote: bigint, over: Partial<ReceiptLike> = {}, id = 1n): ReceiptLike {
  resetLogIndex();
  const logs = [orderCancelled(MARKET, id, BOB, refundBase, refundQuote)];
  if (refundBase > 0n) logs.push(transfer(NTU, MARKET, BOB, refundBase));
  if (refundQuote > 0n) logs.push(transfer(SGDX, MARKET, BOB, refundQuote));
  return { transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 54_000n, logs, ...over };
}

type Calls = { simulate: { call: ContractCall; block?: bigint }[]; write: ContractCall[]; waits: number; reads: (bigint | undefined)[] };
function fakeDeps(before: OrderSnapshot, receipt: ReceiptLike, over: Partial<CancelDeps> = {}): { deps: CancelDeps; calls: Calls } {
  const calls: Calls = { simulate: [], write: [], waits: 0, reads: [] };
  const deps: CancelDeps = {
    simulate: async (call, _a, block) => void calls.simulate.push({ call, block }),
    write: async (call) => {
      calls.write.push(call);
      return H(1);
    },
    waitForReceipt: async () => {
      calls.waits++;
      return receipt;
    },
    // block - 1 is the order before the cancellation; the receipt block and "now" read the cancelled order.
    readOrder: async (_m, _id, block) => {
      calls.reads.push(block);
      return block !== undefined && block < receipt.blockNumber ? before : cancelled(before);
    },
    ...over,
  };
  return { deps, calls };
}

async function run(deps: CancelDeps, opts: { current?: () => boolean; windowMs?: number; maxWindows?: number; orderId?: bigint } = {}) {
  const events: FlowEvent<CancelOutcome>[] = [];
  const start: FlowState<CancelOutcome> = flowReducer(initialFlowState<CancelOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
  await runCancel(deps, { ctx, pair, orderId: opts.orderId ?? 1n, attempt: 1, windowMs: opts.windowMs, maxWindows: opts.maxWindows }, (e) => events.push(e), opts.current ?? (() => true));
  const final = events.reduce(flowReducer<CancelOutcome>, start);
  return { events, final, types: events.map((e) => e.type) };
}

describe("runCancel: success needs the receipt, the event and the chain", () => {
  it("cancels an open sell: simulate, one wallet request, no approval, exact base refund", async () => {
    const { deps, calls } = fakeDeps(order(), receiptFor(dec("10"), 0n));
    const r = await run(deps);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "RECONCILED"]);
    expect(calls.simulate).toHaveLength(1);
    expect(calls.simulate[0]!.call).toMatchObject({ address: MARKET, functionName: "cancelOrder", args: [1n] });
    expect(calls.write).toHaveLength(1);
    expect(calls.write.map((c) => c.functionName)).toEqual(["cancelOrder"]); // never an approve
    expect(r.final.phase).toBe("done");
    expect(r.final.result).toMatchObject({ orderId: 1n, side: "sell", refundBase: dec("10"), refundQuote: 0n, transferredBase: dec("10"), problems: [], hash: H(1) });
    expect(r.final.result?.expected).toEqual({ token: "base", amount: dec("10") });
    expect(r.final.result?.after.status).toBe(3);
  });

  it("reads the order in the block BEFORE the cancellation, and in the receipt block", async () => {
    const { deps, calls } = fakeDeps(order(), receiptFor(dec("10"), 0n));
    await run(deps);
    expect(calls.reads).toContain(4n);
    expect(calls.reads).toContain(5n);
    expect(calls.reads).toContain(undefined);
  });

  it("a partly filled sell refunds exactly amount minus filled", async () => {
    const before = order({ amount: dec("100"), filled: dec("40"), status: 1 });
    const { deps } = fakeDeps(before, receiptFor(dec("60"), 0n));
    const r = await run(deps);
    expect(r.final.result).toMatchObject({ refundBase: dec("60"), refundQuote: 0n, problems: [] });
    expect(r.final.result?.expected).toEqual({ token: "base", amount: dec("60") });
  });

  it("a partly filled buy refunds exactly its remaining lockedQuote, in the quote token", async () => {
    const before = order({ side: 0, amount: dec("10"), filled: dec("4"), lockedQuote: dec("13.2"), status: 1 });
    const { deps } = fakeDeps(before, receiptFor(0n, dec("13.2")));
    const r = await run(deps);
    expect(r.final.result).toMatchObject({ side: "buy", refundBase: 0n, refundQuote: dec("13.2"), transferredQuote: dec("13.2"), problems: [] });
    expect(r.final.result?.expected).toEqual({ token: "quote", amount: dec("13.2") });
  });

  it("an open buy refunds its whole locked quote", async () => {
    const before = order({ side: 0, amount: dec("4"), lockedQuote: dec("8.8") });
    const { deps } = fakeDeps(before, receiptFor(0n, dec("8.8")));
    expect((await run(deps)).final.result).toMatchObject({ refundQuote: dec("8.8"), problems: [] });
  });

  it("a pending stop order (status 4) is cancelled the same way and refunds its full escrow", async () => {
    const sellStop = order({ triggerPrice: dec("1.8"), price: dec("1.7"), amount: dec("10"), status: 4 });
    const a = await run(fakeDeps(sellStop, receiptFor(dec("10"), 0n)).deps);
    expect(a.final.phase).toBe("done");
    expect(a.final.result).toMatchObject({ refundBase: dec("10"), problems: [] });
    const buyStop = order({ side: 0, triggerPrice: dec("5"), price: dec("2.5"), amount: dec("1"), lockedQuote: dec("2.5"), status: 4 });
    const b = await run(fakeDeps(buyStop, receiptFor(0n, dec("2.5"))).deps);
    expect(b.final.result).toMatchObject({ refundQuote: dec("2.5"), problems: [] });
  });

  it("follows a speed-up to the re-priced hash and reports that one", async () => {
    const { deps } = fakeDeps(order(), receiptFor(dec("10"), 0n), {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", H(2));
        return receiptFor(dec("10"), 0n, { transactionHash: H(2) });
      },
    });
    const r = await run(deps);
    expect(r.types).toContain("HASH_REPLACED");
    expect(r.final.result?.hash).toBe(H(2));
  });

  it("a refund that differs from the order's unfilled amount is reported as a problem, not as a clean success", async () => {
    const { deps } = fakeDeps(order(), receiptFor(dec("9"), 0n));
    const r = await run(deps);
    expect(r.final.phase).toBe("done");
    expect(r.final.result?.problems.join(" ")).toMatch(/refund in the OrderCancelled event differs/);
  });

  it("tokens that did not move as the event says are reported", async () => {
    resetLogIndex();
    const receipt: ReceiptLike = { transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 1n, logs: [orderCancelled(MARKET, 1n, BOB, dec("10"), 0n)] }; // no Transfer
    const r = await run(fakeDeps(order(), receipt).deps);
    expect(r.final.result?.problems.join(" ")).toMatch(/tokens that moved to you differ/);
  });

  it("an order that does not read Cancelled in the receipt block is reported", async () => {
    const { deps } = fakeDeps(order(), receiptFor(dec("10"), 0n), { readOrder: async () => order() });
    const r = await run(deps);
    expect(r.final.result?.problems.join(" ")).toMatch(/does not read Cancelled/);
  });
});

describe("runCancel: failures never claim success", () => {
  it("NotOrderOwner in the simulation is named and never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(order(), receiptFor(0n, 0n), { simulate: async () => Promise.reject(named("NotOrderOwner")) });
    const r = await run(deps);
    expect(calls.write).toHaveLength(0);
    expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: "NotOrderOwner", title: "This is not your order", step: "order" });
    expect(r.final.result).toBeUndefined();
  });

  it("OrderNotActive (filled or already cancelled) is named and never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(order(), receiptFor(0n, 0n), { simulate: async () => Promise.reject(named("OrderNotActive")) });
    const r = await run(deps);
    expect(calls.write).toHaveLength(0);
    expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: "OrderNotActive", title: "This order can no longer be cancelled" });
  });

  it("a wallet rejection is a rejection: nothing waits, nothing is claimed", async () => {
    const { deps, calls } = fakeDeps(order(), receiptFor(dec("10"), 0n), { write: async () => Promise.reject(rpcRejected()) });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "rejected" });
    expect(calls.waits).toBe(0);
    expect(r.final.result).toBeUndefined();
  });

  it("a mined receipt without OrderCancelled for this order is not a cancellation", async () => {
    resetLogIndex();
    const noEvent: ReceiptLike = { transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 1n, logs: [orderPlaced(MARKET, 9n, BOB, 1, dec("2"), dec("1"))] };
    const r = await run(fakeDeps(order(), noEvent).deps);
    expect(r.final.failure).toMatchObject({ kind: "unknown", title: "Confirmed, but the cancellation could not be verified" });
    expect(r.final.result).toBeUndefined();
  });

  it("an OrderCancelled for a different order, trader or market is not accepted", async () => {
    const otherOrder = receiptFor(dec("10"), 0n, {}, 7n);
    expect((await run(fakeDeps(order(), otherOrder).deps)).final.result).toBeUndefined();
    resetLogIndex();
    const otherTrader: ReceiptLike = { ...receiptFor(0n, 0n), logs: [orderCancelled(MARKET, 1n, EVIL, dec("10"), 0n)] };
    expect((await run(fakeDeps(order(), otherTrader).deps)).final.failure?.kind).toBe("unknown");
    resetLogIndex();
    const otherMarket: ReceiptLike = { ...receiptFor(0n, 0n), logs: [orderCancelled(EVIL, 1n, BOB, dec("10"), 0n)] };
    expect((await run(fakeDeps(order(), otherMarket).deps)).final.failure?.kind).toBe("unknown");
  });

  it("a transaction mined as reverted is a failure and says the order was not cancelled", async () => {
    const { deps, calls } = fakeDeps(order(), receiptFor(0n, 0n, { status: "reverted", logs: [] }), {
      simulate: async (call, _a, block) => {
        calls.simulate.push({ call, block });
        if (block !== undefined) throw named("OrderNotActive");
      },
    });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "reverted", hash: H(1) });
    expect(r.final.failure?.title).toMatch(/Reverted on-chain: This order can no longer be cancelled/);
    expect(r.final.failure?.detail).toMatch(/not cancelled/i);
    expect(r.final.result).toBeUndefined();
  });

  it("a REPLACED cancel fails under the replacement's hash and says this cancellation did not happen (no 'ordered' wording)", async () => {
    const { deps } = fakeDeps(order(), receiptFor(0n, 0n), {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("replaced", H(5));
        return receiptFor(0n, 0n, { transactionHash: H(5), logs: [] });
      },
    });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "replaced", hash: H(5), title: "The cancel request was replaced" });
    expect(r.final.failure?.detail).toMatch(/did not happen/);
    expect(r.final.failure?.detail).not.toMatch(/ordered|place the order/i);
    expect(r.final.result).toBeUndefined();
  });

  it("a CANCELLED cancel request fails under the cancelling hash and the order may still be open", async () => {
    const { deps } = fakeDeps(order(), receiptFor(0n, 0n), {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("cancelled", H(6));
        return receiptFor(0n, 0n, { transactionHash: H(6), logs: [] });
      },
    });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "cancelled", hash: H(6), title: "The cancel request was itself cancelled" });
    expect(r.final.failure?.detail).toMatch(/may still be open/);
    expect(r.final.result).toBeUndefined();
  });

  it("a confirmed chain reset ends the wait with cancel-specific wording and never success", async () => {
    let waits = 0;
    const { deps } = fakeDeps(order(), receiptFor(dec("10"), 0n), {
      readChainAnchor: async () => anchor,
      inspectChain: async () => ({ verdict: { verdict: "reset", evidence: ["the genesis block hash changed"] } }),
      waitForReceipt: async () => (waits++, Promise.reject(timeoutErr())),
    });
    const r = await run(deps, { maxWindows: 3 });
    expect(waits).toBe(1);
    expect(r.final.failure).toMatchObject({ kind: "chain-reset", hash: H(1) });
    expect(r.final.failure?.detail).toMatch(/genesis block hash changed/);
    expect(r.final.failure?.detail).toMatch(/cancel again only if the order is still listed/);
    expect(r.final.failure?.detail).not.toMatch(/place the order again/);
    expect(r.final.result).toBeUndefined();
  });

  it("a timeout keeps the flow delayed and ends as 'not confirmed yet', never as success", async () => {
    const { deps } = fakeDeps(order(), receiptFor(dec("10"), 0n), { waitForReceipt: async () => Promise.reject(timeoutErr()) });
    const r = await run(deps, { maxWindows: 2 });
    expect(r.types).toContain("DELAYED");
    expect(r.final.failure).toMatchObject({ kind: "timeout", hash: H(1) });
    expect(r.final.result).toBeUndefined();
  });

  it("an RPC failure while reading the order back is a failure, not a success", async () => {
    const { deps } = fakeDeps(order(), receiptFor(dec("10"), 0n), { readOrder: async () => Promise.reject(new Error("fetch failed")) });
    const r = await run(deps);
    expect(r.final.phase).toBe("failed");
    expect(r.final.result).toBeUndefined();
  });
});

describe("runCancel: account, network or market change", () => {
  it("after the account changes mid-request nothing further is waited on or applied", async () => {
    let current = true;
    const { deps, calls } = fakeDeps(order(), receiptFor(dec("10"), 0n), {
      write: async (call) => {
        calls.write.push(call);
        current = false; // the account switched while the wallet was open
        return H(1);
      },
    });
    const r = await run(deps, { current: () => current });
    expect(calls.waits).toBe(0);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED"]); // the hash is still recorded
    expect(r.final.result).toBeUndefined();
  });

  it("a request that is no longer current never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(order(), receiptFor(dec("10"), 0n));
    const r = await run(deps, { current: () => false });
    expect(calls.write).toHaveLength(0);
    expect(r.events).toHaveLength(0);
  });
});
