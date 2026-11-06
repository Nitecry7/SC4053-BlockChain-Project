import { describe, expect, it } from "vitest";
import { encodeErrorResult, type Hex } from "viem";
import { orderBookAbi } from "@/lib/contracts/abis";
import type { FlowContext, FlowEvent } from "./order-flow";
import { initialFlowState, flowReducer, type FlowState } from "./order-flow";
import type { ValidOrder } from "./order-input";
import { runApproval, runOrder, type ContractCall, type OrderOutcome, type ReceiptLike, type RunnerDeps } from "./order-runner";
import { ALICE, BOB, MARKET, NTU, SGDX, dec, orderPlaced, resetLogIndex, specExampleLogs, transfer } from "./test-logs";

// FAKE chain and wallet: these tests prove the orchestration order and failure handling, not a real chain.
// trading.integration.test.ts runs the same code against a scratch Anvil.

const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };
const ctx: FlowContext = { account: BOB, chainId: 31337, market: MARKET };
const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;
const rpcRejected = () => Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 });
const timeoutErr = () => Object.assign(new Error("timed out"), { name: "WaitForTransactionReceiptTimeoutError" });

const buyOrder: ValidOrder = { side: "buy", price: dec("2.2"), amount: dec("4"), collateralToken: "quote", collateral: dec("8.8") };
const sellOrder: ValidOrder = { side: "sell", price: dec("2"), amount: dec("10"), collateralToken: "base", collateral: dec("10") };

const okReceipt = (logs = specExampleLogs()): ReceiptLike => ({ transactionHash: H(1), status: "success", blockNumber: 5n, gasUsed: 200_000n, logs });
const filledOrder = { id: 2n, trader: BOB, side: 0, price: dec("2.2"), triggerPrice: 0n, amount: dec("4"), filled: dec("4"), lockedQuote: 0n, createdAt: 1n, status: 2 };

type Calls = { simulate: { call: ContractCall; block?: bigint }[]; write: ContractCall[]; waits: number };
function fakeDeps(over: Partial<RunnerDeps> = {}): { deps: RunnerDeps; calls: Calls } {
  const calls: Calls = { simulate: [], write: [], waits: 0 };
  const deps: RunnerDeps = {
    simulate: async (call, _a, block) => void calls.simulate.push({ call, block }),
    write: async (call) => {
      calls.write.push(call);
      return H(1);
    },
    waitForReceipt: async () => {
      calls.waits++;
      return okReceipt();
    },
    readAllowance: async () => dec("8.8"),
    readOrder: async () => filledOrder,
    ...over,
  };
  return { deps, calls };
}

/** Runs one step and returns the events dispatched, replayed through the real reducer. */
async function run(step: typeof runApproval | typeof runOrder, deps: RunnerDeps, order: ValidOrder, opts: { current?: () => boolean; windowMs?: number; maxWindows?: number; from?: FlowState<OrderOutcome> } = {}) {
  const events: FlowEvent<OrderOutcome>[] = [];
  const start: FlowState<OrderOutcome> = opts.from ?? flowReducer(initialFlowState<OrderOutcome>(), { type: step === runApproval ? "START_APPROVAL" : "START_ORDER", attempt: 1, ctx });
  await step(deps, { ctx, pair, order, attempt: 1, windowMs: opts.windowMs, maxWindows: opts.maxWindows }, (e) => events.push(e), opts.current ?? (() => true));
  const final = events.reduce(flowReducer<OrderOutcome>, start);
  return { events, final, types: events.map((e) => e.type) };
}

describe("runApproval", () => {
  it("approves exactly the buy collateral of the QUOTE token, with the order book (not a factory) as spender", async () => {
    const { deps, calls } = fakeDeps();
    const r = await run(runApproval, deps, buyOrder);
    expect(calls.write).toHaveLength(1);
    expect(calls.write[0]).toMatchObject({ address: SGDX, functionName: "approve", args: [MARKET, dec("8.8")] });
    expect(r.types).toEqual(["APPROVAL_SUBMITTED", "APPROVAL_CONFIRMED"]);
    expect(r.final.phase).toBe("idle");
    expect(r.final.approvedAmount).toBe(dec("8.8"));
  });

  it("approves the sell amount of the BASE token", async () => {
    const { deps, calls } = fakeDeps({ readAllowance: async () => dec("10") });
    await run(runApproval, deps, sellOrder);
    expect(calls.write[0]).toMatchObject({ address: NTU, args: [MARKET, dec("10")] });
  });

  it("simulates before asking the wallet", async () => {
    const order: string[] = [];
    const { deps } = fakeDeps({
      simulate: async () => void order.push("simulate"),
      write: async () => {
        order.push("write");
        return H(1);
      },
    });
    await run(runApproval, deps, buyOrder);
    expect(order).toEqual(["simulate", "write"]);
  });

  it("a rejection in the wallet fails the step and never records a hash", async () => {
    const { deps } = fakeDeps({ write: async () => Promise.reject(rpcRejected()) });
    const r = await run(runApproval, deps, buyOrder);
    expect(r.types).toEqual(["FAILED"]);
    expect(r.final.failure).toMatchObject({ kind: "rejected", step: "approve" });
    expect(r.final.approvalHash).toBeUndefined();
  });

  it("a reverted approval receipt fails and keeps the hash", async () => {
    const { deps } = fakeDeps({ waitForReceipt: async () => ({ ...okReceipt(), status: "reverted" }) });
    const r = await run(runApproval, deps, buyOrder);
    expect(r.final.phase).toBe("failed");
    expect(r.final.failure?.hash).toBe(H(1));
  });

  it("does not trust the receipt alone: an allowance that is still too low fails the step", async () => {
    const { deps } = fakeDeps({ readAllowance: async () => dec("8.7") });
    const r = await run(runApproval, deps, buyOrder);
    expect(r.final.phase).toBe("failed");
    expect(r.types).toEqual(["APPROVAL_SUBMITTED", "FAILED"]);
  });

  it("does not ask the wallet when the context changed during the simulation", async () => {
    let current = true;
    const { deps, calls } = fakeDeps({ simulate: async () => void (current = false) });
    const r = await run(runApproval, deps, buyOrder, { current: () => current });
    expect(calls.write).toHaveLength(0);
    expect(r.types).toEqual([]);
  });
});

describe("runOrder: success", () => {
  it("SPEC example: simulate -> wallet -> submitted -> mined -> reconciled, with the id taken from OrderPlaced", async () => {
    const { deps, calls } = fakeDeps();
    const r = await run(runOrder, deps, buyOrder);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "ORDER_MINED", "RECONCILED"]);
    expect(calls.simulate[0]?.call).toMatchObject({ functionName: "placeLimitOrder", args: [0, dec("2.2"), dec("4")] });
    expect(r.final.phase).toBe("done");
    const out = r.final.result!;
    expect(out.decoded.orderId).toBe(2n);
    expect(out.decoded.refundQuote).toBe(dec("0.8"));
    expect(out.decoded.tradedQuote).toBe(dec("8"));
    expect(out.problems).toEqual([]);
    expect(out.hash).toBe(H(1));
    expect(out.blockNumber).toBe(5n);
  });

  it("reads the order both at the receipt block and at latest", async () => {
    const reads: (bigint | undefined)[] = [];
    const { deps } = fakeDeps({
      readOrder: async (_m, _id, block) => {
        reads.push(block);
        return filledOrder;
      },
    });
    await run(runOrder, deps, buyOrder);
    expect(reads.sort()).toEqual([5n, undefined].sort());
  });

  it("surfaces an accounting mismatch between the logs and getOrder instead of hiding it", async () => {
    const { deps } = fakeDeps({ readOrder: async () => ({ ...filledOrder, lockedQuote: dec("1") }) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.phase).toBe("done");
    expect(r.final.result?.problems.join(" ")).toMatch(/Escrow does not equal/);
  });
});

describe("runOrder: failures never claim success", () => {
  it("a contract revert in the simulation names the error and never reaches the wallet", async () => {
    const data = encodeErrorResult({ abi: orderBookAbi, errorName: "InvalidLotSize" });
    const revert = Object.assign(new Error("x"), {
      name: "ContractFunctionExecutionError",
      cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName: "InvalidLotSize" }, raw: data }),
    });
    const { deps, calls } = fakeDeps({ simulate: async () => Promise.reject(revert) });
    const r = await run(runOrder, deps, buyOrder);
    expect(calls.write).toHaveLength(0);
    expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: "InvalidLotSize", step: "order" });
    expect(r.types).toEqual(["FAILED"]); // no SIMULATION_OK, no ORDER_SUBMITTED
  });

  it("a wallet rejection leaves no submitted hash and is reported as a rejection", async () => {
    const { deps } = fakeDeps({ write: async () => Promise.reject(rpcRejected()) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.types).toEqual(["SIMULATION_OK", "FAILED"]);
    expect(r.final.failure?.kind).toBe("rejected");
    expect(r.final.orderHash).toBeUndefined();
  });

  it("a reverted receipt fails with the hash and replays the call one block earlier for the reason", async () => {
    const blocks: (bigint | undefined)[] = [];
    const { deps } = fakeDeps({
      waitForReceipt: async () => ({ ...okReceipt(), status: "reverted", blockNumber: 9n }),
      simulate: async (_c, _a, block) => {
        blocks.push(block);
        if (block !== undefined) throw Object.assign(new Error("x"), { name: "ContractFunctionRevertedError", data: { errorName: "BookTooDeep" } });
      },
    });
    const r = await run(runOrder, deps, buyOrder);
    expect(blocks).toContain(8n);
    expect(r.final.phase).toBe("failed");
    expect(r.final.failure).toMatchObject({ kind: "reverted", errorName: "BookTooDeep", hash: H(1) });
    expect(r.final.result).toBeUndefined();
  });

  it("a successful receipt with no OrderPlaced for the user is not reported as an order", async () => {
    resetLogIndex();
    const { deps } = fakeDeps({ waitForReceipt: async () => okReceipt([transfer(SGDX, BOB, MARKET, 1n), orderPlaced(MARKET, 3n, ALICE, 0, 1n, 1n)]) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.phase).toBe("failed");
    expect(r.final.failure?.title).toMatch(/could not be verified/);
    expect(r.final.result).toBeUndefined();
  });

  it("a forged OrderPlaced from another contract is not accepted as the order", async () => {
    resetLogIndex();
    const forged = [orderPlaced("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", 99n, BOB, 0, 1n, 1n)];
    const { deps } = fakeDeps({ waitForReceipt: async () => okReceipt(forged) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.phase).toBe("failed");
  });
});

describe("runOrder: delays, replacement and context changes", () => {
  it("a receipt timeout marks the flow delayed, keeps waiting, and still completes", async () => {
    let n = 0;
    const { deps } = fakeDeps({
      waitForReceipt: async () => {
        if (n++ === 0) throw timeoutErr();
        return okReceipt();
      },
    });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.types).toEqual(["SIMULATION_OK", "ORDER_SUBMITTED", "DELAYED", "ORDER_MINED", "RECONCILED"]);
    expect(r.final.phase).toBe("done");
  });

  it("gives up after the bounded number of windows with a 'not confirmed yet' failure that says not to resubmit", async () => {
    const { deps } = fakeDeps({ waitForReceipt: async () => Promise.reject(timeoutErr()) });
    const r = await run(runOrder, deps, buyOrder, { maxWindows: 3 });
    expect(r.types.filter((t) => t === "DELAYED")).toHaveLength(3);
    expect(r.final.failure).toMatchObject({ kind: "timeout", hash: H(1) });
    expect(r.final.failure?.detail).toMatch(/do not resubmit/i);
  });

  it("follows a re-priced transaction to its new hash", async () => {
    const { deps } = fakeDeps({
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", H(2));
        return { ...okReceipt(), transactionHash: H(2) };
      },
    });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.types).toContain("HASH_REPLACED");
    expect(r.final.result?.hash).toBe(H(2)); // the outcome links to the transaction that actually mined
  });

  it("a cancelled replacement fails the order", async () => {
    const { deps } = fakeDeps({ waitForReceipt: async () => Promise.reject(Object.assign(new Error("m"), { name: "TransactionReplacedError", reason: "cancelled" })) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.failure?.kind).toBe("cancelled");
  });

  it("does not open the wallet when the account changed during the simulation", async () => {
    let current = true;
    const { deps, calls } = fakeDeps({ simulate: async () => void (current = false) });
    const r = await run(runOrder, deps, buyOrder, { current: () => current });
    expect(calls.write).toHaveLength(0);
    expect(r.types).toEqual([]);
  });

  it("when the account changes while the wallet is open: records the hash, stops, and never applies a result", async () => {
    let current = true;
    const { deps, calls } = fakeDeps({
      write: async () => {
        current = false; // the user switched account in the wallet before signing
        return H(7);
      },
    });
    const start = flowReducer(initialFlowState<OrderOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
    // The hook reports the new context to the reducer at the same moment.
    const events: FlowEvent<OrderOutcome>[] = [];
    await runOrder(deps, { ctx, pair, order: buyOrder, attempt: 1 }, (e) => events.push(e), () => current);
    let s = flowReducer(start, { type: "SIMULATION_OK", attempt: 1 });
    s = flowReducer(s, { type: "CONTEXT_CHANGED", ctx: { ...ctx, account: ALICE } });
    s = events.filter((e) => e.type === "ORDER_SUBMITTED").reduce(flowReducer<OrderOutcome>, s);
    expect(calls.waits).toBe(0); // it stopped before waiting for a receipt it must not attribute to the new account
    expect(s.phase).toBe("stale");
    expect(s.orderHash).toBe(H(7));
    expect(s.result).toBeUndefined();
    expect(events.map((e) => e.type)).not.toContain("RECONCILED");
  });

  it("does not report a failure into a flow whose context has moved on", async () => {
    let current = true;
    const { deps } = fakeDeps({
      write: async () => {
        current = false;
        throw rpcRejected();
      },
    });
    const r = await run(runOrder, deps, buyOrder, { current: () => current });
    expect(r.types).toEqual(["SIMULATION_OK"]); // no FAILED for the abandoned attempt
  });
});

describe("runOrder: double-submit protection is in the reducer", () => {
  it("a second START while the first is simulating is ignored, so the wallet is opened once", () => {
    let s = flowReducer(initialFlowState<OrderOutcome>(), { type: "START_ORDER", attempt: 1, ctx });
    const again = flowReducer(s, { type: "START_ORDER", attempt: 2, ctx });
    expect(again).toBe(s);
    s = flowReducer(s, { type: "SIMULATION_OK", attempt: 1 });
    expect(flowReducer(s, { type: "START_ORDER", attempt: 3, ctx })).toBe(s);
  });
});

describe("runOrder: the outcome is bound to what was requested (review finding 3)", () => {
  it("uses the hash of the receipt that actually mined, not the first hash", async () => {
    const mined = H(9);
    const { deps } = fakeDeps({
      waitForReceipt: async (_h, { onReplaced }) => {
        onReplaced("repriced", mined);
        return { ...okReceipt(), transactionHash: mined };
      },
    });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.result?.hash).toBe(mined);
  });

  it("refuses a receipt whose OrderPlaced is not the order that was requested (a different price)", async () => {
    resetLogIndex();
    const other = [transfer(SGDX, BOB, MARKET, dec("8.8")), orderPlaced(MARKET, 2n, BOB, 0, dec("1.1"), dec("4"))]; // price 1.1, not 2.2
    const { deps } = fakeDeps({ waitForReceipt: async () => okReceipt(other) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.phase).toBe("failed");
    expect(r.final.failure?.title).toMatch(/not the order you requested/i);
    expect(r.final.result).toBeUndefined();
  });

  it("refuses a different side or amount too", async () => {
    resetLogIndex();
    const wrongSide = [orderPlaced(MARKET, 2n, BOB, 1, dec("2.2"), dec("4"))];
    const { deps: d1 } = fakeDeps({ waitForReceipt: async () => okReceipt(wrongSide) });
    expect((await run(runOrder, d1, buyOrder)).final.phase).toBe("failed");
    resetLogIndex();
    const wrongAmount = [orderPlaced(MARKET, 2n, BOB, 0, dec("2.2"), dec("5"))];
    const { deps: d2 } = fakeDeps({ waitForReceipt: async () => okReceipt(wrongAmount) });
    expect((await run(runOrder, d2, buyOrder)).final.phase).toBe("failed");
  });

  it("a cancelled or replaced transaction is a failure even though viem resolves with the replacement's receipt", async () => {
    for (const reason of ["cancelled", "replaced"] as const) {
      const { deps } = fakeDeps({
        waitForReceipt: async (_h, { onReplaced }) => {
          onReplaced(reason, H(5));
          return { ...okReceipt([]), transactionHash: H(5) };
        },
      });
      const r = await run(runOrder, deps, buyOrder);
      expect(r.final.failure?.kind).toBe(reason);
      expect(r.final.result).toBeUndefined();
    }
  });
});

describe("runOrder: failures after submission must not invite a duplicate order (review findings 2b and 7)", () => {
  it("an RPC error while waiting says the transaction may still be mined", async () => {
    const { deps } = fakeDeps({ waitForReceipt: async () => Promise.reject(Object.assign(new Error("fetch failed"), { name: "HttpRequestError" })) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.failure?.hash).toBe(H(1));
    expect(r.final.failure?.detail).toMatch(/may still be mined/i);
  });

  it("a mined revert says gas was spent and no order was placed, never 'Nothing was sent'", async () => {
    const { deps } = fakeDeps({ waitForReceipt: async () => ({ ...okReceipt(), status: "reverted" }) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.failure?.detail).not.toMatch(/nothing was sent/i);
    expect(r.final.failure?.detail).toMatch(/mined/i);
  });

  it("a failure BEFORE anything was signed keeps the plain 'nothing was sent' wording", async () => {
    const { deps } = fakeDeps({ write: async () => Promise.reject(rpcRejected()) });
    const r = await run(runOrder, deps, buyOrder);
    expect(r.final.failure?.detail).toMatch(/nothing was sent/i);
  });
});

