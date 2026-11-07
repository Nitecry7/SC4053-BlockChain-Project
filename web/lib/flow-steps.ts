import type { FlowPhase } from "./order-flow";

export type StepStatus = "todo" | "active" | "done" | "failed";
export type FlowStepView = { label: string; status: StepStatus };

const ORDER_STEPS = ["Simulate on chain", "Sign in wallet", "Confirm in a block", "Verify from the receipt"] as const;
const APPROVAL_STEPS = ["Sign approval in wallet", "Confirm in a block", "Re-read the allowance"] as const;

const ORDER_INDEX: Partial<Record<FlowPhase, number>> = { simulating: 0, "order-wallet": 1, "order-confirming": 2, reconciling: 3, done: 4 };
const APPROVAL_INDEX: Partial<Record<FlowPhase, number>> = { "approve-wallet": 0, "approve-confirming": 1 };

/**
 * The visible step list for the order or approval in flight. `failedFrom` is the phase that was running when the
 * attempt failed, so the failed step is marked and the earlier ones stay done. Idle shows no steps.
 */
export function flowSteps(kind: "order" | "approval", phase: FlowPhase, failedFrom?: FlowPhase): FlowStepView[] {
  const labels = kind === "order" ? ORDER_STEPS : APPROVAL_STEPS;
  const index = kind === "order" ? ORDER_INDEX : APPROVAL_INDEX;
  const reference = phase === "failed" ? failedFrom : phase;
  const at = reference === undefined ? undefined : index[reference];
  if (at === undefined) return [];
  return labels.map((label, i) => {
    if (phase === "failed") return { label, status: i < at ? "done" : i === at ? "failed" : "todo" };
    if (phase === "done") return { label, status: "done" };
    return { label, status: i < at ? "done" : i === at ? "active" : "todo" };
  });
}
