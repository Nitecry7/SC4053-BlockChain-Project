"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import {
  useDeploymentCheck,
  useMarketSnapshot,
  useMarketTokens,
  useTokenDetails,
  useTradeStats,
  useWalletBalances,
} from "@/hooks/use-dex-data";
import { PRIMARY_DEPLOYMENT, SUPPORTED_CHAIN_IDS } from "@/lib/deployment";
import { getNetworkStatus } from "@/lib/network-status";

export const DEPLOYMENT = PRIMARY_DEPLOYMENT;
export const PAIR_TOKENS = [DEPLOYMENT.baseToken.address, DEPLOYMENT.quoteToken.address] as readonly Address[];

export type PairToken = { address: Address; symbol: string; name: string; decimals: number };
export type Pair = { base: PairToken; quote: PairToken };

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * The dashboard's shared on-chain state. Public reads run without a wallet; balances need the right network.
 * `marketAddress` (appended, optional) selects any registered market; the default is the exported primary market.
 */
export function useDashboard(marketAddress?: Address) {
  const account = useAccount();
  const network = getNetworkStatus({ status: account.status, chainId: account.chainId, supportedChainIds: SUPPORTED_CHAIN_IDS });
  const deployment = useDeploymentCheck();
  const live = deployment.status.kind === "ok";
  const ready = network.kind === "ready";

  const marketAddr = (marketAddress ?? DEPLOYMENT.market) as Address;
  const isPrimary = sameAddress(marketAddr, DEPLOYMENT.market);

  // Any other market's tokens are read from that market; the primary market's are known from the export.
  const otherTokens = useMarketTokens(marketAddr, live && !isPrimary);
  const tokenAddresses: readonly Address[] | undefined = isPrimary ? PAIR_TOKENS : otherTokens.data;

  const tokens = useTokenDetails(tokenAddresses ?? [], live && tokenAddresses !== undefined);
  const balances = useWalletBalances(live && ready ? account.address : undefined, tokenAddresses ?? []);
  const market = useMarketSnapshot(marketAddr, live);
  const trades = useTradeStats(marketAddr, live);

  const pair: Pair = useMemo(() => {
    const fallback = (address: Address, known?: { symbol: string; name: string }): PairToken => ({
      address,
      symbol: known?.symbol ?? shortAddr(address),
      name: known?.name ?? "Reading token…",
      decimals: 18,
    });
    const [baseAddr, quoteAddr] = tokenAddresses ?? [undefined, undefined];
    const known = (address: Address | undefined) =>
      address && isPrimary
        ? sameAddress(address, DEPLOYMENT.baseToken.address)
          ? DEPLOYMENT.baseToken
          : DEPLOYMENT.quoteToken
        : undefined;
    const from = (i: 0 | 1, address: Address | undefined): PairToken => {
      const detail = tokens.data?.[i];
      if (detail) return { address: detail.address, symbol: detail.symbol, name: detail.name, decimals: detail.decimals };
      return fallback(address ?? ("0x0000000000000000000000000000000000000000" as Address), known(address));
    };
    return { base: from(0, baseAddr), quote: from(1, quoteAddr) };
  }, [tokens.data, tokenAddresses, isPrimary]);

  return { account, network, deployment, live, ready, tokens, balances, market, trades, pair, marketAddress: marketAddr, isPrimary };
}

export type DashboardState = ReturnType<typeof useDashboard>;
