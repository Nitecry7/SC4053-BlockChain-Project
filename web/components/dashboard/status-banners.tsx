"use client";

import { AlertTriangle, PlugZap } from "lucide-react";
import { useState } from "react";
import { useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { anvil, RPC_URL } from "@/lib/chains";
import { describeError } from "@/lib/errors";
import { useRpcHealth } from "@/hooks/use-rpc-health";
import { dataReadsAllowed } from "@/lib/rpc-health";
import { WalletOutcome, WalletWaiting } from "@/components/wallet/wallet-pending-notice";
import type { DashboardState } from "./use-dashboard";

function Banner({ tone, icon, title, children }: { tone: "warn" | "bad"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const ring = tone === "warn" ? "border-warn/35 bg-warn/[0.08]" : "border-sell/35 bg-sell/[0.08]";
  return (
    <div role="status" className={`mb-4 flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center ${ring}`}>
      <span className={tone === "warn" ? "text-warn" : "text-sell"} aria-hidden>
        {icon}
      </span>
      <div className="flex-1 text-[0.8125rem]">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** Explains, in plain words, why live data is missing: node down, nothing deployed, or the wallet on another chain. */
export function StatusBanners({ state }: { state: Pick<DashboardState, "deployment" | "network"> }) {
  const { deployment, network } = state;
  const { switchChain, isPending, reset } = useSwitchChain();
  const [switchError, setSwitchError] = useState<ReturnType<typeof describeError>>();

  const health = useRpcHealth();
  const s = deployment.status;
  // While the global RPC banner is reporting an outage or a recovery check, it is the one message; this one covers a failed first read.
  const showUnreachable = s.kind === "unreachable" && dataReadsAllowed(health.state);
  return (
    <>
      {showUnreachable && (
        <Banner tone="bad" icon={<PlugZap className="size-5" />} title="Cannot reach the local Anvil node">
          Start it with <code className="font-mono text-foreground">anvil</code> (RPC <span className="font-mono">{RPC_URL}</span>). The page reconnects by itself and verifies
          the chain before enabling transactions.
        </Banner>
      )}
      {(s.kind === "missing" || s.kind === "mismatch") && (
        <Banner tone="warn" icon={<AlertTriangle className="size-5" />} title="No SC4053 DEX deployment on this chain">
          {s.kind === "missing" ? `No contract code at: ${s.missing.join(", ")}.` : s.detail} Run the deploy script and the exporter
          (docs/DEPLOYMENT.md), then reload.
        </Banner>
      )}
      {network.kind === "wrong-network" && (
        <Banner tone="warn" icon={<AlertTriangle className="size-5" />} title={`Your wallet is on chain ${network.chainId}`}>
          <span>
            Switch to {anvil.name} (chain {anvil.id}) to see your balances. Market data below is read from Anvil directly.
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => {
                setSwitchError(undefined);
                switchChain({ chainId: anvil.id }, { onError: (e) => setSwitchError(describeError(e)) });
              }}
            >
              {isPending ? "Waiting for your wallet…" : "Switch to Anvil"}
            </Button>
          </span>
          {isPending && (
            <WalletWaiting
              kind="switch"
              className="mt-3"
              onRetry={() => {
                reset();
                setSwitchError(undefined);
              }}
            />
          )}
          {switchError && !isPending && (
            <WalletOutcome
              kind="switch"
              error={switchError}
              className="mt-3"
              onRetry={() => {
                reset();
                setSwitchError(undefined);
              }}
            />
          )}
        </Banner>
      )}
    </>
  );
}
