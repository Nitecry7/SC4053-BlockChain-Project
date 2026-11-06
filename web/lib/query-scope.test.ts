import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { readContractsQueryOptions } from "@wagmi/core/query";
import { createConfig, custom } from "wagmi";
import { describe, expect, it } from "vitest";
import { anvil } from "@/lib/chains";
import { demoTokenAbi } from "@/lib/contracts/abis";
import { isPerBlockRefresh, isTransactionRefresh, staticQuery } from "@/lib/query-scope";

// A real QueryClient and a real wagmi config on a counting fake transport. Nothing here touches a network.
const TOKEN_A = "0x1111111111111111111111111111111111111111" as const;
const TOKEN_B = "0x2222222222222222222222222222222222222222" as const;
const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

function setup() {
  const calls = { eth_call: 0, other: 0 };
  let down = false;
  const config = createConfig({
    chains: [anvil],
    transports: {
      [anvil.id]: custom({
        async request({ method }: { method: string }) {
          if (down) throw new Error("connection refused");
          if (method === "eth_call") {
            calls.eth_call++;
            return "0x" + "0".repeat(63) + "5"; // uint256 5 (decimals / balance / anything)
          }
          calls.other++;
          if (method === "eth_chainId") return "0x7a69";
          return "0x0";
        },
      }),
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 4_000, retry: false } } });
  const read = (address: `0x${string}`, functionName: "decimals" | "balanceOf", scope: "static" | "dynamic") => {
    const options = readContractsQueryOptions(config, {
      allowFailure: false,
      contracts: [{ chainId: anvil.id, address, abi: demoTokenAbi, functionName, ...(functionName === "balanceOf" ? { args: [ACCOUNT] } : {}) }] as never,
    });
    // Same merge order as wagmi's `useReadContracts`: `{ ...options, ...query }`.
    return { ...options, ...(scope === "static" ? staticQuery : {}) };
  };
  return { client, read, calls, setDown: (v: boolean) => (down = v) };
}

const refresh = (client: QueryClient, predicate: (q: never) => boolean) =>
  client.invalidateQueries({ predicate: predicate as never });

describe("per-block refresh and static reads, at the real query-cache level", () => {
  it("keeps the meta tag on the cached query object", async () => {
    const { client, read } = setup();
    await client.fetchQuery(read(TOKEN_A, "decimals", "static"));
    await client.fetchQuery(read(TOKEN_A, "balanceOf", "dynamic"));
    const entries = client.getQueryCache().getAll();
    expect(entries).toHaveLength(2);
    const tagged = entries.filter((q) => q.meta?.scope === "static");
    expect(tagged).toHaveLength(1);
    expect(tagged[0]?.queryKey[0]).toBe("readContracts");
  });

  it("a new block refetches dynamic reads and leaves static reads alone", async () => {
    const { client, read, calls } = setup();
    // Active observers are what the refetch acts on, so subscribe the way a mounted hook does.
    const o1 = new QueryObserver(client, read(TOKEN_A, "decimals", "static"));
    const o2 = new QueryObserver(client, read(TOKEN_A, "balanceOf", "dynamic"));
    const u1 = o1.subscribe(() => {});
    const u2 = o2.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 20));
    const afterMount = calls.eth_call;
    expect(afterMount).toBe(2);
    await refresh(client, isPerBlockRefresh);
    expect(calls.eth_call).toBe(afterMount + 1); // only the dynamic read
    u1();
    u2();
  });

  it("a transaction refresh and a full invalidation (chain reset) refetch static reads too", async () => {
    const { client, read, calls } = setup();
    const o1 = new QueryObserver(client, read(TOKEN_A, "decimals", "static"));
    const u1 = o1.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 20));
    const base = calls.eth_call;
    await refresh(client, isTransactionRefresh);
    expect(calls.eth_call).toBe(base + 1);
    await client.invalidateQueries(); // what use-chain-watch does on a reset
    expect(calls.eth_call).toBe(base + 2);
    u1();
  });

  it("a different contract address is a different query, fetched on its own", async () => {
    const { client, read, calls } = setup();
    await client.fetchQuery(read(TOKEN_A, "decimals", "static"));
    await client.fetchQuery(read(TOKEN_B, "decimals", "static"));
    expect(calls.eth_call).toBe(2);
    expect(client.getQueryCache().getAll()).toHaveLength(2);
    await client.fetchQuery(read(TOKEN_A, "decimals", "static")); // cached forever: no new call
    expect(calls.eth_call).toBe(2);
  });

  it("an unreachable RPC is not hidden: a refetch of a dynamic read errors, and the error is visible on the query", async () => {
    const { client, read, setDown } = setup();
    const o = new QueryObserver(client, read(TOKEN_A, "balanceOf", "dynamic"));
    const u = o.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(o.getCurrentResult().isError).toBe(false);
    setDown(true);
    await refresh(client, isPerBlockRefresh);
    expect(o.getCurrentResult().isError).toBe(true);
    expect(o.getCurrentResult().isRefetchError).toBe(true); // stale data is flagged as failing to refresh, not current
    u();
  });
});

describe("isPerBlockRefresh", () => {
  it("skips the block number and static queries only", () => {
    expect(isPerBlockRefresh({ queryKey: ["blockNumber", 1] })).toBe(false);
    expect(isPerBlockRefresh({ queryKey: ["readContracts", {}], meta: { scope: "static" } })).toBe(false);
    expect(isPerBlockRefresh({ queryKey: ["readContracts", {}] })).toBe(true);
    expect(isPerBlockRefresh({ queryKey: ["trade-stats", 31337, "0x"], meta: {} })).toBe(true);
  });
  it("the transaction refresh skips only the block number", () => {
    expect(isTransactionRefresh({ queryKey: ["readContracts", {}], meta: { scope: "static" } })).toBe(true);
    expect(isTransactionRefresh({ queryKey: ["blockNumber"] })).toBe(false);
  });
});
