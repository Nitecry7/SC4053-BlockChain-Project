import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import type { ChainAnchor } from "./chain-reset";
import type { BestOrder } from "./crossed-book";
import type { FlowContext, FlowEvent, FlowState } from "./order-flow";
import { flowReducer, initialFlowState } from "./order-flow";
import type { ContractCall, ReceiptLike } from "./order-runner";
import type { OrderSnapshot } from "./order-status";
import { previewTrigger, runTrigger, type TriggerDeps, type TriggerOutcome } from "./trigger-runner";
import { ALICE, BOB, EVIL, MARKET, NTU, SGDX, dec, orderCancelled, resetLogIndex, stopOrderTriggered, trade, transfer } from "./test-logs";

// FAKE chain and wallet: these tests pin the orchestration, the verification and the wording of the trigger runner.
// stop.integration.test.ts runs the same code against a scratch Anvil.

const KEEPER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as Address; // holds no trading tokens
const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };
const ctx: FlowContext = { account: KEEPER, chainId: 31337, market: MARKET };
const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;
const timeoutErr = () => Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });
const rpcRejected = () => Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 });
const named = (errorName: string) =>
  Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName } }) });
const anchor: ChainAnchor = { genesisHash: H(100), blockNumber: 9n, blockHash: H(109) };
const noBest = (): { bid: BestOrder; ask: BestOrder } => ({ bid: { id: 0n, price: 0n }, ask: { id: 0n, price: 0n } });

// Alice's sell stop #7: trigger 1.8, limit 1.7, 10 NTU. Bob's resting bid #3 at 1.9 for 4 NTU.
const stopBefore = (over: Partial<OrderSnapshot> = {}): OrderSnapshot => ({ id: 7n, trader: ALICE, side: 1, price: dec("1.7"), triggerPrice: dec("1.8"), amount: dec("10"), filled: 0n, lockedQuote: 0n, createdAt: 1n, status: 4, ...over });
const after = (over: Partial<OrderSnapshot>): OrderSnapshot => stopBefore(over);

const receiptOf = (logs: ReceiptLike["logs"], over: Partial<ReceiptLike> = {}): ReceiptLike => ({ transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 260_000n, logs, ...over });
const restingLogs = () => (resetLogIndex(), [stopOrderTriggered(MARKET, 7n, dec("1.8"))]);
const partialFillLogs = () => (
  resetLogIndex(),
  [
    stopOrderTriggered(MARKET, 7n, dec("1.8")),
    trade(MARKET, 3n, 7n, BOB, ALICE, dec("1.9"), dec("4"), dec("7.6")),
    transfer(SGDX, MARKET, ALICE, dec("7.6")),
    transfer(NTU, MARKET, BOB, dec("4")),
  ]
);
const autoCancelLogs = () => (resetLogIndex(), [stopOrderTriggered(MARKET, 7n, dec("1.8")), orderCancelled(MARKET, 7n, ALICE, dec("10"), 0n), transfer(NTU, MARKET, ALICE, dec("10"))]);

type Calls = { simulate: { count: bigint; account: Address; block?: bigint }[]; write: { functionName: string; args: readonly unknown[] }[]; waits: number };
function fakeDeps(receipt: ReceiptLike, afterOrder: OrderSnapshot, over: Partial<TriggerDeps> = {}, simQueue: bigint[] = [1n, 0n]): { deps: TriggerDeps; calls: Calls } {
  const calls: Calls = { simulate: [], write: [], waits: 0 };
  let i = 0;
  const deps: TriggerDeps = {
    simulateMatches: async () => 0n,
    simulateTriggers: async (_m, count, account, block) => {
      calls.simulate.push({ count, account, block });
      return simQueue[Math.min(i++, simQueue.length - 1)]!;
    },
    readLastTrade: async () => ({ price: dec("1.8"), has: true }),
    readBestPrices: async () => noBest(),
    write: async (call: ContractCall) => (calls.write.push({ functionName: call.functionName, args: call.args }), H(1)),
    waitForReceipt: async () => (calls.waits++, receipt),
    readOrder: async (_m, _id, block) => (block !== undefined && block < receipt.blockNumber ? stopBefore() : afterOrder),
    ...over,
  };
  return { deps, calls };
}

async function run(deps: TriggerDeps, opts: { current?: () => boolean; windowMs?: number; maxWindows?: number; limit?: bigint } = {}) {
  const events: FlowEvent<TriggerOutcome>[] = [];
  const start: FlowState<TriggerOutcome> = flowReducer(initialFlowState<TriggerOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
  await runTrigger(deps, { ctx, pair, limit: opts.limit ?? 10n, attempt: 1, windowMs: opts.windowMs, maxWindows: opts.maxWindows }, (e) => events.push(e), opts.current ?? (() => true));
  const final = events.reduce(flowReducer<TriggerOutcome>, start);
  return { events, final, types: events.map((e) => e.type) };
}

describe("runTrigger: activation is not execution; the receipt and the chain decide", () => {
  it("an activation WITHOUT a fill: the stop rests as an ordinary order, nothing is reported filled", async () => {
    const { deps, calls } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }));
    const r = await run(deps);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "RECONCILED"]);
    expect(calls.simulate[0]).toMatchObject({ count: 10n, account: KEEPER });
    expect(calls.write).toEqual([{ functionName: "triggerStopOrders", args: [10n] }]); // one request, never an approve
    const out = r.final.result!;
    expect(out.problems).toEqual([]);
    expect(out).toMatchObject({ noop: false, requested: 10n, simulatedCount: 1n, totalBase: 0n, totalQuote: 0n, stillEligible: 0n, crossed: false });
    expect(out.triggered).toHaveLength(1);
    expect(out.triggered[0]).toMatchObject({ orderId: 7n, outcome: "resting", tradedBase: 0n, lastTradePrice: dec("1.8") });
    expect(out.triggered[0]!.before.status).toBe(4);
  });
  it("an activation with a PARTIAL fill: the stop is the taker at the maker's price and the rest rests", async () => {
    const { deps } = fakeDeps(receiptOf(partialFillLogs()), after({ status: 1, filled: dec("4") }));
    const out = (await run(deps)).final.result!;
    expect(out.problems).toEqual([]);
    expect(out.triggered[0]).toMatchObject({ outcome: "partly-filled", tradedBase: dec("4") });
    expect(out.triggered[0]!.fills[0]).toMatchObject({ makerOrderId: 3n, takerOrderId: 7n, price: dec("1.9") });
    expect(out).toMatchObject({ totalBase: dec("4"), totalQuote: dec("7.6") });
  });
  it("an activation with a FULL fill reads Filled", async () => {
    resetLogIndex();
    const logs = [stopOrderTriggered(MARKET, 7n, dec("1.8")), trade(MARKET, 3n, 7n, BOB, ALICE, dec("1.9"), dec("10"), dec("19")), transfer(SGDX, MARKET, ALICE, dec("19")), transfer(NTU, MARKET, BOB, dec("10"))];
    const out = (await run(fakeDeps(receiptOf(logs), after({ status: 2, filled: dec("10") })).deps)).final.result!;
    expect(out.problems).toEqual([]);
    expect(out.triggered[0]!.outcome).toBe("filled");
  });
  it("an engine AUTO-CANCEL (could not enter the book) is reported as such, with its refund, not as a fill or an owner cancel", async () => {
    const { deps } = fakeDeps(receiptOf(autoCancelLogs()), after({ status: 3 }));
    const out = (await run(deps)).final.result!;
    expect(out.problems).toEqual([]);
    expect(out.triggered[0]).toMatchObject({ outcome: "auto-cancelled", refundBase: dec("10"), refundQuote: 0n, tradedBase: 0n });
  });
  it("still-eligible stops and a crossed book are reported so another deliberate click or Match orders can follow", async () => {
    const crossedBest = { bid: { id: 3n, price: dec("1.9") }, ask: { id: 4n, price: dec("1.8") } };
    const { deps } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), { readBestPrices: async () => crossedBest }, [2n, 3n]);
    const out = (await run(deps)).final.result!;
    expect(out).toMatchObject({ stillEligible: 3n, crossed: true });
  });
  it("a mined transaction with ZERO activations is a no-op report, nothing invented", async () => {
    const out = (await run(fakeDeps(receiptOf([]), after({ status: 4 })).deps)).final.result!;
    expect(out).toMatchObject({ noop: true, triggered: [], totalBase: 0n, problems: [] });
  });
  it("another market's StopOrderTriggered in the logs is not counted", async () => {
    resetLogIndex();
    const out = (await run(fakeDeps(receiptOf([stopOrderTriggered(EVIL, 7n, 1n)]), after({ status: 4 })).deps)).final.result!;
    expect(out.noop).toBe(true);
  });
  it("the simulated count is an estimate: a different real count is reported as it is", async () => {
    const out = (await run(fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), {}, [5n, 0n]).deps)).final.result!;
    expect(out).toMatchObject({ simulatedCount: 5n });
    expect(out.triggered).toHaveLength(1);
    expect(out.problems).toEqual([]);
  });
  it("follows a speed-up to the re-priced hash", async () => {
    const { deps } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", H(2));
        return receiptOf(restingLogs(), { transactionHash: H(2) });
      },
    });
    const r = await run(deps);
    expect(r.types).toContain("HASH_REPLACED");
    expect(r.final.result?.hash).toBe(H(2));
  });
});

describe("runTrigger: the chain and the logs must agree", () => {
  it("a filled amount that differs from its Trade events is reported", async () => {
    const out = (await run(fakeDeps(receiptOf(partialFillLogs()), after({ status: 1, filled: dec("3") })).deps)).final.result!;
    expect(out.problems.join(" ")).toMatch(/filled amount changed by a different amount/);
  });
  it("a stop that was not PendingTrigger before, or reads Cancelled with no engine cancel event, is reported", async () => {
    const wasOpen = await run(fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), { readOrder: async () => stopBefore({ status: 0 }) }).deps);
    expect(wasOpen.final.result?.problems.join(" ")).toMatch(/was not PendingTrigger in the block before/);
    const ghost = await run(fakeDeps(receiptOf(restingLogs()), after({ status: 3 })).deps);
    expect(ghost.final.result?.problems.join(" ")).toMatch(/Cancelled without an engine cancel event/);
    expect(ghost.final.result?.triggered[0]!.outcome).toBe("unexpected");
  });
  it("a cancel of an order that was NOT activated here is reported (an owner cancel cannot happen in a trigger call)", async () => {
    resetLogIndex();
    const logs = [stopOrderTriggered(MARKET, 7n, dec("1.8")), orderCancelled(MARKET, 99n, BOB, 0n, dec("1"))];
    const out = (await run(fakeDeps(receiptOf(logs), after({ status: 0 })).deps)).final.result!;
    expect(out.problems.join(" ")).toMatch(/Order #99 was cancelled in this transaction without being activated first/);
  });
  it("a trade whose taker was not activated here is reported", async () => {
    resetLogIndex();
    const logs = [stopOrderTriggered(MARKET, 7n, dec("1.8")), trade(MARKET, 3n, 55n, BOB, ALICE, dec("1.9"), dec("1"), dec("1.9"))];
    const out = (await run(fakeDeps(receiptOf(logs), after({ status: 0 })).deps)).final.result!;
    expect(out.problems.join(" ")).toMatch(/order #55 as taker, which was not activated here/);
  });
  it("base paid out that differs from trades plus refunds is reported", async () => {
    resetLogIndex();
    const logs = [stopOrderTriggered(MARKET, 7n, dec("1.8")), trade(MARKET, 3n, 7n, BOB, ALICE, dec("1.9"), dec("4"), dec("7.6")), transfer(SGDX, MARKET, ALICE, dec("7.6"))];
    const out = (await run(fakeDeps(receiptOf(logs), after({ status: 1, filled: dec("4") })).deps)).final.result!;
    expect(out.problems.join(" ")).toMatch(/base tokens the market paid out differ/);
  });
  it("more activations than allowed is reported", async () => {
    const out = (await run(fakeDeps(receiptOf(restingLogs()), after({ status: 0 })).deps, { limit: 1n })).final.result!;
    expect(out.problems).toEqual([]); // 1 activation, limit 1: fine
    resetLogIndex();
    const two = [stopOrderTriggered(MARKET, 7n, dec("1.8")), stopOrderTriggered(MARKET, 8n, dec("1.8"))];
    const bad = (await run(fakeDeps(receiptOf(two), after({ status: 0 })).deps, { limit: 1n })).final.result!;
    expect(bad.problems.join(" ")).toMatch(/more activations than the 1 that were allowed/);
  });
});

describe("runTrigger: nothing is sent when nothing would activate", () => {
  it("a simulation of 0 never reaches the wallet and says no gas was spent", async () => {
    const { deps, calls } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), {}, [0n]);
    const r = await run(deps);
    expect(calls.write).toHaveLength(0);
    expect(r.final.failure?.title).toBe("No stop order can be triggered right now");
    expect(r.final.failure?.detail).toMatch(/no gas was spent/);
    expect(r.final.result).toBeUndefined();
  });
  it("an unusable per-transaction limit (0) sends nothing", async () => {
    const { deps, calls } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }));
    const r = await run(deps, { limit: 0n });
    expect(calls.write).toHaveLength(0);
    expect(calls.simulate).toHaveLength(0);
    expect(r.final.failure?.title).toBe("Invalid trigger count");
  });
  it("InvalidMaxCount in the simulation is named and never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), { simulateTriggers: async () => Promise.reject(named("InvalidMaxCount")) });
    const r = await run(deps);
    expect(calls.write).toHaveLength(0);
    expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: "InvalidMaxCount", title: "Invalid match count" });
  });
});

describe("runTrigger: failures never claim success", () => {
  it("a wallet rejection is a rejection: nothing waits", async () => {
    const { deps, calls } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), { write: async () => Promise.reject(rpcRejected()) });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "rejected" });
    expect(calls.waits).toBe(0);
    expect(r.final.result).toBeUndefined();
  });
  it("a transaction mined as reverted says no stop was triggered, with the reason from the block before", async () => {
    const { deps, calls } = fakeDeps(receiptOf([], { status: "reverted" }), after({ status: 4 }), {
      simulateTriggers: async (_m, count, account, block) => {
        calls.simulate.push({ count, account, block });
        if (block !== undefined) throw named("InvalidMaxCount");
        return 1n;
      },
    });
    const r = await run(deps);
    expect(r.final.failure).toMatchObject({ kind: "reverted", hash: H(1) });
    expect(r.final.failure?.title).toMatch(/Reverted on-chain: Invalid match count/);
    expect(r.final.failure?.detail).toMatch(/no stop was triggered/);
  });
  it("a REPLACED or wallet-CANCELLED request fails under the mined hash with trigger-specific wording", async () => {
    for (const [reason, title] of [["replaced", "The trigger request was replaced"], ["cancelled", "The trigger request was itself cancelled"]] as const) {
      const { deps } = fakeDeps(receiptOf([]), after({ status: 4 }), {
        waitForReceipt: async (_h, { onReplaced }) => {
          onReplaced(reason, H(5));
          return receiptOf([], { transactionHash: H(5) });
        },
      });
      const r = await run(deps);
      expect(r.final.failure).toMatchObject({ kind: reason, hash: H(5), title });
      expect(r.final.failure?.detail).not.toMatch(/ordered|place the order/i);
      expect(r.final.result).toBeUndefined();
    }
  });
  it("a confirmed chain reset ends the wait with trigger wording and never success", async () => {
    let waits = 0;
    const { deps } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), {
      readChainAnchor: async () => anchor,
      inspectChain: async () => ({ verdict: { verdict: "reset", evidence: ["the genesis block hash changed"] } }),
      waitForReceipt: async () => (waits++, Promise.reject(timeoutErr())),
    });
    const r = await run(deps, { maxWindows: 3 });
    expect(waits).toBe(1);
    expect(r.final.failure).toMatchObject({ kind: "chain-reset" });
    expect(r.final.failure?.detail).toMatch(/trigger again only if the stop is still pending/);
    expect(r.final.result).toBeUndefined();
  });
  it("a timeout stays delayed; an RPC outage before sending or while reading back is a failure, never success", async () => {
    const t = await run(fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), { waitForReceipt: async () => Promise.reject(timeoutErr()) }).deps, { maxWindows: 2 });
    expect(t.types).toContain("DELAYED");
    expect(t.final.failure).toMatchObject({ kind: "timeout" });
    const pre = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), { simulateTriggers: async () => Promise.reject(new Error("fetch failed")) });
    expect((await run(pre.deps)).final.phase).toBe("failed");
    expect(pre.calls.write).toHaveLength(0);
    const back = await run(fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), { readOrder: async () => Promise.reject(new Error("fetch failed")) }).deps);
    expect(back.final.phase).toBe("failed");
    expect(back.final.result).toBeUndefined();
  });
});

describe("runTrigger: account, network or market change, duplicate clicks", () => {
  it("after the account changes mid-request nothing further is waited on or applied", async () => {
    let current = true;
    const { deps, calls } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }), {
      write: async (call: ContractCall) => {
        calls.write.push({ functionName: call.functionName, args: call.args });
        current = false;
        return H(1);
      },
    });
    const r = await run(deps, { current: () => current });
    expect(calls.waits).toBe(0);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED"]);
  });
  it("a request that is no longer current never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(receiptOf(restingLogs()), after({ status: 0 }));
    const r = await run(deps, { current: () => false });
    expect(calls.write).toHaveLength(0);
    expect(r.types).toEqual([]);
  });
  it("a flow that is already busy ignores a second start", () => {
    const s1 = flowReducer(initialFlowState<TriggerOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
    expect(flowReducer(s1, { type: "START_ORDER", attempt: 2, ctx }).attempt).toBe(s1.attempt);
  });
});

describe("previewTrigger", () => {
  it("returns the simulated count, the last trade price and a gas estimate (read-only)", async () => {
    const deps = { simulateTriggers: async () => 2n, estimateTriggerGas: async () => 260_000n, readLastTrade: async () => ({ price: dec("1.8"), has: true }) };
    expect(await previewTrigger(deps, MARKET, 10n, KEEPER)).toEqual({ count: 2n, lastTradePrice: dec("1.8"), hasTradePrice: true, gas: 260_000n });
  });
  it("a failed gas estimate only hides the gas; a simulation that would revert is an error", async () => {
    const base = { readLastTrade: async () => ({ price: 0n, has: false }) };
    expect(await previewTrigger({ ...base, simulateTriggers: async () => 0n, estimateTriggerGas: async () => Promise.reject(new Error("no")) }, MARKET, 10n, KEEPER)).toEqual({ count: 0n, lastTradePrice: 0n, hasTradePrice: false });
    await expect(previewTrigger({ ...base, simulateTriggers: async () => Promise.reject(named("InvalidMaxCount")) }, MARKET, 10n, KEEPER)).rejects.toBeDefined();
  });
});
