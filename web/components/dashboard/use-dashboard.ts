"use client";

import type { Address } from "viem";
import { useAccount } from "wagmi";
import { useDeploymentCheck, useMarketSnapshot, useTokenDetails, useTradeStats, useWalletBalances } from "@/hooks/use-dex-data";
import { PRIMARY_DEPLOYMENT, SUPPORTED_CHAIN_IDS } from "@/lib/deployment";
import { getNetworkStatus } from "@/lib/network-status";

export const DEPLOYMENT = PRIMARY_DEPLOYMENT;
export const PAIR_TOKENS = [DEPLOYMENT.baseToken.address, DEPLOYMENT.quoteToken.address] as readonly Address[];

/** The dashboard's shared on-chain state. Public reads run without a wallet; balances need the right network. */
export function useDashboard() {
  const account = useAccount();
  const network = getNetworkStatus({ status: account.status, chainId: account.chainId, supportedChainIds: SUPPORTED_CHAIN_IDS });
  const deployment = useDeploymentCheck();
  const live = deployment.status.kind === "ok";
  const ready = network.kind === "ready";

  const tokens = useTokenDetails(PAIR_TOKENS, live);
  const balances = useWalletBalances(live && ready ? account.address : undefined, PAIR_TOKENS);
  const market = useMarketSnapshot(DEPLOYMENT.market as Address, live);
  const trades = useTradeStats(DEPLOYMENT.market as Address, live);

  return { account, network, deployment, live, ready, tokens, balances, market, trades };
}

export type DashboardState = ReturnType<typeof useDashboard>;
