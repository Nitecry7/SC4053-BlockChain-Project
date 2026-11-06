"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { anvil } from "@/lib/chains";
import { assessChain, type ChainAnchor } from "@/lib/chain-reset";

const POLL_MS = 3_000;

/**
 * Notices when the local chain is replaced under the app (Anvil restarted, a snapshot reverted). viem's block watcher
 * cannot: after a restart the head is BELOW the old one, so it emits nothing and the page would keep showing the old
 * chain's balances and orders. This polls the head and re-reads the block the app last saw; only a block-identity
 * mismatch or a head below that block counts as a reset (see `assessChain`). An unreachable node is not a reset.
 * On a reset every cached read is invalidated and the notice says why.
 */
export function useChainWatch() {
  const client = usePublicClient({ chainId: anvil.id });
  const queryClient = useQueryClient();
  const anchor = useRef<ChainAnchor | undefined>(undefined);
  const [evidence, setEvidence] = useState<string[] | undefined>();

  useEffect(() => {
    if (!client) return;
    let stopped = false;
    const tick = async () => {
      try {
        const head = await client.getBlock();
        if (stopped) return;
        const prev = anchor.current;
        if (!prev) {
          const genesis = await client.getBlock({ blockNumber: 0n });
          if (!stopped) anchor.current = { genesisHash: genesis.hash, blockNumber: head.number, blockHash: head.hash };
          return;
        }
        const atAnchor = await client.getBlock({ blockNumber: prev.blockNumber }).catch((e: { name?: string }) => (e?.name === "BlockNotFoundError" ? null : undefined));
        if (stopped) return;
        const verdict = assessChain(prev, {
          genesisHash: undefined, // the anchor block's identity is enough; the genesis block is compared when a transaction is waiting
          latestNumber: head.number,
          hashAtAnchor: atAnchor === undefined ? undefined : atAnchor === null ? null : atAnchor.hash,
        });
        if (verdict.verdict === "reset") {
          const genesis = await client.getBlock({ blockNumber: 0n }).catch(() => undefined);
          anchor.current = { genesisHash: genesis?.hash ?? prev.genesisHash, blockNumber: head.number, blockHash: head.hash };
          setEvidence(verdict.evidence);
          void queryClient.invalidateQueries();
          // viem caches `getBlockNumber` for about one polling interval, so the first re-read can still return the old
          // head; read everything once more after the cache has expired.
          setTimeout(() => {
            if (!stopped) void queryClient.invalidateQueries();
          }, (client.cacheTime ?? 4_000) + 500);
        } else if (verdict.verdict === "continuous" && head.number > prev.blockNumber) {
          anchor.current = { ...prev, blockNumber: head.number, blockHash: head.hash };
        }
      } catch {
        // Node unreachable or a transient RPC error: no evidence, so no claim. The deployment banner covers a dead node.
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [client, queryClient]);

  const dismiss = useCallback(() => setEvidence(undefined), []);
  return { evidence, dismiss };
}
