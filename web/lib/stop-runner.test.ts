import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import type { ChainAnchor } from "./chain-reset";
import type { FlowContext, FlowEvent, FlowState } from "./order-flow";
import { flowReducer, initialFlowState } from "./order-flow";
import type { ValidOrder } from "./order-input";
import { runApproval, type ContractCall, type ReceiptLike, type RunnerDeps } from "./order-runner";
import type { OrderSnapshot } from "./order-status";
import { isStopOutcome, reconcileStop, runStopOrder, type StopOutcome } from "./stop-runner";
import { ALICE, BOB, EVIL, MARKET, NTU, SGDX, dec, orderPlaced, resetLogIndex, stopOrderPlaced, transfer } from "./test-logs";
import { requiredQuote } from "./units";

// FAKE chain and wallet: these tests pin the orchestration order, the verification and the failure wording of the
// stop-limit runner. stop.integration.test.ts runs the same code against a scratch Anvil.

const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };
const ctx: FlowContext = { account: ALICE, chainId: 31337, market: MARKET };
const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;
const rpcRejected = () => Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 });
const timeoutErr = () => Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });
const named = (errorName: string) =>
  Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName } }) });
const anchor: ChainAnchor = { genesisHash: H(100), blockNumber: 9n, blockHash: H(109) };

// A sell stop (trigger 1.8, limit 1.7, 10 NTU) and a buy stop (trigger 2.5, limit 2.6, 4 NTU: escrow at the LIMIT price).
const sellStop: ValidOrder = { kind: "stop", side: "sell", triggerPrice: dec("1.8"), price: dec("1.7"), amount: dec("10"), collateralToken: "base", collateral: dec("10") };
const buyEscrow = requiredQuote(dec("4"), dec("2.6"));
const buyStop: ValidOrder = { kind: "stop", side: "buy", triggerPrice: dec("2.5"), price: dec("2.6"), amount: dec("4"), collateralToken: "quote", collateral: buyEscrow };

const pending = (o: ValidOrder, id = 7n, trader = ALICE): OrderSnapshot => ({
  id,
  trader,
  side: o.side === "buy" ? 0 : 1,
  price: o.price,
  triggerPrice: o.triggerPrice ?? 0n,
  amount: o.amount,
  filled: 0n,
  lockedQuote: o.side === "buy" ? requiredQuote(o.amount, o.price) : 0n,
  createdAt: 1n,
  status: 4,
});

function receiptFor(o: ValidOrder, over: Partial<ReceiptLike> = {}, id = 7n, trader = ALICE): ReceiptLike {
  resetLogIndex();
  const logs = [
    transfer(o.side === "buy" ? SGDX : NTU, trader, MARKET, o.collateral),
    stopOrderPlaced(MARKET, id, trader, o.side === "buy" ? 0 : 1, o.triggerPrice ?? 0n, o.price, o.amount),
  ];
  return { transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 210_000n, logs, ...over };
}

type Calls = { simulate: { call: ContractCall; block?: bigint }[]; write: ContractCall[]; waits: number };
function fakeDeps(o: ValidOrder, receipt: ReceiptLike, over: Partial<RunnerDeps> = {}): { deps: RunnerDeps; calls: Calls } {
  const calls: Calls = { simulate: [], write: [], waits: 0 };
  const deps: RunnerDeps = {
    simulate: async (call, _a, block) => void calls.simulate.push({ call, block }),
    write: async (call) => (calls.write.push(call), H(1)),
    waitForReceipt: async () => (calls.waits++, receipt),
    readAllowance: async () => o.collateral,
    readOrder: async () => pending(o),
    ...over,
  };
  return { deps, calls };
}

async function runStop(deps: RunnerDeps, order: ValidOrder, opts: { current?: () => boolean; windowMs?: number; maxWindows?: number } = {}) {
  const events: FlowEvent<StopOutcome>[] = [];
  const start: FlowState<StopOutcome> = flowReducer(initialFlowState<StopOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
  await runStopOrder(deps, { ctx, pair, order, attempt: 1, windowMs: opts.windowMs, maxWindows: opts.maxWindows }, (e) => events.push(e), opts.current ?? (() => true));
  const final = events.reduce(flowReducer<StopOutcome>, start);
  return { events, final, types: events.map((e) => e.type) };
}

describe("approval for a stop order uses the LIMIT-price escrow", () => {
  it("approves exactly requiredQuote(amount, limit) of the QUOTE token for a buy stop, with the order book as spender", async () => {
    const { deps, calls } = fakeDeps(buyStop, receiptFor(buyStop));
    const events: FlowEvent<StopOutcome>[] = [];
    await runApproval<StopOutcome>(deps, { ctx: { ...ctx, account: BOB }, pair, order: buyStop, attempt: 1 }, (e) => events.push(e), () => true);
    expect(calls.write).toEqual([{ address: SGDX, abi: expect.anything(), functionName: "approve", args: [MARKET, buyEscrow] }]);
    expect(buyEscrow).not.toBe(requiredQuote(dec("4"), dec("2.5"))); // not the trigger price
    expect(events.map((e) => e.type)).toEqual(["APPROVAL_SUBMITTED", "APPROVAL_CONFIRMED"]);
  });
  it("approves exactly the base amount for a sell stop, never an unlimited allowance", async () => {
    const { deps, calls } = fakeDeps(sellStop, receiptFor(sellStop));
    await runApproval<StopOutcome>(deps, { ctx, pair, order: sellStop, attempt: 1 }, () => {}, () => true);
    expect(calls.write[0]).toMatchObject({ address: NTU, functionName: "approve", args: [MARKET, dec("10")] });
    expect((calls.write[0]!.args as bigint[])[1]).toBeLessThan(2n ** 255n);
  });
});

describe("runStopOrder: success needs the receipt, the event and the chain", () => {
  it("places a sell stop: simulate placeStopLimitOrder(side, trigger, limit, amount), one wallet request, then a PENDING result", async () => {
    const { deps, calls } = fakeDeps(sellStop, receiptFor(sellStop));
    const r = await runStop(deps, sellStop);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "RECONCILED"]);
    expect(calls.simulate[0]!.call).toMatchObject({ address: MARKET, functionName: "placeStopLimitOrder", args: [1, dec("1.8"), dec("1.7"), dec("10")] });
    expect(calls.write).toHaveLength(1);
    expect(r.final.phase).toBe("done");
    const out = r.final.result!;
    expect(isStopOutcome(out)).toBe(true);
    expect(out).toMatchObject({ stop: true, hash: H(1), problems: [] });
    expect(out.decoded).toMatchObject({ orderId: 7n, side: "sell", triggerPrice: dec("1.8"), limitPrice: dec("1.7"), escrowBase: dec("10") });
    expect(out.atBlock.status).toBe(4); // pending: nothing was activated or filled
    expect(out.atBlock.filled).toBe(0n);
  });
  it("places a buy stop: argument order is (side, TRIGGER, LIMIT, amount) and the escrow is the quote at the limit", async () => {
    const { deps, calls } = fakeDeps(buyStop, receiptFor(buyStop, {}, 8n, BOB), { readOrder: async () => pending(buyStop, 8n, BOB) });
    const bobCtx = { ...ctx, account: BOB };
    const events: FlowEvent<StopOutcome>[] = [];
    await runStopOrder(deps, { ctx: bobCtx, pair, order: buyStop, attempt: 1 }, (e) => events.push(e), () => true);
    expect(calls.simulate[0]!.call.args).toEqual([0, dec("2.5"), dec("2.6"), dec("4")]);
    const done = events.find((e) => e.type === "RECONCILED") as { result: StopOutcome } | undefined;
    expect(done?.result.problems).toEqual([]);
    expect(done?.result.decoded.escrowQuote).toBe(buyEscrow);
  });
  it("refuses an order that is not a stop with a trigger price (never reaches the wallet)", async () => {
    const limit: ValidOrder = { side: "sell", price: dec("2"), amount: dec("1"), collateralToken: "base", collateral: dec("1") };
    const { deps, calls } = fakeDeps(sellStop, receiptFor(sellStop));
    const r = await runStop(deps, limit);
    expect(calls.write).toHaveLength(0);
    expect(r.final.phase).toBe("failed");
  });
  it("follows a speed-up to the re-priced hash", async () => {
    const { deps } = fakeDeps(sellStop, receiptFor(sellStop), {
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", H(2));
        return receiptFor(sellStop, { transactionHash: H(2) });
      },
    });
    const r = await runStop(deps, sellStop);
    expect(r.types).toContain("HASH_REPLACED");
    expect(r.final.result?.hash).toBe(H(2));
  });
});

describe("runStopOrder: the chain and the logs must agree", () => {
  it("a different trigger, limit, side or amount than requested is 'not the stop order you requested'", async () => {
    for (const mined of [
      { ...sellStop, triggerPrice: dec("1.9") },
      { ...sellStop, price: dec("1.6") },
      { ...sellStop, amount: dec("9") },
      { ...sellStop, side: "buy" as const },
    ]) {
      const { deps } = fakeDeps(sellStop, receiptFor(mined as ValidOrder));
      const r = await runStop(deps, sellStop);
      expect(r.final.failure).toMatchObject({ kind: "replaced", title: "Confirmed, but it is not the stop order you requested" });
      expect(r.final.result).toBeUndefined();
    }
  });
  it("a receipt with no StopOrderPlaced (a plain OrderPlaced, another trader's stop) is not a stop placement", async () => {
    resetLogIndex();
    const plain: ReceiptLike = { transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 1n, logs: [orderPlaced(MARKET, 7n, ALICE, 1, dec("2"), dec("10"))] };
    expect((await runStop(fakeDeps(sellStop, plain).deps, sellStop)).final.failure).toMatchObject({ kind: "unknown", title: "Confirmed, but the stop order could not be verified" });
    expect((await runStop(fakeDeps(sellStop, receiptFor(sellStop, {}, 7n, EVIL)).deps, sellStop)).final.result).toBeUndefined();
  });
  it("an order that does not read PendingTrigger, or whose escrow differs, is reported as a problem", async () => {
    const wrongStatus = await runStop(fakeDeps(sellStop, receiptFor(sellStop), { readOrder: async () => ({ ...pending(sellStop), status: 0 }) }).deps, sellStop);
    expect(wrongStatus.final.result?.problems.join(" ")).toMatch(/does not read PendingTrigger/);
    resetLogIndex();
    const noEscrow: ReceiptLike = { transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 1n, logs: [stopOrderPlaced(MARKET, 7n, ALICE, 1, dec("1.8"), dec("1.7"), dec("10"))] };
    const r = await runStop(fakeDeps(sellStop, noEscrow).deps, sellStop);
    expect(r.final.result?.problems.join(" ")).toMatch(/differ from the base amount of the sell stop/);
  });
  it("reconcileStop pins every field (buy: locked quote is requiredQuote at the LIMIT price)", () => {
    resetLogIndex();
    const rc = { orderId: 8n, trader: BOB, side: "buy" as const, triggerPrice: dec("2.5"), limitPrice: dec("2.6"), amount: dec("4"), escrowBase: 0n, escrowQuote: buyEscrow };
    expect(reconcileStop(rc, pending(buyStop, 8n, BOB))).toEqual([]);
    expect(reconcileStop(rc, { ...pending(buyStop, 8n, BOB), lockedQuote: requiredQuote(dec("4"), dec("2.5")) }).join(" ")).toMatch(/locked quote is not requiredQuote/);
    expect(reconcileStop({ ...rc, escrowQuote: buyEscrow - 1n }, pending(buyStop, 8n, BOB)).join(" ")).toMatch(/LIMIT price/);
    expect(reconcileStop(rc, { ...pending(buyStop, 8n, BOB), filled: 1n }).join(" ")).toMatch(/nothing filled/);
  });
});

describe("runStopOrder: failures never claim success", () => {
  it("a contract error in the simulation (BookTooDeep, InvalidTickSize) is named and never reaches the wallet", async () => {
    for (const name of ["BookTooDeep", "InvalidTickSize", "ZeroPrice"]) {
      const { deps, calls } = fakeDeps(sellStop, receiptFor(sellStop), { simulate: async () => Promise.reject(named(name)) });
      const r = await runStop(deps, sellStop);
      expect(calls.write).toHaveLength(0);
      expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: name, step: "order" });
    }
  });
  it("a wallet rejection is a rejection: nothing waits, nothing is claimed", async () => {
    const { deps, calls } = fakeDeps(sellStop, receiptFor(sellStop), { write: async () => Promise.reject(rpcRejected()) });
    const r = await runStop(deps, sellStop);
    expect(r.final.failure).toMatchObject({ kind: "rejected" });
    expect(calls.waits).toBe(0);
    expect(r.final.result).toBeUndefined();
  });
  it("a transaction mined as reverted says no stop order was placed, with the reason from the block before", async () => {
    const { deps, calls } = fakeDeps(sellStop, receiptFor(sellStop, { status: "reverted", logs: [] }), {
      simulate: async (call, _a, block) => {
        calls.simulate.push({ call, block });
        if (block !== undefined) throw named("BookTooDeep");
      },
    });
    const r = await runStop(deps, sellStop);
    expect(r.final.failure).toMatchObject({ kind: "reverted", hash: H(1) });
    expect(r.final.failure?.title).toMatch(/Reverted on-chain: The book is too deep/);
    expect(r.final.failure?.detail).toMatch(/no stop order was placed/);
  });
  it("a REPLACED or wallet-CANCELLED transaction fails under the mined hash, never as a placed stop", async () => {
    for (const reason of ["replaced", "cancelled"] as const) {
      const { deps } = fakeDeps(sellStop, receiptFor(sellStop), {
        waitForReceipt: async (_h, { onReplaced }) => {
          onReplaced(reason, H(5));
          return receiptFor(sellStop, { transactionHash: H(5), logs: [] });
        },
      });
      const r = await runStop(deps, sellStop);
      expect(r.final.failure).toMatchObject({ kind: reason, hash: H(5) });
      expect(r.final.result).toBeUndefined();
    }
  });
  it("a confirmed chain reset ends the wait and never reports a placed stop", async () => {
    let waits = 0;
    const { deps } = fakeDeps(sellStop, receiptFor(sellStop), {
      readChainAnchor: async () => anchor,
      inspectChain: async () => ({ verdict: { verdict: "reset", evidence: ["the genesis block hash changed"] } }),
      waitForReceipt: async () => (waits++, Promise.reject(timeoutErr())),
    });
    const r = await runStop(deps, sellStop, { maxWindows: 3 });
    expect(waits).toBe(1);
    expect(r.final.failure).toMatchObject({ kind: "chain-reset", hash: H(1) });
    expect(r.final.result).toBeUndefined();
  });
  it("a timeout stays 'delayed' and ends as not confirmed yet; an RPC failure reading the order back is a failure", async () => {
    const t = await runStop(fakeDeps(sellStop, receiptFor(sellStop), { waitForReceipt: async () => Promise.reject(timeoutErr()) }).deps, sellStop, { maxWindows: 2 });
    expect(t.types).toContain("DELAYED");
    expect(t.final.failure).toMatchObject({ kind: "timeout" });
    const rpc = await runStop(fakeDeps(sellStop, receiptFor(sellStop), { readOrder: async () => Promise.reject(new Error("fetch failed")) }).deps, sellStop);
    expect(rpc.final.phase).toBe("failed");
    expect(rpc.final.result).toBeUndefined();
  });
});

describe("runStopOrder: account, network or market change, and duplicate clicks", () => {
  it("after the account changes mid-request nothing further is waited on or applied", async () => {
    let current = true;
    const { deps, calls } = fakeDeps(sellStop, receiptFor(sellStop), {
      write: async (call) => {
        calls.write.push(call);
        current = false;
        return H(1);
      },
    });
    const r = await runStop(deps, sellStop, { current: () => current });
    expect(calls.waits).toBe(0);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED"]);
    expect(r.final.result).toBeUndefined();
  });
  it("a request that is no longer current never reaches the wallet", async () => {
    const { deps, calls } = fakeDeps(sellStop, receiptFor(sellStop));
    await runStop(deps, sellStop, { current: () => false });
    expect(calls.write).toHaveLength(0);
  });
  it("a flow that is already busy ignores a second start (the reducer refuses a second START_ORDER)", () => {
    const s1 = flowReducer(initialFlowState<StopOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
    const s2 = flowReducer(s1, { type: "START_ORDER", attempt: 2, ctx });
    expect(s2.attempt).toBe(s1.attempt);
  });
});
