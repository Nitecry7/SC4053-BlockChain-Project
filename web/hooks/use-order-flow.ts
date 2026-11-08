"use client";

import { viemDeps, runApproval, runOrder, type PairInfo } from "@/lib/order-runner";
import type { ValidOrder } from "@/lib/order-input";
import { runStopOrder, type TicketOutcome } from "@/lib/stop-runner";
import { useTxFlow, ZERO } from "./use-tx-flow";

/**
 * Orders and approvals: the shared lifecycle core (`useTxFlow`) bound to `placeLimitOrder`, `placeStopLimitOrder` and
 * `approve`. A stop-limit order (`order.kind === "stop"`) uses the same approval step and the same lifecycle; only the
 * order call, its receipt decoding and its verification differ (`runStopOrder`).
 */
export function useOrderFlow(pair: PairInfo | undefined) {
  const core = useTxFlow<TicketOutcome>(pair?.market);

  const launch = (kind: "approve" | "order", order: ValidOrder) => {
    if (!pair || pair.baseToken === ZERO || pair.quoteToken === ZERO) return; // the market's tokens have not been read yet
    core.start(kind, ({ ctx, attempt, send, isCurrent, publicClient, write }) => {
      const deps = viemDeps(publicClient, write);
      const params = { ctx, pair, order, attempt };
      if (kind === "approve") return runApproval<TicketOutcome>(deps, params, send, isCurrent);
      return order.kind === "stop" ? runStopOrder(deps, params, send, isCurrent) : runOrder(deps, params, send, isCurrent);
    });
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
