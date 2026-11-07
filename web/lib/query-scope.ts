/**
 * Which cached reads the per-block refresh may skip.
 *
 * A read is "static" only if its result can never change for the same query key: token name, symbol and decimals, an
 * OrderBook's constants and its two token addresses, `isFactoryToken`. The key always contains the contract address and
 * the chain id, so a different contract or chain is a different query and is fetched on its own.
 *
 * Static reads are skipped by the refresh that runs on every new block (`isPerBlockRefresh`). They are NOT skipped by
 * the refresh after a confirmed transaction or by the chain-reset refresh, which call `invalidateQueries()` for
 * everything: an invalidated query is refetched even with `staleTime: Infinity`. Dynamic reads (balances, allowances,
 * supply, books, orders, logs, contract code, registry lists) never carry the tag.
 */
export const STATIC_SCOPE = "static";

/** Spread into a wagmi `useReadContracts({ query })` or a TanStack `useQuery` for a read that cannot change. */
export const staticQuery = { staleTime: Infinity, meta: { scope: STATIC_SCOPE } } as const;

type QueryLike = { queryKey: readonly unknown[]; meta?: Record<string, unknown> | undefined };

/** The predicate of the per-block refresh: everything except the block number itself and static reads. */
export function isPerBlockRefresh(query: QueryLike): boolean {
  return query.queryKey[0] !== "blockNumber" && query.meta?.scope !== STATIC_SCOPE;
}

/** The predicate of the refresh after a transaction: everything except the block number, static reads included. */
export function isTransactionRefresh(query: QueryLike): boolean {
  return query.queryKey[0] !== "blockNumber";
}
