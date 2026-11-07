"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Address } from "viem";
import { AddressChip } from "@/components/data/address-chip";
import { MarketPicker } from "@/components/trade/market-picker";
import { marketHref } from "@/lib/market-select";
import { Panel } from "./panel";
import { DEPLOYMENT, type DashboardState } from "./use-dashboard";

/**
 * Chooses which listed market the market-specific panels show. The market is carried in the URL (`?market=`), so a reload
 * or a shared link keeps it; choosing one only changes the URL: it never sends a transaction or asks the wallet to sign.
 */
export function MarketSelector({ state }: { state: DashboardState }) {
  const router = useRouter();
  const pathname = usePathname();
  const { pair, marketAddress } = state;
  return (
    <Panel id="market-selector" title="Market" className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <MarketPicker live={state.live} value={marketAddress as Address} onChange={(m) => router.replace(marketHref(pathname, m, DEPLOYMENT.market as Address))} />
        <p className="flex flex-wrap items-center gap-2 text-[0.75rem] text-muted-foreground" aria-live="polite">
          <span>
            Showing <span className="tabular font-semibold text-foreground">{pair.base.symbol} / {pair.quote.symbol}</span>
          </span>
          <AddressChip address={marketAddress as Address} className="text-[0.6875rem]" />
        </p>
      </div>
    </Panel>
  );
}
