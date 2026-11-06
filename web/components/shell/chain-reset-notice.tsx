"use client";

import { RefreshCw } from "lucide-react";
import { useChainWatch } from "@/hooks/use-chain-watch";
import { useRpcHealth } from "@/hooks/use-rpc-health";

/** Shown after the local chain is provably not the one the page was reading. Everything on screen is re-read. */
export function ChainResetNotice() {
  const watch = useChainWatch();
  const health = useRpcHealth();
  // The chain watcher and the RPC health check can prove the same reset. One notice, whichever saw it first.
  const evidence = watch.evidence ?? health.resetEvidence;
  const dismiss = () => {
    watch.dismiss();
    health.dismissReset();
  };
  if (!evidence) return null;
  return (
    <div role="status" data-testid="chain-reset-notice" className="mb-4 flex gap-3 rounded-2xl border border-warn/35 bg-warn/[0.08] px-4 py-3.5">
      <RefreshCw className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
      <div className="min-w-0 flex-1 text-[0.8125rem]">
        <p className="font-semibold">The local chain changed</p>
        <p className="mt-0.5 text-muted-foreground">
          {evidence.join("; ")}. Balances, orders and markets have been re-read. A transaction you were waiting for cannot be confirmed on this chain: check My orders before placing it again. If the contracts
          are gone, deploy them again (docs/DEPLOYMENT.md).
        </p>
      </div>
      <button type="button" onClick={dismiss} className="h-9 shrink-0 self-start rounded-lg px-3 text-[0.75rem] font-medium text-lilac hover:text-white">
        Dismiss
      </button>
    </div>
  );
}
