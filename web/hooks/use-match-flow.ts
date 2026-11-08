"use client";

import { useEffect, useState } from "react";
import type { Address, PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { anvil } from "@/lib/chains";
import { describeTxError } from "@/lib/errors";
import { matchDeps, previewMatch, runMatch, type MatchOutcome, type MatchPreview } from "@/lib/match-runner";
import type { PairInfo } from "@/lib/order-runner";
import { useTxFlow, ZERO } from "./use-tx-flow";

/**
 * Batch matching: the shared lifecycle core (`useTxFlow`) bound to `matchOrders`. Same guarantees as the ticket and the
 * cancel flow: one request at a time (a second click while anything is in flight is ignored), an account, network or
 * market change drops the attempt, and a confirmed or failed attempt re-reads every query. There is no approval step and
 * no loop: one click is at most one wallet request, and matching again is a new, deliberate click.
 */
export function useMatchFlow(pair: PairInfo | undefined, limit: bigint | undefined) {
  const core = useTxFlow<MatchOutcome>(pair?.market);

  const match = () => {
    if (!pair || limit === undefined || pair.baseToken === ZERO || pair.quoteToken === ZERO) return; // the market's tokens or limit have not been read yet
    core.start("order", ({ ctx, attempt, send, isCurrent, publicClient, write }) =>
      runMatch(matchDeps(publicClient, write), { ctx, pair, limit, attempt }, send, isCurrent),
    );
  };

  return { state: core.state, ctx: core.ctx, match, reset: core.reset, dismissAbandoned: core.dismissAbandoned, busy: core.busy };
}

export type PreviewState = { status: "idle" } | { status: "loading" } | { status: "ready"; preview: MatchPreview } | { status: "error"; message: string };

/**
 * The read-only look before the wallet is asked, run when the user opens the review (`enabled`) and again if the market,
 * account or limit changes. It is not re-run every block: the transaction re-checks everything when it is confirmed.
 * The result is kept only while the review stays open, so reopening it always asks the contract again.
 */
export function useMatchPreview(market: Address | undefined, limit: bigint | undefined, account: Address | undefined, enabled: boolean): PreviewState {
  const publicClient = usePublicClient({ chainId: anvil.id });
  const [result, setResult] = useState<{ key: string; state: PreviewState } | undefined>();
  const key = enabled && publicClient && market && limit !== undefined && account ? `${market}:${limit}:${account}` : undefined;
  useEffect(() => {
    if (!key || !publicClient || !market || limit === undefined || !account) return;
    let live = true;
    const deps = matchDeps(publicClient as PublicClient, async () => {
      throw new Error("the preview never sends");
    });
    previewMatch(deps, market, limit, account).then(
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
