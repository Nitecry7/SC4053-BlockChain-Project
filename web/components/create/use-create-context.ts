"use client";

import { useAccount } from "wagmi";
import { useDeploymentCheck } from "@/hooks/use-dex-data";
import { SUPPORTED_CHAIN_IDS } from "@/lib/deployment";
import { getNetworkStatus } from "@/lib/network-status";

/** Wallet, network and deployment readiness for the Create token and List market pages. */
export function useCreateContext() {
  const account = useAccount();
  const network = getNetworkStatus({ status: account.status, chainId: account.chainId, supportedChainIds: SUPPORTED_CHAIN_IDS });
  const deployment = useDeploymentCheck();
  return { account, network, deployment, live: deployment.status.kind === "ok", ready: network.kind === "ready" };
}
export type CreateContext = ReturnType<typeof useCreateContext>;
