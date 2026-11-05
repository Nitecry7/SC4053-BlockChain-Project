"use client";

import { useSearchParams } from "next/navigation";
import { useDeploymentCheck, useIsMarket, useMarketRegistry } from "@/hooks/use-dex-data";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { parseMarketParam, resolveMarket } from "@/lib/market-select";
import type { Address } from "viem";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The market a page should show, from `?market=` (URL is the source of truth; no storage). A requested address is accepted
 * if it is in the loaded registry or `MarketFactory.isMarket` says so. Must be rendered inside a Suspense boundary.
 */
export function useMarketChoice() {
  const requested = useSearchParams().get("market");
  const live = useDeploymentCheck().status.kind === "ok";
  const reg = useMarketRegistry(live);
  const address = parseMarketParam(requested);
  const onFirstPage = Boolean(address && reg.markets?.some((m) => same(m.address, address)));
  const registered = useIsMarket(address, live && !onFirstPage);
  const { choice, status } = resolveMarket({
    requested,
    primary: PRIMARY_DEPLOYMENT.market as Address,
    markets: reg.markets,
    onChain: registered.data,
    onChainFailed: registered.isError,
  });
  return { requested, choice, status, live, reg };
}
