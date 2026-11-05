"use client";

import { viemDeps, runApproval, runOrder, type OrderOutcome, type PairInfo } from "@/lib/order-runner";
import type { ValidOrder } from "@/lib/order-input";
import { useTxFlow, ZERO } from "./use-tx-flow";

/**
 * Orders and approvals: the shared lifecycle core (`useTxFlow`) bound to `placeLimitOrder` and `approve`. The return
 * shape is what the ticket has always used.
 */
export function useOrderFlow(pair: PairInfo | undefined) {
  const core = useTxFlow<OrderOutcome>(pair?.market);

  const launch = (kind: "approve" | "order", order: ValidOrder) => {
    if (!pair || pair.baseToken === ZERO || pair.quoteToken === ZERO) return; // the market's tokens have not been read yet
    core.start(kind, ({ ctx, attempt, send, isCurrent, publicClient, write }) =>
      (kind === "approve" ? runApproval : runOrder)(viemDeps(publicClient, write), { ctx, pair, order, attempt }, send, isCurrent),
    );
  };

  return {
    state: core.state,
    ctx: core.ctx,
    dismissAbandoned: core.dismissAbandoned,
    startApproval: (o: ValidOrder) => launch("approve", o),
    startOrder: (o: ValidOrder) => launch("order", o),
    reset: core.reset,
    busy: core.busy,
  };
}
