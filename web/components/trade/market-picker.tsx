"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { shortAddress } from "@/components/data/address-chip";
import { useMarketRegistry, useTokenDetails } from "@/hooks/use-dex-data";
import { getOrderBusy, subscribeOrderBusy } from "@/lib/busy-store";

/**
 * Every market listed through MarketFactory, read from the on-chain registry (not a hardcoded pair). A native
 * select keeps it keyboard- and screen-reader-friendly.
 */
export function MarketPicker({ live, value, onChange }: { live: boolean; value: Address; onChange: (market: Address) => void }) {
  const reg = useMarketRegistry(live);
  // Switching market remounts the ticket; do not do that while a wallet request or confirmation is open.
  const requestOpen = useSyncExternalStore(subscribeOrderBusy, getOrderBusy, () => false);
  const tokenAddresses = useMemo(
    () => [...new Set((reg.markets ?? []).flatMap((m) => [m.base, m.quote]))] as Address[],
    [reg.markets],
  );
  const details = useTokenDetails(tokenAddresses, live && tokenAddresses.length > 0);
  const symbol = (a: Address) => details.data?.find((t) => t.address.toLowerCase() === a.toLowerCase())?.symbol ?? shortAddress(a);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label htmlFor="market-picker" className="text-[0.75rem] text-muted-foreground">
        Market
      </label>
      <select
        id="market-picker"
        value={value}
        disabled={!live || !reg.markets || requestOpen}
        title={requestOpen ? "Finish or dismiss the current wallet request before switching market" : undefined}
        onChange={(e) => onChange(e.target.value as Address)}
        className="h-10 min-w-0 max-w-full rounded-full border border-white/16 bg-[#0f1528]/80 px-3.5 text-[0.8125rem] text-foreground outline-none focus-visible:border-lilac/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {(reg.markets ?? []).map((m) => (
          <option key={m.address} value={m.address} className="bg-[#10172a]">
            {symbol(m.base)} / {symbol(m.quote)} · {shortAddress(m.address)}
          </option>
        ))}
        {reg.markets && !reg.markets.some((m) => m.address.toLowerCase() === value.toLowerCase()) && <option value={value}>Market {shortAddress(value)} (not on the first page)</option>}
      </select>
      {requestOpen ? (
        <span className="text-[0.6875rem] text-warn" role="status">A request is open in your wallet: finish or dismiss it before switching market.</span>
      ) : (
        reg.total !== undefined && <span className="text-[0.6875rem] text-subtle">{reg.total.toString()} listed</span>
      )}
    </div>
  );
}
