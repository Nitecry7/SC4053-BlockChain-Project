"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";
import { anvil } from "@/lib/chains";
import { assessChain, type ChainAnchor } from "@/lib/chain-reset";
import { orderBookAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import { DEPLOYMENT_CODE_KEY, DEPLOYMENT_TARGETS } from "@/lib/deployment-targets";
import { isPerBlockRefresh, isTransactionRefresh } from "@/lib/query-scope";
import { createRpcHealthMonitor, type Head, type RpcHealthSnapshot, type RpcHealthState } from "@/lib/rpc-health";

type Value = RpcHealthSnapshot & { dismissReset: () => void };

const INITIAL: RpcHealthSnapshot = { state: "unknown", lastOkAt: undefined, everRead: false, resetEvidence: undefined };
export const RpcHealthContext = createContext<Value>({ ...INITIAL, dismissReset: () => {} });

/** The RPC health state for banners and gating. Without a provider (tests, isolated components) it is `unknown`: nothing blocked. */
export function useRpcHealth(): Value {
  return useContext(RpcHealthContext);
}

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

/** `eth_getBlockByNumber("latest")`: number and hash in one request, no viem cache, no transport retries. */
async function probeHead(client: Client): Promise<Head> {
  const b = (await client.request({ method: "eth_getBlockByNumber", params: ["latest", false] }, { retryCount: 0 })) as { number: Hex; hash: Hex } | null;
  if (!b?.hash || !b.number) throw new Error("node returned no block");
  return { number: BigInt(b.number), hash: b.hash };
}

/**
 * Chain identity by the existing P2-7 rules (`assessChain`), then fresh reads of the deployment (contract code at every
 * address) and, when the code exists, the market's own token addresses. Throws if any read fails.
 */
async function verifyRecovery(client: Client, queryClient: QueryClient, anchor: ChainAnchor | undefined, head: Head) {
  const genesis = await client.getBlock({ blockNumber: 0n });
  let reset = false;
  let evidence: string[] = [];
  if (anchor) {
    const hashAtAnchor = await client
      .getBlock({ blockNumber: anchor.blockNumber })
      .then((b) => b.hash)
      .catch((e: { name?: string }) => (e?.name === "BlockNotFoundError" ? null : Promise.reject(e)));
    const verdict = assessChain(anchor, { genesisHash: genesis.hash, latestNumber: head.number, hashAtAnchor });
    if (verdict.verdict === "unknown") throw new Error("chain identity could not be established");
    reset = verdict.verdict === "reset";
    evidence = verdict.evidence;
  }
  const codes = await queryClient.fetchQuery({
    queryKey: DEPLOYMENT_CODE_KEY,
    staleTime: 0,
    queryFn: () => Promise.all(DEPLOYMENT_TARGETS.map((t) => client.getCode({ address: t.address }))),
  });
  if (codes.every((c) => c && c !== "0x")) {
    const market = PRIMARY_DEPLOYMENT.market as Address;
    await Promise.all([
      client.readContract({ address: market, abi: orderBookAbi, functionName: "baseToken" }),
      client.readContract({ address: market, abi: orderBookAbi, functionName: "quoteToken" }),
    ]);
  }
  return { reset, evidence, anchor: { genesisHash: genesis.hash, blockNumber: head.number, blockHash: head.hash } };
}

/**
 * Resolves when every active read has been fetched successfully on the verified chain: nothing fetching, invalidated,
 * pending or in error, on two consecutive checks. Invalidating a query is not proof that it was re-read.
 */
function settled(queryClient: QueryClient, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let clean = 0;
    const check = () => {
      const active = queryClient.getQueryCache().findAll({ type: "active", predicate: isTransactionRefresh });
      const bad = active.some((q) => q.state.fetchStatus !== "idle" || q.state.isInvalidated || q.state.status !== "success");
      clean = bad ? 0 : clean + 1;
      if (clean >= 2) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("reads did not settle"));
      setTimeout(check, 250);
    };
    setTimeout(check, 500);
  });
}

export function RpcHealthProvider({ children }: { children: ReactNode }) {
  const client = usePublicClient({ chainId: anvil.id });
  const queryClient = useQueryClient();
  const [snap, setSnap] = useState<RpcHealthSnapshot>(INITIAL);
  const monitorRef = useRef<ReturnType<typeof createRpcHealthMonitor> | undefined>(undefined);

  useEffect(() => {
    if (!client) return;
    const monitor = createRpcHealthMonitor({
      probe: () => probeHead(client),
      genesisHash: async () => (await client.getBlock({ blockNumber: 0n })).hash,
      verify: (anchor, head) => verifyRecovery(client, queryClient, anchor, head),
      invalidate: (reset) => void queryClient.invalidateQueries(reset ? undefined : { predicate: isPerBlockRefresh }),
      settle: () => settled(queryClient, 9_000),
      now: () => Date.now(),
      onChange: setSnap,
    });
    monitorRef.current = monitor;
    monitor.start();
    return () => {
      monitor.stop();
      monitorRef.current = undefined;
    };
  }, [client, queryClient]);

  const dismissReset = useCallback(() => monitorRef.current?.dismissReset(), []);
  const value = useMemo(() => ({ ...snap, dismissReset }), [snap, dismissReset]);
  return <RpcHealthContext.Provider value={value}>{children}</RpcHealthContext.Provider>;
}

export type { RpcHealthState };
