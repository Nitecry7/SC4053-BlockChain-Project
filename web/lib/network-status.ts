export type WalletConnectionState = "connected" | "connecting" | "reconnecting" | "disconnected";

export type NetworkStatus =
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "wrong-network"; chainId: number; expectedChainId: number }
  | { kind: "ready"; chainId: number };

/** Classifies the wallet's connection for wallet-scoped panels. Public on-chain reads do not depend on it. */
export function getNetworkStatus(input: {
  status: WalletConnectionState;
  chainId: number | undefined;
  supportedChainIds: readonly number[];
}): NetworkStatus {
  const { status, chainId, supportedChainIds } = input;
  if (status === "connecting" || status === "reconnecting") return { kind: "connecting" };
  if (status === "disconnected" || chainId === undefined) return { kind: "disconnected" };
  const expectedChainId = supportedChainIds[0];
  if (expectedChainId === undefined) throw new Error("no supported chain configured");
  if (!supportedChainIds.includes(chainId)) return { kind: "wrong-network", chainId, expectedChainId };
  return { kind: "ready", chainId };
}

export type ContractCodeCheck = { name: string; address: string; code: string | undefined };

export type DeploymentStatus =
  | { kind: "checking" }
  | { kind: "unreachable" }
  | { kind: "missing"; missing: string[] }
  | { kind: "mismatch"; detail: string }
  | { kind: "ok" };

/**
 * Decides whether the exported deployment really exists on the chain the app reads from. The export carries no block
 * hash, so presence of contract code and the market's own token addresses are the evidence.
 */
export function classifyDeployment(input: {
  loading: boolean;
  /** The RPC itself failed (connection refused, timeout). */
  failed: boolean;
  /** Code exists at the market address, but its `baseToken()`/`quoteToken()` reads reverted: not the expected contract. */
  marketReadFailed?: boolean;
  checks: readonly ContractCodeCheck[];
  marketBase: string | undefined;
  marketQuote: string | undefined;
  expectedBase: string;
  expectedQuote: string;
  /** The RPC health monitor says the node is unreachable or unverified after an outage (appended, optional). */
  rpcOffline?: boolean;
}): DeploymentStatus {
  if (input.failed || input.rpcOffline) return { kind: "unreachable" };
  if (input.loading || input.checks.length === 0) return { kind: "checking" };
  const missing = input.checks.filter((c) => !c.code || c.code === "0x").map((c) => c.name);
  if (missing.length > 0) return { kind: "missing", missing };
  if (input.marketReadFailed) {
    return { kind: "mismatch", detail: "The contract at the market address does not answer like an OrderBook." };
  }
  if (!input.marketBase || !input.marketQuote) return { kind: "checking" };
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!same(input.marketBase, input.expectedBase) || !same(input.marketQuote, input.expectedQuote)) {
    return { kind: "mismatch", detail: "The market on this chain trades different tokens from the exported deployment." };
  }
  return { kind: "ok" };
}
