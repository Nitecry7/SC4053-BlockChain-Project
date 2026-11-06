"use client";

import { PlugZap, RefreshCw } from "lucide-react";
import { useRpcHealth } from "@/hooks/use-rpc-health";
import { RPC_URL } from "@/lib/chains";

function time(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Says so, once, when the node stops answering, and again while a recovered node is being checked. A successful probe
 * only proves the endpoint answers, so the page stays in a "verifying" state until the chain identity and the reads are
 * confirmed (docs/FRONTEND.md, "RPC health"). Silent while healthy.
 */
export function RpcHealthBanner() {
  const { state, lastOkAt, everRead } = useRpcHealth();
  if (state === "unknown" || state === "online") return null;

  if (state === "verifying" || state === "refreshing") {
    return (
      <div role="status" data-testid="rpc-verifying" className="mb-4 flex gap-3 rounded-2xl border border-lilac/35 bg-lilac/[0.08] px-4 py-3.5">
        <RefreshCw className="mt-0.5 size-5 shrink-0 animate-spin text-lilac motion-reduce:animate-none" aria-hidden />
        <div className="text-[0.8125rem]">
          <p className="font-semibold">The node is answering again. Verifying the chain.</p>
          <p className="mt-0.5 text-muted-foreground">
            Checking that this is still the same chain and re-reading balances, orders and markets. Placing orders and creating tokens or markets stay off until
            that is confirmed.
          </p>
        </div>
      </div>
    );
  }

  const unverified = state === "unverified";
  return (
    <div role="alert" data-testid="rpc-offline" className="mb-4 flex gap-3 rounded-2xl border border-sell/35 bg-sell/[0.08] px-4 py-3.5">
      <PlugZap className="mt-0.5 size-5 shrink-0 text-sell" aria-hidden />
      <div className="text-[0.8125rem]">
        <p className="font-semibold">{unverified ? "The node answers, but the chain could not be verified" : "Cannot reach the local Anvil node"}</p>
        <p className="mt-0.5 text-muted-foreground">
          {everRead ? (
            <>
              Balances, orders and market data on screen are <strong className="text-foreground">last known{lastOkAt ? ` (${time(lastOkAt)})` : ""}, not current</strong>.{" "}
            </>
          ) : unverified ? (
            <>The chain&apos;s identity has not been confirmed yet, so nothing on screen is treated as current. </>
          ) : (
            <>Nothing has been read from the chain yet. </>
          )}
          Transactions are disabled. The page keeps checking <span className="font-mono">{RPC_URL}</span> and recovers by itself, no reload needed.
        </p>
      </div>
    </div>
  );
}
