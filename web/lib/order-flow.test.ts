import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import {
  flowReducer,
  initialFlowState,
  isBusy,
  type FlowContext,
  type FlowEvent,
  type FlowFailure,
  type FlowState,
} from "./order-flow";

const ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const MARKET = "0xCafac3dD18aC6c6e92c921884f9E4176737C052c" as const;
const OTHER_MARKET = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const ctx: FlowContext = { account: ALICE, chainId: 31337, market: MARKET };
const H1 = ("0x" + "11".repeat(32)) as Hex;
const H2 = ("0x" + "22".repeat(32)) as Hex;
const failure = (step: "approve" | "order"): FlowFailure => ({ kind: "rejected", title: "Request rejected in your wallet", detail: "Nothing was sent.", step });

const run = (events: FlowEvent[], from: FlowState = initialFlowState()) => events.reduce(flowReducer, from);

describe("order flow: happy path", () => {
  it("walks simulate -> wallet -> submitted -> receipt -> reconciled -> done", () => {
    let s = run([{ type: "START_ORDER", attempt: 1, ctx }]);
    expect(s.phase).toBe("simulating");
    s = flowReducer(s, { type: "SIMULATION_OK", attempt: 1 });
    expect(s.phase).toBe("order-wallet");
    s = flowReducer(s, { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 });
    expect(s.phase).toBe("order-confirming");
    expect(s.orderHash).toBe(H1);
    s = flowReducer(s, { type: "ORDER_MINED", attempt: 1 });
    expect(s.phase).toBe("reconciling");
    s = flowReducer(s, { type: "RECONCILED", attempt: 1, result: { orderId: 7n } });
    expect(s.phase).toBe("done");
    expect(s.result).toEqual({ orderId: 7n });
  });

  it("approval returns to idle so the allowance is re-read before the order step", () => {
    let s = run([
      { type: "START_APPROVAL", attempt: 1, ctx },
      { type: "APPROVAL_SUBMITTED", attempt: 1, hash: H1 },
    ]);
    expect(s.phase).toBe("approve-confirming");
    s = flowReducer(s, { type: "APPROVAL_CONFIRMED", attempt: 1, amount: 880n });
    expect(s.phase).toBe("idle");
    expect(s.approvedAmount).toBe(880n);
    expect(s.approvalHash).toBe(H1);
    // The next order starts from idle and keeps the approval record for display.
    s = flowReducer(s, { type: "START_ORDER", attempt: 2, ctx });
    expect(s.phase).toBe("simulating");
    expect(s.approvedAmount).toBe(880n);
  });

  it("a hash alone is not success: the flow stays in order-confirming until the receipt event", () => {
    const s = run([
      { type: "START_ORDER", attempt: 1, ctx },
      { type: "SIMULATION_OK", attempt: 1 },
      { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 },
    ]);
    expect(s.phase).toBe("order-confirming");
    expect(s.result).toBeUndefined();
    // RECONCILED without a mined receipt is refused.
    expect(flowReducer(s, { type: "RECONCILED", attempt: 1, result: {} }).phase).toBe("order-confirming");
  });

  it("cannot skip the simulation or the wallet step", () => {
    const s = run([{ type: "START_ORDER", attempt: 1, ctx }]);
    expect(flowReducer(s, { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 }).phase).toBe("simulating");
    expect(flowReducer(s, { type: "ORDER_MINED", attempt: 1 }).phase).toBe("simulating");
  });
});

describe("order flow: duplicate and stale protection", () => {
  it("ignores a second submission while anything is in flight", () => {
    const busy = run([{ type: "START_ORDER", attempt: 1, ctx }]);
    expect(flowReducer(busy, { type: "START_ORDER", attempt: 2, ctx })).toBe(busy);
    expect(flowReducer(busy, { type: "START_APPROVAL", attempt: 2, ctx })).toBe(busy);
    for (const phase of ["approve-wallet", "approve-confirming", "simulating", "order-wallet", "order-confirming", "reconciling"] as const) {
      const s: FlowState = { ...initialFlowState(), phase, attempt: 5, ctx };
      expect(isBusy(phase)).toBe(true);
      expect(flowReducer(s, { type: "START_ORDER", attempt: 6, ctx })).toBe(s);
    }
  });

  it("does not start a new attempt from done, failed or stale until RESET", () => {
    for (const phase of ["done", "failed", "stale"] as const) {
      const s: FlowState = { ...initialFlowState(), phase, attempt: 3, ctx };
      expect(flowReducer(s, { type: "START_ORDER", attempt: 4, ctx })).toBe(s);
      expect(flowReducer(s, { type: "RESET", attempt: 4 }).phase).toBe("idle");
    }
  });

  it("ignores late results from an earlier attempt", () => {
    let s = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "RESET", attempt: 2 }, { type: "START_ORDER", attempt: 3, ctx }]);
    expect(s.phase).toBe("simulating");
    // A straggler from attempt 1 (the wallet answered late) must not move attempt 3.
    s = flowReducer(s, { type: "SIMULATION_OK", attempt: 1 });
    expect(s.phase).toBe("simulating");
    s = flowReducer(s, { type: "FAILED", attempt: 1, failure: failure("order") });
    expect(s.phase).toBe("simulating");
  });

  it("goes stale when the account changes mid-flight and then ignores every late result", () => {
    let s = run([
      { type: "START_ORDER", attempt: 1, ctx },
      { type: "SIMULATION_OK", attempt: 1 },
      { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 },
    ]);
    s = flowReducer(s, { type: "CONTEXT_CHANGED", ctx: { ...ctx, account: BOB } });
    expect(s.phase).toBe("stale");
    expect(s.staleFrom).toBe("order-confirming");
    expect(s.orderHash).toBe(H1); // kept so the notice can point at the old account's transaction
    s = flowReducer(s, { type: "ORDER_MINED", attempt: 1 });
    expect(s.phase).toBe("stale");
    s = flowReducer(s, { type: "RECONCILED", attempt: 1, result: { orderId: 9n } });
    expect(s.phase).toBe("stale");
    expect(s.result).toBeUndefined(); // never applied to the new account
  });

  it.each([
    ["chain", { chainId: 1 }],
    ["market", { market: OTHER_MARKET }],
    ["account", { account: BOB }],
  ])("goes stale when the %s changes while the wallet is open", (_name, change) => {
    const s = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "SIMULATION_OK", attempt: 1 }]);
    expect(flowReducer(s, { type: "CONTEXT_CHANGED", ctx: { ...ctx, ...change } }).phase).toBe("stale");
  });

  it("the same account in a different address case is the same context", () => {
    const s = run([{ type: "START_ORDER", attempt: 1, ctx }]);
    const lower = { ...ctx, account: ALICE.toLowerCase() as typeof ALICE };
    expect(flowReducer(s, { type: "CONTEXT_CHANGED", ctx: lower })).toBe(s);
  });

  it("forgets a finished result when another account connects", () => {
    const done = run([
      { type: "START_ORDER", attempt: 1, ctx },
      { type: "SIMULATION_OK", attempt: 1 },
      { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 },
      { type: "ORDER_MINED", attempt: 1 },
      { type: "RECONCILED", attempt: 1, result: { orderId: 1n } },
    ]);
    expect(done.phase).toBe("done");
    const next = flowReducer(done, { type: "CONTEXT_CHANGED", ctx: { ...ctx, account: BOB } });
    expect(next.phase).toBe("idle");
    expect(next.result).toBeUndefined();
    expect(next.orderHash).toBeUndefined();
    expect(next.failure).toBeUndefined();
  });

  it("an unchanged context is a no-op, and an idle flow with no attempt yet is untouched", () => {
    const s = run([{ type: "START_ORDER", attempt: 1, ctx }]);
    expect(flowReducer(s, { type: "CONTEXT_CHANGED", ctx })).toBe(s);
    const fresh = initialFlowState();
    expect(flowReducer(fresh, { type: "CONTEXT_CHANGED", ctx })).toBe(fresh);
  });
});

describe("order flow: failures, delays and replacements", () => {
  it("fails from any busy phase, keeping the failing step and distinguishing rejection from error", () => {
    for (const phase of ["approve-wallet", "approve-confirming", "simulating", "order-wallet", "order-confirming", "reconciling"] as const) {
      const s: FlowState = { ...initialFlowState(), phase, attempt: 1, ctx };
      const failed = flowReducer(s, { type: "FAILED", attempt: 1, failure: failure("order") });
      expect(failed.phase).toBe("failed");
      expect(failed.failure?.kind).toBe("rejected");
    }
    const err: FlowFailure = { kind: "reverted", title: "x", detail: "y", step: "order", errorName: "InvalidLotSize" };
    const s = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "FAILED", attempt: 1, failure: err }]);
    expect(s.failure).toEqual(err);
  });

  it("remembers which phase failed, so the step list can mark the right step", () => {
    const atWallet = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "SIMULATION_OK", attempt: 1 }, { type: "FAILED", attempt: 1, failure: failure("order") }]);
    expect(atWallet.failedFrom).toBe("order-wallet");
    const atSim = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "FAILED", attempt: 1, failure: failure("order") }]);
    expect(atSim.failedFrom).toBe("simulating");
    expect(flowReducer(atSim, { type: "RESET", attempt: 2 }).failedFrom).toBeUndefined();
  });

  it("does not fail an idle or finished flow", () => {
    const idle = initialFlowState();
    expect(flowReducer(idle, { type: "FAILED", attempt: 0, failure: failure("order") })).toBe(idle);
  });

  it("a timeout marks the flow delayed but still tracking, and the receipt still completes it", () => {
    let s = run([
      { type: "START_ORDER", attempt: 1, ctx },
      { type: "SIMULATION_OK", attempt: 1 },
      { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 },
      { type: "DELAYED", attempt: 1 },
    ]);
    expect(s.phase).toBe("order-confirming");
    expect(s.delayed).toBe(true);
    s = flowReducer(s, { type: "ORDER_MINED", attempt: 1 });
    expect(s.phase).toBe("reconciling");
    expect(s.delayed).toBe(false);
  });

  it("follows a re-priced (sped up) transaction to its new hash", () => {
    const s = run([
      { type: "START_ORDER", attempt: 1, ctx },
      { type: "SIMULATION_OK", attempt: 1 },
      { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 },
      { type: "HASH_REPLACED", attempt: 1, hash: H2 },
    ]);
    expect(s.orderHash).toBe(H2);
    expect(s.phase).toBe("order-confirming");
  });

  it("a failed attempt can be reset to try again, and a new attempt clears the old failure", () => {
    let s = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "FAILED", attempt: 1, failure: failure("order") }]);
    s = flowReducer(s, { type: "RESET", attempt: 2 });
    expect(s.phase).toBe("idle");
    expect(s.failure).toBeUndefined();
    s = flowReducer(s, { type: "START_ORDER", attempt: 3, ctx });
    expect(s.failure).toBeUndefined();
    expect(s.orderHash).toBeUndefined();
  });
});

describe("order flow: Try again while the wallet is open must not lose a late signature (review finding 2)", () => {
  it("a reset during order-wallet remembers the abandoned attempt and records its hash if the wallet signs anyway", () => {
    let s = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "SIMULATION_OK", attempt: 1 }]);
    expect(s.phase).toBe("order-wallet");
    s = flowReducer(s, { type: "RESET", attempt: 2 });
    expect(s.phase).toBe("idle");
    expect(s.abandoned).toEqual({ attempt: 1, step: "order", hash: undefined });
    // The wallet answers the first request after all.
    s = flowReducer(s, { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 });
    expect(s.phase).toBe("idle"); // the new attempt is not advanced by it
    expect(s.abandoned?.hash).toBe(H1); // but the transaction is not forgotten
  });

  it("the same for an approval, and a clean reset (nothing in flight) leaves no abandoned record", () => {
    let s = run([{ type: "START_APPROVAL", attempt: 1, ctx }, { type: "RESET", attempt: 2 }]);
    expect(s.abandoned).toEqual({ attempt: 1, step: "approve", hash: undefined });
    s = flowReducer(s, { type: "APPROVAL_SUBMITTED", attempt: 1, hash: H2 });
    expect(s.abandoned?.hash).toBe(H2);
    const clean = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "FAILED", attempt: 1, failure: failure("order") }, { type: "RESET", attempt: 2 }]);
    expect(clean.abandoned).toBeUndefined();
  });

  it("a new attempt keeps the warning, and only an explicit dismissal clears it", () => {
    let s = run([{ type: "START_ORDER", attempt: 1, ctx }, { type: "SIMULATION_OK", attempt: 1 }, { type: "RESET", attempt: 2 }]);
    s = flowReducer(s, { type: "ORDER_SUBMITTED", attempt: 1, hash: H1 });
    s = flowReducer(s, { type: "START_ORDER", attempt: 3, ctx });
    expect(s.abandoned?.hash).toBe(H1);
    s = flowReducer(s, { type: "DISMISS_ABANDONED" });
    expect(s.abandoned).toBeUndefined();
  });
});

