import { Ban, CircleCheck, CircleDot, Clock, Contrast, Zap } from "lucide-react";
import { statusLabel, statusTone, type StatusTone } from "@/lib/order-status";
import { cn } from "@/lib/utils";

const TONE: Record<StatusTone, { cls: string; Icon: typeof Clock }> = {
  pending: { cls: "border-warn/55 bg-warn/14 text-warn", Icon: Clock },
  resting: { cls: "border-azure/45 bg-azure/12 text-azure", Icon: CircleDot },
  partial: { cls: "border-lilac/50 bg-lilac/14 text-lilac", Icon: Contrast },
  filled: { cls: "border-buy/45 bg-buy/12 text-buy", Icon: CircleCheck },
  cancelled: { cls: "border-white/20 bg-white/[0.07] text-[#b9c2d8]", Icon: Ban },
  unknown: { cls: "border-white/20 bg-white/[0.07] text-[#b9c2d8]", Icon: Ban },
};

/**
 * The on-chain status of an order as a coloured oval: Pending Trigger amber, Resting azure, Partially Filled violet, Filled green,
 * Cancelled grey. Colour is never the only cue: the label is the text and each status has its own icon. It shows ONLY the status
 * the contract reports; "Eligible Now" is a different thing (see `EligibleChip`) and is never passed here.
 */
export function OrderStatusBadge({ status, className, "data-testid": testId }: { status: number; className?: string; "data-testid"?: string }) {
  const tone = statusTone(status);
  const { cls, Icon } = TONE[tone];
  return (
    <span
      data-testid={testId}
      data-status-tone={tone}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap", cls, className)}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {statusLabel(status)}
    </span>
  );
}

/**
 * "Eligible Now": the stop's trigger condition holds right now, but the order is still Pending Trigger on-chain. A dashed outline
 * and a bolt icon keep it visibly apart from the solid status badge beside it.
 */
export function EligibleChip({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) {
  return (
    <span data-testid={testId} className={cn("inline-flex items-center gap-1 rounded-full border border-dashed border-lilac/60 px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap text-lilac", className)}>
      <Zap className="size-3 shrink-0" aria-hidden />
      Eligible Now
    </span>
  );
}
