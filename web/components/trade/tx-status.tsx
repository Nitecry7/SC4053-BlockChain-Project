import { Check, CircleX, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { shortAddress } from "@/components/data/address-chip";
import { flowSteps, type StepStatus } from "@/lib/flow-steps";
import type { FlowState } from "@/lib/order-flow";
import { cn } from "@/lib/utils";

const icon: Record<StepStatus, React.ReactNode> = {
  todo: <span className="size-2 rounded-full bg-white/20" aria-hidden />,
  active: <LoaderCircle className="size-4 animate-spin text-lilac" aria-hidden />,
  done: <Check className="size-4 text-buy" aria-hidden />,
  failed: <CircleX className="size-4 text-sell" aria-hidden />,
};
const word: Record<StepStatus, string> = { todo: "not started", active: "in progress", done: "done", failed: "failed" };

/**
 * The lifecycle of the approval or order in flight, one line per step, with the transaction hash once it exists.
 * The hash links to the transaction page; having a hash is shown as "submitted", never as success.
 */
export function TxStatus({ state, kind }: { state: FlowState; kind: "order" | "approval" }) {
  const steps = flowSteps(kind, state.phase, state.failedFrom);
  if (steps.length === 0) return null;
  const hash = kind === "order" ? state.orderHash : state.approvalHash;
  // A cancelled or replaced transaction fails under the hash that was mined in its place: show it, so the outcome can be checked.
  const failure = state.phase === "failed" ? state.failure : undefined;
  const other =
    failure?.hash && failure.hash !== hash && (failure.kind === "cancelled" || failure.kind === "replaced")
      ? { hash: failure.hash, label: failure.kind === "cancelled" ? "Cancelled by" : "Replaced by" }
      : undefined;
  return (
    <div className="glass-inset rounded-[0.875rem] px-3.5 py-3" aria-label={kind === "order" ? "Order progress" : "Approval progress"}>
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.label} className={cn("flex items-center gap-2.5 text-[0.75rem]", s.status === "todo" ? "text-subtle" : "text-[#dfe4f5]")}>
            <span className="grid size-5 place-items-center">{icon[s.status]}</span>
            <span>{s.label}</span>
            <span className="sr-only">: {word[s.status]}</span>
          </li>
        ))}
      </ol>
      {hash && (
        <p className="mt-2.5 border-t border-white/[0.08] pt-2 text-[0.6875rem] text-muted-foreground">
          Submitted as{" "}
          <Link href={`/tx/${hash}`} className="font-mono text-lilac hover:text-white" title={hash}>
            {shortAddress(hash, 10, 6)}
          </Link>
          {state.delayed && <span className="mt-1 block text-warn">Not confirmed yet. It may still be pending; do not resubmit.</span>}
          {other && (
            <span className="mt-1 block">
              {other.label}{" "}
              <Link href={`/tx/${other.hash}`} className="font-mono text-lilac hover:text-white" title={other.hash}>
                {shortAddress(other.hash, 10, 6)}
              </Link>
            </span>
          )}
        </p>
      )}
    </div>
  );
}
