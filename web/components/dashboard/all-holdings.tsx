"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { shortAddress } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { TokenMark } from "@/components/data/token-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllTokenHoldings } from "@/hooks/use-holdings";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";
import type { DashboardState } from "./use-dashboard";
import { WalletHint } from "./wallet-panels";

const FIRST_ROWS = 6;

/**
 * The connected wallet's balance in every discoverable token (TokenFactory registry, listed markets' tokens, the seed pair),
 * deduplicated by contract address. A token inventory, not a portfolio: balances are never added together and there are no
 * prices. Distinct from the pair panels, which belong to the selected market.
 */
export function AllHoldings({ state }: { state: DashboardState }) {
  const [includeZero, setIncludeZero] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const zeroId = useId();
  const showing = state.live && state.ready;
  const h = useAllTokenHoldings({ account: showing ? state.account.address : undefined, enabled: state.live, includeZero });
  const visible = showAll ? h.rows : h.rows.slice(0, FIRST_ROWS);

  return (
    <Panel
      id="all-holdings"
      title="All Token Holdings"
      action={
        <Link href="/tokens" className="text-[0.75rem] font-medium text-lilac hover:text-white">
          All Tokens <span aria-hidden>→</span>
        </Link>
      }
    >
      {!showing ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          <WalletHint state={state} />
        </p>
      ) : h.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full bg-white/6" />
          <Skeleton className="h-12 w-full bg-white/6" />
        </div>
      ) : h.isError ? (
        <p role="status" className="text-[0.8125rem] text-warn">
          Could not read your balances from the chain. They refresh on the next block.
        </p>
      ) : (
        <>
          <label htmlFor={zeroId} className="mb-2.5 flex min-h-8 w-fit cursor-pointer items-center gap-2 text-[0.75rem] text-muted-foreground">
            <input
              id={zeroId}
              type="checkbox"
              checked={includeZero}
              onChange={(e) => {
                setIncludeZero(e.target.checked);
                setShowAll(false);
              }}
              className="size-4 accent-[#7c5cf2]"
            />
            Show zero balances
          </label>
          {h.rows.length === 0 ? (
            <p className="glass-inset rounded-[0.875rem] px-3.5 py-3 text-[0.8125rem] text-muted-foreground">
              {includeZero ? "No tokens discovered yet." : `No token balances yet in this wallet (${h.tokenCount} token${h.tokenCount === 1 ? "" : "s"} checked).`}
            </p>
          ) : (
            <ul className="space-y-1.5" aria-label="Token balances in this wallet">
              {visible.map((r) => (
                <li key={r.address} className="glass-inset flex min-h-[3.25rem] items-center gap-3 rounded-[0.875rem] px-3 py-2">
                  <TokenMark symbol={r.symbol ?? "?"} />
                  <div className="min-w-0">
                    <p data-token-symbol className="truncate text-[0.875rem] font-semibold">{r.symbol ?? shortAddress(r.address)}</p>
                    <p className="truncate text-[0.6875rem] text-muted-foreground">{r.name ?? shortAddress(r.address)}</p>
                  </div>
                  <div className="ml-auto shrink-0 text-right">
                    <p className="text-[0.8125rem] font-semibold">
                      {r.balance !== undefined && r.decimals !== undefined ? (
                        <Amount value={r.balance} decimals={r.decimals} visible={2} showTail={false} symbol={r.symbol} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </p>
                    <p className={cn("text-[0.6875rem]", r.provenance === "issued" ? "text-buy" : r.provenance === "external" ? "text-warn" : "text-subtle")}>
                      {r.provenance === "issued" ? "Issued by TokenFactory" : r.provenance === "external" ? "Listed externally" : "Reading…"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {h.rows.length > FIRST_ROWS && (
            <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="mt-2 text-[0.75rem] font-medium text-lilac hover:text-white">
              {showAll ? "Show fewer" : `Show all ${h.rows.length}`}
            </button>
          )}
          {h.unreadable > 0 && (
            <p role="status" className="mt-2 text-[0.6875rem] text-warn">
              {h.unreadable} token{h.unreadable === 1 ? "" : "s"} did not answer a balance query and {h.unreadable === 1 ? "is" : "are"} left out.
            </p>
          )}
          {h.truncated && <p className="mt-2 text-[0.6875rem] text-warn">Only the first tokens of a very large registry are read.</p>}
          <p className="mt-2.5 text-[0.6875rem] text-subtle">Each balance is in that token&rsquo;s own units: nothing is added up and there are no prices.</p>
        </>
      )}
    </Panel>
  );
}
