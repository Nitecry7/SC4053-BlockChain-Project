import type { Address, Hex } from "viem";
import type { DescribedError } from "./errors";

/**
 * The lifecycle of one order, as a pure reducer. It models in-flight activity only; which button the ticket offers
 * (validate, approve, place) is derived from the validated order and the allowance.
 *
 *   idle -> approve-wallet -> approve-confirming -> idle (allowance re-read)
 *   idle -> simulating -> order-wallet -> order-confirming -> reconciling -> done
 *   any busy phase -> failed;  any busy phase + account/chain/market change -> stale
 *
 * A transaction hash alone is never success: `done` is reached only through ORDER_MINED (receipt status "success")
 * and RECONCILED (the decoded result).
 */
export type FlowPhase =
  | "idle"
  | "approve-wallet"
  | "approve-confirming"
  | "simulating"
  | "order-wallet"
  | "order-confirming"
  | "reconciling"
  | "done"
  | "failed"
  | "stale";

export type FlowStep = "approve" | "order";

/** Who, where and on which market an attempt was started. Results are never applied under a different context. */
export type FlowContext = { account: Address; chainId: number; market: Address };

export type FlowFailure = DescribedError & { step: FlowStep; hash?: Hex };

export type FlowState<R = unknown> = {
  phase: FlowPhase;
  /** Identifies the current attempt. Late async results from an older attempt are ignored. */
  attempt: number;
  ctx: FlowContext | undefined;
  approvalHash?: Hex;
  /** Allowance the last confirmed approval set; for display only (the allowance is always re-read). */
  approvedAmount?: bigint;
  orderHash?: Hex;
  /** True when a receipt has not arrived within the wait window: still tracking, not failed. */
  delayed: boolean;
  failure?: FlowFailure;
  result?: R;
  /** The phase the flow was in when the context changed (for the stale notice). */
  staleFrom?: FlowPhase;
  /** The phase that was running when the attempt failed (for the step list). */
  failedFrom?: FlowPhase;
  /**
   * An attempt the user abandoned with "Try again" while a wallet request or confirmation was still open. If its
   * request is signed anyway, the hash lands here so the transaction is never forgotten. Cleared only on dismissal.
   */
  abandoned?: { attempt: number; step: FlowStep; hash: Hex | undefined };
};

export type FlowEvent<R = unknown> =
  | { type: "START_APPROVAL"; attempt: number; ctx: FlowContext }
  | { type: "APPROVAL_SUBMITTED"; attempt: number; hash: Hex }
  | { type: "APPROVAL_CONFIRMED"; attempt: number; amount: bigint }
  | { type: "START_ORDER"; attempt: number; ctx: FlowContext }
  | { type: "SIMULATION_OK"; attempt: number }
  | { type: "ORDER_SUBMITTED"; attempt: number; hash: Hex }
  | { type: "HASH_REPLACED"; attempt: number; hash: Hex }
  | { type: "DELAYED"; attempt: number }
  | { type: "ORDER_MINED"; attempt: number }
  | { type: "RECONCILED"; attempt: number; result: R }
  | { type: "FAILED"; attempt: number; failure: FlowFailure }
  | { type: "CONTEXT_CHANGED"; ctx: FlowContext }
  | { type: "RESET"; attempt: number }
  | { type: "DISMISS_ABANDONED" };

export const initialFlowState = <R = unknown>(): FlowState<R> => ({ phase: "idle", attempt: 0, ctx: undefined, delayed: false });

const BUSY: readonly FlowPhase[] = ["approve-wallet", "approve-confirming", "simulating", "order-wallet", "order-confirming", "reconciling"];

/** Waiting on the wallet, the chain or a read: the ticket must not accept another submission. */
export const isBusy = (phase: FlowPhase) => BUSY.includes(phase);

const sameContext = (a: FlowContext, b: FlowContext) =>
  a.account.toLowerCase() === b.account.toLowerCase() && a.chainId === b.chainId && a.market.toLowerCase() === b.market.toLowerCase();

export function flowReducer<R>(state: FlowState<R>, event: FlowEvent<R>): FlowState<R> {
  switch (event.type) {
    case "START_APPROVAL":
      // A second click while anything is in flight (or the last attempt is unresolved) is ignored: no duplicates.
      if (state.phase !== "idle") return state;
      return {
        ...initialFlowState<R>(),
        attempt: event.attempt,
        ctx: event.ctx,
        phase: "approve-wallet",
        approvedAmount: state.approvedAmount,
        approvalHash: state.approvalHash,
        abandoned: state.abandoned,
      };
    case "START_ORDER":
      if (state.phase !== "idle") return state;
      return {
        ...initialFlowState<R>(),
        attempt: event.attempt,
        ctx: event.ctx,
        phase: "simulating",
        approvedAmount: state.approvedAmount,
        approvalHash: state.approvalHash,
        abandoned: state.abandoned,
      };
    case "CONTEXT_CHANGED": {
      if (!state.ctx || sameContext(state.ctx, event.ctx)) return state;
      if (isBusy(state.phase)) return { ...state, phase: "stale", staleFrom: state.phase, delayed: false };
      if (state.phase === "stale") return state;
      // Idle, done or failed under another account/network/market: forget everything that belonged to it.
      return { ...initialFlowState<R>(), attempt: state.attempt };
    }
    case "RESET": {
      // Resetting while something was still open does not make it go away: remember it.
      const abandoned = isBusy(state.phase)
        ? {
            attempt: state.attempt,
            step: (state.phase === "approve-wallet" || state.phase === "approve-confirming" ? "approve" : "order") as FlowStep,
            hash: state.phase === "approve-confirming" ? state.approvalHash : state.phase === "order-confirming" || state.phase === "reconciling" ? state.orderHash : undefined,
          }
        : state.abandoned;
      return { ...initialFlowState<R>(), attempt: event.attempt, abandoned };
    }
    case "DISMISS_ABANDONED":
      return { ...state, abandoned: undefined };
  }

  // A late hash from an abandoned attempt is recorded, never applied to the current one.
  if (state.abandoned && event.attempt === state.abandoned.attempt && event.attempt !== state.attempt) {
    if (event.type === "ORDER_SUBMITTED" || event.type === "APPROVAL_SUBMITTED" || event.type === "HASH_REPLACED") {
      return { ...state, abandoned: { ...state.abandoned, hash: event.hash } };
    }
    return state;
  }

  // Everything below belongs to a specific attempt: ignore late results from earlier ones.
  if (event.attempt !== state.attempt) return state;

  // After a context change nothing may advance, but a transaction hash learned late is still recorded, so the stale
  // notice can point at a transaction the old account may have sent.
  if (state.phase === "stale") {
    const fromApproval = state.staleFrom === "approve-wallet" || state.staleFrom === "approve-confirming";
    if (event.type === "ORDER_SUBMITTED") return { ...state, orderHash: event.hash };
    if (event.type === "APPROVAL_SUBMITTED") return { ...state, approvalHash: event.hash };
    if (event.type === "HASH_REPLACED") return fromApproval ? { ...state, approvalHash: event.hash } : { ...state, orderHash: event.hash };
    return state;
  }

  switch (event.type) {
    case "APPROVAL_SUBMITTED":
      return state.phase === "approve-wallet" ? { ...state, phase: "approve-confirming", approvalHash: event.hash } : state;
    case "APPROVAL_CONFIRMED":
      return state.phase === "approve-confirming"
        ? { ...state, phase: "idle", approvedAmount: event.amount, delayed: false }
        : state;
    case "SIMULATION_OK":
      return state.phase === "simulating" ? { ...state, phase: "order-wallet" } : state;
    case "ORDER_SUBMITTED":
      return state.phase === "order-wallet" ? { ...state, phase: "order-confirming", orderHash: event.hash } : state;
    case "HASH_REPLACED":
      // A speed-up in the wallet re-prices the same transaction under a new hash; keep following it.
      if (state.phase === "order-confirming") return { ...state, orderHash: event.hash };
      if (state.phase === "approve-confirming") return { ...state, approvalHash: event.hash };
      return state;
    case "DELAYED":
      return state.phase === "order-confirming" || state.phase === "approve-confirming" ? { ...state, delayed: true } : state;
    case "ORDER_MINED":
      return state.phase === "order-confirming" ? { ...state, phase: "reconciling", delayed: false } : state;
    case "RECONCILED":
      return state.phase === "reconciling" ? { ...state, phase: "done", result: event.result } : state;
    case "FAILED":
      return isBusy(state.phase) ? { ...state, phase: "failed", failure: event.failure, failedFrom: state.phase, delayed: false } : state;
    default:
      return state;
  }
}
