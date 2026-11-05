"use client";

import { ArrowLeftRight, BarChart3, Check, Copy, Info, Layers } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Amount } from "@/components/data/amount";
import { TokenMark } from "@/components/data/token-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ConnectControl } from "@/components/wallet/connect-control";
import { Panel } from "./panel";
import type { DashboardState } from "./use-dashboard";

/** Basis points of `part` over `whole`, as a percentage string with two decimals, computed in bigint. */
export function shareOf(part: bigint, whole: bigint): string {
  if (whole === 0n) return "0.00";
  const bp = (part * 10_000n) / whole;
  return `${bp / 100n}.${(bp % 100n).toString().padStart(2, "0")}`;
}

function WalletHint({ state }: { state: DashboardState }) {
  if (!state.live) return <>Live data appears once the deployment is found on this chain.</>;
  if (state.network.kind === "wrong-network") return <>Switch your wallet to Anvil to see your balances.</>;
  if (state.network.kind === "connecting") return <>Connecting to your wallet…</>;
  return <>Connect a wallet to see your balances.</>;
}

/** The screenshot's "portfolio value" area, made honest: holdings in token units and their real share of supply. */
export function HoldingsPanel({ state }: { state: DashboardState }) {
  const { balances, tokens, ready, live } = state;
  const showing = live && ready;
  const [base, quote] = [state.pair.base, state.pair.quote];
  const supply = tokens.data;

  return (
    <Panel
      id="holdings"
      title="Wallet holdings"
      className="relative min-h-[10.5rem]"
      action={
        <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          <Info className="size-3.5" aria-hidden /> Token units, no USD prices
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] sm:items-end">
        <div>
          {showing && balances.data ? (
            <>
              <p className="text-[1.875rem] leading-none font-bold tracking-[-0.05em]">
                <Amount value={balances.data[0]!} visible={2} showTail={false} />
                <span className="ml-2 text-base font-semibold text-muted-foreground">{base.symbol}</span>
              </p>
              <p className="mt-2 text-[1.0625rem] font-semibold tracking-[-0.03em] text-[#dfe3f5]">
                <Amount value={balances.data[1]!} visible={2} showTail={false} />
                <span className="ml-1.5 text-[0.8125rem] font-medium text-muted-foreground">{quote.symbol}</span>
              </p>
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-buy/12 px-2.5 py-1 text-[0.6875rem] font-semibold text-buy">
                <span className="size-1.5 rounded-full bg-buy" aria-hidden /> Read from chain, refreshed every block
              </p>
            </>
          ) : showing ? (
            <div className="space-y-2.5" aria-busy="true">
              <Skeleton className="h-8 w-48 bg-white/8" />
              <Skeleton className="h-5 w-32 bg-white/8" />
            </div>
          ) : (
            <div>
              <p className="text-[1.875rem] leading-none font-bold tracking-[-0.05em] text-white/25" aria-hidden="true">
                — <span className="text-base font-semibold">{base.symbol}</span>
              </p>
              <p className="mt-3 max-w-[32ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
                <WalletHint state={state} />
              </p>
              {live && state.network.kind === "disconnected" && <ConnectControl className="mt-3 h-9 px-3.5 text-xs" />}
            </div>
          )}
        </div>

        <div className="space-y-3" aria-label="Share of total supply held by this wallet">
          {[base, quote].map((t, i) => {
            const bal = showing ? balances.data?.[i] : undefined;
            const total = supply?.[i]?.totalSupply;
            const pct = bal !== undefined && total ? shareOf(bal, total) : undefined;
            const width = pct ? Math.max(Number(pct), bal && bal > 0n ? 1.5 : 0) : 0;
            return (
              <div key={t.symbol}>
                <div className="mb-1.5 flex justify-between text-[0.6875rem] text-muted-foreground">
                  <span>{t.symbol} share of supply</span>
                  <span className="tabular text-foreground">{pct ? `${pct}%` : "—"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={cn("h-full rounded-full", i === 0 ? "bg-linear-to-r from-[#8a6cf5] to-[#b49cff]" : "bg-linear-to-r from-[#3f7df0] to-[#7ec1ff]")}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

const actionBase =
  "flex h-[5.25rem] min-w-0 flex-col items-center justify-center gap-2 rounded-[0.875rem] border px-1 text-[0.75rem] font-medium transition-[background,box-shadow,transform] duration-150";
const actionIdle = "border-white/[0.09] bg-[linear-gradient(150deg,rgb(55_63_91/0.72),rgb(25_33_57/0.9))] hover:border-white/20 hover:bg-[linear-gradient(150deg,rgb(66_75_108/0.8),rgb(30_39_66/0.92))]";

/** Every action here works: Markets, Tokens, Copy address and Place order (opens the Trade page). */
export function QuickActions({ state }: { state: DashboardState }) {
  const [copied, setCopied] = useState(false);
  const address = state.account.address;
  return (
    <Panel id="quick-actions" title="Quick actions">
      <div className="mt-1 grid grid-cols-4 gap-2">
        <Link href="/markets" className={cn(actionBase, "border-[rgb(200_188_255/0.3)] bg-[linear-gradient(140deg,rgb(133_108_255/0.95),rgb(75_62_164/0.9))] text-white shadow-[inset_0_1px_5px_rgb(255_255_255/0.2),0_10px_24px_-10px_rgb(124_92_242/0.8)] hover:brightness-110")}>
          <BarChart3 className="size-5" aria-hidden />
          Markets
        </Link>
        <Link href="/tokens" className={cn(actionBase, actionIdle)}>
          <Layers className="size-5" aria-hidden />
          Tokens
        </Link>
        <button
          type="button"
          disabled={!address}
          onClick={async () => {
            if (!address) return;
            try {
              await navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              setCopied(false);
            }
          }}
          className={cn(actionBase, actionIdle, "disabled:cursor-not-allowed disabled:opacity-45")}
          aria-label={address ? "Copy wallet address" : "Copy wallet address (connect a wallet first)"}
        >
          {copied ? <Check className="size-5 text-buy" aria-hidden /> : <Copy className="size-5" aria-hidden />}
          {copied ? "Copied" : "Copy address"}
        </button>
        <Link href={`/trade?market=${state.marketAddress}`} className={cn(actionBase, actionIdle)}>
          <ArrowLeftRight className="size-5" aria-hidden />
          Place order
        </Link>
      </div>
    </Panel>
  );
}

/** Wallet balances per token, with provenance from the TokenFactory registry instead of invented % changes. */
export function TokenBalances({ state }: { state: DashboardState }) {
  const { tokens, balances, ready, live } = state;
  const list = [state.pair.base, state.pair.quote];
  return (
    <Panel
      id="token-balances"
      title="Token balances"
      action={
        <Link href="/tokens" className="text-[0.75rem] font-medium text-lilac hover:text-white">
          All tokens <span aria-hidden>→</span>
        </Link>
      }
    >
      <ul className="space-y-1.5">
        {list.map((t, i) => {
          const detail = tokens.data?.[i];
          const bal = live && ready ? balances.data?.[i] : undefined;
          return (
            <li key={t.address} className="glass-inset flex min-h-[3.25rem] items-center gap-3 rounded-[0.875rem] px-3 py-2">
              <TokenMark symbol={t.symbol} />
              <div className="min-w-0">
                <p className="text-[0.875rem] font-semibold">{t.symbol}</p>
                <p className="truncate text-[0.6875rem] text-muted-foreground">{detail?.name ?? t.name}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-[0.8125rem] font-semibold">
                  {bal !== undefined ? <Amount value={bal} visible={2} showTail={false} symbol={t.symbol} /> : <span className="text-muted-foreground">—</span>}
                </p>
                {detail ? (
                  <p className={cn("text-[0.6875rem]", detail.issuedByFactory ? "text-buy" : "text-warn")}>
                    {detail.issuedByFactory ? "Issued by TokenFactory" : "Not from TokenFactory"}
                  </p>
                ) : (
                  <p className="text-[0.6875rem] text-subtle">{live ? "Reading…" : "Not deployed"}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!(live && ready) && (
        <p className="mt-2.5 text-[0.6875rem] text-muted-foreground">
          <WalletHint state={state} />
        </p>
      )}
      {tokens.data && (
        <dl className="glass-inset mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[0.875rem] px-3.5 py-3" aria-label="Total supply">
          {tokens.data.map((t) => (
            <div key={t.address}>
              <dt className="text-[0.6875rem] text-muted-foreground">{t.symbol} total supply</dt>
              <dd className="tabular mt-0.5 text-[0.8125rem] font-semibold">
                <Amount value={t.totalSupply} decimals={t.decimals} visible={0} showTail={false} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}
