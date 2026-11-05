"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { isAddress, type Address } from "viem";
import { Panel } from "@/components/dashboard/panel";
import { BookPanel, DepthPanel } from "@/components/dashboard/market-panels";
import { StatusBanners } from "@/components/dashboard/status-banners";
import { DEPLOYMENT, useDashboard } from "@/components/dashboard/use-dashboard";
import { EmptyState } from "@/components/data/states";
import { PageHeader } from "@/components/registry/page-header";
import { useDeploymentCheck, useIsMarket, useMarketRegistry } from "@/hooks/use-dex-data";
import { MarketPicker } from "./market-picker";
import { MyOrders } from "./my-orders";
import { OrderTicket } from "./order-ticket";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** One market's terminal. Keyed by market in `TradeView`, so switching market resets the form and any flow in flight. */
function TradeTerminal({ market, onSelect }: { market: Address; onSelect: (m: Address) => void }) {
  const state = useDashboard(market);
  const pair = `${state.pair.base.symbol} / ${state.pair.quote.symbol}`;
  return (
    <>
      <PageHeader title="Trade" meta={<span className="tabular">{pair}</span>}>
        Place limit orders on any market listed through MarketFactory. Orders match on-chain at the resting order&rsquo;s price, and your tokens stay in
        your wallet until an order escrows them.
      </PageHeader>
      <StatusBanners state={state} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="grid min-w-0 content-start gap-4 max-xl:order-2">
          <Panel id="market" title="Market">
            <MarketPicker live={state.live} value={market} onChange={onSelect} />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <DepthPanel state={state} />
            <BookPanel state={state} levels={8} />
          </div>
          <MyOrders state={state} />
        </div>
        <div className="min-w-0 max-xl:order-1">
          <OrderTicket state={state} />
        </div>
      </div>
    </>
  );
}

/** The trade page: picks a market from `?market=` (validated against the on-chain registry), else the first listed one. */
export function TradeView() {
  const router = useRouter();
  const pathname = usePathname();
  const requested = useSearchParams().get("market");
  const deployment = useDeploymentCheck();
  const live = deployment.status.kind === "ok";
  const reg = useMarketRegistry(live);

  // A requested market is accepted if it is on the first registry page OR MarketFactory itself says it is a market. The
  // on-chain check means a market listed beyond the first page (or just now) is still reachable by its link.
  const requestedAddress = requested && isAddress(requested) ? (requested as Address) : undefined;
  const onFirstPage = Boolean(requestedAddress && reg.markets?.some((m) => same(m.address, requestedAddress)));
  const registered = useIsMarket(requestedAddress, live && !onFirstPage);

  const choice = useMemo(() => {
    if (requestedAddress && !onFirstPage && registered.data === true) return requestedAddress;
    const markets = reg.markets;
    if (!markets || markets.length === 0) return undefined;
    const asked = requestedAddress ? markets.find((m) => same(m.address, requestedAddress)) : undefined;
    return asked?.address ?? markets.find((m) => same(m.address, DEPLOYMENT.market))?.address ?? markets[0]!.address;
  }, [reg.markets, requestedAddress, onFirstPage, registered.data]);

  // Only a request the chain has refused counts as unknown; while the check is still running nothing is claimed.
  const unknownRequest = Boolean(requested) && reg.markets !== undefined && !onFirstPage && (requestedAddress === undefined || registered.data === false);

  if (!live || !choice) {
    // Not live (no deployment / node down) or no markets yet: show the same page chrome with an honest empty state.
    return (
      <>
        <PageHeader title="Trade">Place limit orders on any market listed through MarketFactory.</PageHeader>
        <TradeUnavailable />
      </>
    );
  }
  return (
    <>
      {requestedAddress && !onFirstPage && registered.isError && (
        <p role="status" className="mb-4 rounded-2xl border border-warn/35 bg-warn/[0.08] px-4 py-3 text-[0.8125rem]">
          Could not check <span className="font-mono">{requested}</span> on-chain, so it is not offered here. Showing a listed market instead.{" "}
          <Link href="/markets" className="text-lilac hover:text-white">All markets</Link>
        </p>
      )}
      {unknownRequest && (
        <p role="status" className="mb-4 rounded-2xl border border-warn/35 bg-warn/[0.08] px-4 py-3 text-[0.8125rem]">
          <span className="font-mono">{requested}</span> is not a market listed through MarketFactory (checked on-chain), so it is not offered here. Showing a listed market
          instead.{" "}
          <Link href="/markets" className="text-lilac hover:text-white">All markets</Link>
        </p>
      )}
      <TradeTerminal key={choice} market={choice} onSelect={(m) => router.replace(`${pathname}?market=${m}`)} />
    </>
  );
}

function TradeUnavailable() {
  const state = useDashboard();
  return (
    <>
      <StatusBanners state={state} />
      <Panel title="Market">
        <EmptyState title={state.live ? "No markets listed yet" : "No live deployment"}>
          {state.live ? "List a market through MarketFactory to trade." : "Trading needs the deployed contracts on this chain."}
        </EmptyState>
      </Panel>
    </>
  );
}
