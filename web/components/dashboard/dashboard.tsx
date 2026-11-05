"use client";

import type { Address } from "viem";
import { useMarketChoice } from "@/hooks/use-market-choice";
import { AllHoldings } from "./all-holdings";
import { Hero } from "./hero";
import { MarketRequestNotice } from "./market-request-notice";
import { MarketSelector } from "./market-selector";
import { BookPanel, DepthPanel, MarketBoard } from "./market-panels";
import Link from "next/link";
import { OrderTicket } from "@/components/trade/order-ticket";
import { CreateListPanel, RoadmapStrip } from "./side-panels";
import { StatusBanners } from "./status-banners";
import { useDashboard } from "./use-dashboard";
import { HoldingsPanel, QuickActions } from "./wallet-panels";

export function Dashboard() {
  const { requested, choice, status } = useMarketChoice();
  const state = useDashboard(choice as Address | undefined);
  return (
    <>
      <Hero state={state} />
      <StatusBanners state={state} />
      <MarketRequestNotice status={status} requested={requested} />
      <MarketSelector state={state} />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_22.5rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <HoldingsPanel state={state} />
            <QuickActions state={state} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
            <AllHoldings state={state} />
            <MarketBoard state={state} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <DepthPanel state={state} />
            <BookPanel state={state} />
          </div>
        </div>
        <div className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          <OrderTicket
            key={state.marketAddress}
            state={state}
            action={
              <Link href={`/trade?market=${state.marketAddress}`} className="text-[0.75rem] font-medium text-lilac hover:text-white">
                Open Trade view <span aria-hidden>→</span>
              </Link>
            }
          />
          <CreateListPanel state={state} />
        </div>
      </div>
      <RoadmapStrip />
    </>
  );
}
