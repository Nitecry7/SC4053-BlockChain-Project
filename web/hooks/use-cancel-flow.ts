"use client";

import { runCancel, type CancelOutcome } from "@/lib/cancel-runner";
import { viemDeps, type PairInfo } from "@/lib/order-runner";
import { useTxFlow, ZERO } from "./use-tx-flow";

/**
 * Order cancellation: the shared lifecycle core (`useTxFlow`) bound to `cancelOrder`. Same guarantees as the ticket:
 * one request at a time, an account, network or market change drops the attempt, and a confirmed or failed attempt
 * re-reads every query. There is no approval step.
 */
export function useCancelFlow(pair: PairInfo | undefined) {
  const core = useTxFlow<CancelOutcome>(pair?.market);

  const cancel = (orderId: bigint) => {
    if (!pair || pair.baseToken === ZERO || pair.quoteToken === ZERO) return; // the market's tokens have not been read yet
    core.start("order", ({ ctx, attempt, send, isCurrent, publicClient, write }) =>
      runCancel(viemDeps(publicClient, write), { ctx, pair, orderId, attempt }, send, isCurrent),
    );
  };

  return { state: core.state, ctx: core.ctx, cancel, reset: core.reset, dismissAbandoned: core.dismissAbandoned, busy: core.busy };
}
