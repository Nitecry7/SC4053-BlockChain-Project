"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AddressChip } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { EmptyState } from "@/components/data/states";
import { PairMark } from "@/components/data/token-mark";
import { Panel } from "@/components/dashboard/panel";
import { StatusBanners } from "@/components/dashboard/status-banners";
import { useDashboard } from "@/components/dashboard/use-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketRegistry, useMarketSnapshot, useTokenDetails, useTradeStats, type RegisteredMarket } from "@/hooks/use-dex-data";
import { DEPLOYMENT } from "@/components/dashboard/use-dashboard";
import { FactoryFacts } from "./factory-facts";
import { matches, PageHeader } from "./page-header";

function P({ v, has = true }: { v: bigint | undefined; has?: boolean }) {
  if (v === undefined) return <span className="text-muted-foreground">…</span>;
  if (!has || v === 0n) return <span className="text-muted-foreground">—</span>;
  return <Amount value={v} visible={4} showTail={false} />;
}

function MarketRowData({ market, query }: { market: RegisteredMarket; query: string }) {
  const [b, q] = useTokenDetails([market.base, market.quote]).data ?? [];
  const snap = useMarketSnapshot(market.address, true, 1).data;
  const trades = useTradeStats(market.address).data;
  if (b && q && !matches(query, b.symbol, q.symbol, b.name, q.name, market.address, market.base, market.quote)) return null;
  const pair = b && q ? `${b.symbol} / ${q.symbol}` : undefined;
  return (
    <tr className="border-b border-white/[0.07] last:border-0 max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-1.5 max-md:py-3">
      <td className="py-3 pr-3 max-md:col-span-2 max-md:py-0">
        <span className="flex items-center gap-2.5 font-semibold">
          {b && q ? <PairMark base={b.symbol} quote={q.symbol} size="md" /> : <Skeleton className="size-8 rounded-full bg-white/8" />}
          {pair ? <Link href={`/trade?market=${market.address}`} className="hover:text-lilac">{pair}</Link> : <Skeleton className="h-4 w-24 bg-white/8" />}
        </span>
      </td>
      <td className="py-3 pr-3 max-md:col-span-2 max-md:py-0">
        <AddressChip address={market.address} />
      </td>
      <td className="tabular py-3 text-right max-md:py-0 max-md:text-left">
        <span className="text-muted-foreground md:hidden">Last </span>
        <P v={snap?.lastTradePrice} has={snap?.hasTradePrice} />
      </td>
      <td className="tabular py-3 text-right text-buy max-md:py-0 max-md:text-left">
        <span className="text-muted-foreground md:hidden">Bid </span>
        <P v={snap?.bestBid.price} />
      </td>
      <td className="tabular py-3 text-right text-sell max-md:py-0 max-md:text-left">
        <span className="text-muted-foreground md:hidden">Ask </span>
        <P v={snap?.bestAsk.price} />
      </td>
      <td className="tabular py-3 text-right max-md:py-0 max-md:text-left">
        <span className="text-muted-foreground md:hidden">Trades </span>
        {trades ? trades.count : "…"}
      </td>
      <td className="tabular py-3 pl-3 text-right max-md:col-span-2 max-md:py-0 max-md:text-left">
        <span className="text-muted-foreground md:hidden">Volume </span>
        {trades && b ? <Amount value={trades.baseVolume} visible={2} showTail={false} symbol={b.symbol} /> : "…"}
      </td>
    </tr>
  );
}

export function MarketsView() {
  const state = useDashboard();
  const query = useSearchParams().get("q") ?? "";
  const reg = useMarketRegistry(state.live);
  return (
    <>
      <PageHeader title="Markets" meta={reg.total !== undefined ? `${reg.total.toString()} listed through MarketFactory` : undefined}>
        Every order book listed through the on-chain MarketFactory registry, with its live top of book and the volume traded since
        deployment. Prices are in the quote token per base token.
      </PageHeader>
      <StatusBanners state={state} />
      {reg.total !== undefined && reg.markets && reg.total > BigInt(reg.markets.length) && (
        <p role="status" className="mb-4 text-[0.75rem] text-muted-foreground">
          Showing the first {reg.markets.length} of {reg.total.toString()} listed markets (oldest first). A newer market is still reachable by its address on the Trade page.
        </p>
      )}
      <Panel title={query ? `Results for “${query}”` : "All Markets"}>
        {!state.live ? (
          <EmptyState title="No live markets">The registry is read once the deployment is found on this chain.</EmptyState>
        ) : !reg.markets ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full bg-white/6" />
            <Skeleton className="h-10 w-full bg-white/6" />
          </div>
        ) : reg.markets.length === 0 ? (
          <EmptyState title="No markets listed yet" />
        ) : (
          <table className="w-full text-[0.8125rem]">
            <caption className="sr-only">Listed markets</caption>
            <thead className="max-md:sr-only">
              <tr className="border-b border-white/[0.09] text-[0.6875rem] text-muted-foreground">
                <th scope="col" className="pb-2 text-left font-medium">Pair</th>
                <th scope="col" className="pb-2 text-left font-medium">Market Contract</th>
                <th scope="col" className="pb-2 text-right font-medium">Last Trade</th>
                <th scope="col" className="pb-2 text-right font-medium">Best Bid</th>
                <th scope="col" className="pb-2 text-right font-medium">Best Ask</th>
                <th scope="col" className="pb-2 text-right font-medium">Trades</th>
                <th scope="col" className="pb-2 text-right font-medium">Base Volume</th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {reg.markets.map((m) => (
                <MarketRowData key={m.address} market={m} query={query} />
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <FactoryFacts
        title="How Markets Are Listed"
        address={DEPLOYMENT.marketFactory}
        facts={[
          { term: "One market per pair", detail: "A pair can be listed once, in either order. The reverse pair is refused, so liquidity is never split." },
          { term: "18-decimal tokens only", detail: "The order book refuses tokens that do not report 18 decimals, and a pair of the same token twice." },
          { term: "Order book, not a pool", detail: "Each market is a limit order book. Fills execute at the resting order's price, with price-time priority." },
          { term: "First lister sets the order", detail: "Whoever lists a pair first chooses which token is the base. The other side cannot be listed again." },
        ]}
      />
    </>
  );
}
