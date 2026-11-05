"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Address } from "viem";
import { Panel } from "@/components/dashboard/panel";
import { BookPanel, DepthPanel } from "@/components/dashboard/market-panels";
import { StatusBanners } from "@/components/dashboard/status-banners";
import { MarketRequestNotice } from "@/components/dashboard/market-request-notice";
import { DEPLOYMENT, useDashboard } from "@/components/dashboard/use-dashboard";
import { EmptyState } from "@/components/data/states";
import { PageHeader } from "@/components/registry/page-header";
import { useMarketChoice } from "@/hooks/use-market-choice";
import { marketHref } from "@/lib/market-select";
import { MarketPicker } from "./market-picker";
import { MyOrders } from "./my-orders";
import { OrderTicket } from "./order-ticket";

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
          <Panel
            id="market"
            title="Market"
            action={
              <Link href={marketHref("/", market, DEPLOYMENT.market as Address)} className="text-[0.75rem] font-medium text-lilac hover:text-white">
                Dashboard view <span aria-hidden>→</span>
              </Link>
            }
          >
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
  const { requested, choice, status, live } = useMarketChoice();

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
      <MarketRequestNotice status={status} requested={requested} />
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
