"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Address, PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { anvil } from "@/lib/chains";
import { describeTxError } from "@/lib/errors";
import type { PairInfo } from "@/lib/order-runner";
import { previewTrigger, runTrigger, triggerDeps, type TriggerOutcome, type TriggerPreview } from "@/lib/trigger-runner";
import { useTxFlow, ZERO } from "./use-tx-flow";

/** Any account can simulate the call: `triggerStopOrders` ignores the caller and needs no tokens. Used when no wallet is connected. */
const SIMULATION_CALLER = "0x000000000000000000000000000000000000dEaD" as Address;
const neverSends = async (): Promise<never> => {
  throw new Error("this hook only reads");
};

/**
 * How many stops `triggerStopOrders(limit)` would activate right now, from ONE `eth_call` per block (the per-block
 * refresh invalidates every non-static query). This is the only market-wide oracle: the engine has no view of its stop
 * lists. It follows the engine's own rule, including that only the heads of the stop lists are tested. It is enabled only
 * once the market has a trade price, because before the first trade the call returns 0 by definition.
 */
export function useTriggerableStops(market: Address, limit: bigint | undefined, account: Address | undefined, enabled: boolean) {
  const client = usePublicClient({ chainId: anvil.id });
  return useQuery({
    queryKey: ["triggerable-stops", anvil.id, market, limit?.toString(), account ?? "none"],
    enabled: enabled && Boolean(client) && limit !== undefined,
    queryFn: async (): Promise<bigint> => triggerDeps(client as PublicClient, neverSends).simulateTriggers(market, limit!, account ?? SIMULATION_CALLER),
  });
}

/**
 * Triggering stops: the shared lifecycle core (`useTxFlow`) bound to `triggerStopOrders`. Same guarantees as the
 * ticket, Cancel and Match: one request at a time, an account, network or market change drops the attempt, and a
 * confirmed or failed attempt re-reads every query. No approval, no loop: another call is a new, deliberate click.
 */
export function useTriggerFlow(pair: PairInfo | undefined, limit: bigint | undefined) {
  const core = useTxFlow<TriggerOutcome>(pair?.market);

  const trigger = () => {
    if (!pair || limit === undefined || pair.baseToken === ZERO || pair.quoteToken === ZERO) return;
    core.start("order", ({ ctx, attempt, send, isCurrent, publicClient, write }) =>
      runTrigger(triggerDeps(publicClient, write), { ctx, pair, limit, attempt }, send, isCurrent),
    );
  };

  return { state: core.state, ctx: core.ctx, trigger, reset: core.reset, dismissAbandoned: core.dismissAbandoned, busy: core.busy };
}

export type TriggerPreviewState = { status: "idle" } | { status: "loading" } | { status: "ready"; preview: TriggerPreview } | { status: "error"; message: string };

/** The read-only look before the wallet is asked, run when the review opens; reopening the review asks the contract again. */
export function useTriggerPreview(market: Address | undefined, limit: bigint | undefined, account: Address | undefined, enabled: boolean): TriggerPreviewState {
  const publicClient = usePublicClient({ chainId: anvil.id });
  const [result, setResult] = useState<{ key: string; state: TriggerPreviewState } | undefined>();
  const key = enabled && publicClient && market && limit !== undefined && account ? `${market}:${limit}:${account}` : undefined;
  useEffect(() => {
    if (!key || !publicClient || !market || limit === undefined || !account) return;
    let live = true;
    previewTrigger(triggerDeps(publicClient as PublicClient, neverSends), market, limit, account).then(
      (preview) => live && setResult({ key, state: { status: "ready", preview } }),
      (e: unknown) => live && setResult({ key, state: { status: "error", message: `${describeTxError(e).title}. ${describeTxError(e).detail}` } }),
    );
    return () => {
      live = false;
      setResult(undefined);
    };
  }, [key, publicClient, market, limit, account]);
  if (!key) return { status: "idle" };
  return result?.key === key ? result.state : { status: "loading" };
}
