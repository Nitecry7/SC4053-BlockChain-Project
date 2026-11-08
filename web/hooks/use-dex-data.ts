"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { Address, Hex } from "viem";
import { useBlockNumber, usePublicClient, useReadContracts } from "wagmi";
import { anvil } from "@/lib/chains";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "@/lib/contracts/abis";
import { PRIMARY_DEPLOYMENT } from "@/lib/deployment";
import type { ExistingMarket, TokenProbe } from "@/lib/create-plan";
import { TICKET_BOOK_DEPTH } from "@/lib/order-plan";
import { displayText } from "@/lib/safe-text";
import { pageRanges, REGISTRY_PAGE } from "@/lib/registry-pages";
import type { OrderSnapshot } from "@/lib/order-status";
import { classifyDeployment, type DeploymentStatus } from "@/lib/network-status";
import { isPerBlockRefresh, staticQuery } from "@/lib/query-scope";
import { historyIds, readStopHistory } from "@/lib/stop-history";
import { DEPLOYMENT_CODE_KEY, DEPLOYMENT_TARGETS } from "@/lib/deployment-targets";
import { useRpcHealth } from "@/hooks/use-rpc-health";
import { dataReadsAllowed, transactionsAllowed } from "@/lib/rpc-health";

const CHAIN_ID = anvil.id;
const D = PRIMARY_DEPLOYMENT;

/**
 * Watches the Anvil head and refreshes every other on-chain read when a new block arrives, except reads tagged static
 * (see `lib/query-scope.ts`), which cannot change. Mount once.
 */
export function useLiveBlock() {
  const queryClient = useQueryClient();
  const block = useBlockNumber({ chainId: CHAIN_ID, watch: true });
  useEffect(() => {
    if (block.data === undefined) return;
    void queryClient.invalidateQueries({ predicate: isPerBlockRefresh });
  }, [block.data, queryClient]);
  return block;
}

export type DeploymentCheck = {
  status: DeploymentStatus;
  /** True while the RPC is up again but the chain is still being verified and reads re-fetched: no transactions yet. */
  settling: boolean;
  refetch: () => void;
};

/** Is the exported deployment really on this chain? Contract code at every address, and the market's own tokens. */
export function useDeploymentCheck(): DeploymentCheck {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const targets = DEPLOYMENT_TARGETS;

  const codes = useQuery({
    queryKey: DEPLOYMENT_CODE_KEY,
    enabled: Boolean(client),
    queryFn: async () => Promise.all(targets.map((t) => client!.getCode({ address: t.address }))),
  });

  const allHaveCode = Boolean(codes.data?.every((c) => c && c !== "0x"));
  const tokens = useReadContracts({
    allowFailure: false,
    query: { enabled: allHaveCode, ...staticQuery },
    contracts: [
      { chainId: CHAIN_ID, address: D.market as Address, abi: orderBookAbi, functionName: "baseToken" },
      { chainId: CHAIN_ID, address: D.market as Address, abi: orderBookAbi, functionName: "quoteToken" },
    ],
  });

  const health = useRpcHealth();
  const status = classifyDeployment({
    loading: codes.isPending,
    failed: codes.isError,
    marketReadFailed: tokens.isError,
    checks: targets.map((t, i) => ({ name: t.name, address: t.address, code: codes.data?.[i] })),
    marketBase: tokens.data?.[0],
    marketQuote: tokens.data?.[1],
    expectedBase: D.baseToken.address,
    expectedQuote: D.quoteToken.address,
    rpcOffline: !dataReadsAllowed(health.state),
  });

  return { status, settling: !transactionsAllowed(health.state) && dataReadsAllowed(health.state), refetch: () => void codes.refetch() };
}

export type TokenDetails = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  issuedByFactory: boolean;
};

/** Token metadata read from the chain, never from the export alone. */
export function useTokenDetails(tokens: readonly Address[], enabled = true) {
  const active = enabled && tokens.length > 0;
  // name, symbol, decimals and `isFactoryToken` never change for a token address, so they are read once (static).
  // `totalSupply` can change (mint, burn), so it stays in the per-block set.
  const identity = useReadContracts({
    allowFailure: false,
    query: { enabled: active, ...staticQuery },
    contracts: tokens.flatMap((address) => [
      { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "name" } as const,
      { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "symbol" } as const,
      { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "decimals" } as const,
      { chainId: CHAIN_ID, address: D.tokenFactory as Address, abi: tokenFactoryAbi, functionName: "isFactoryToken", args: [address] } as const,
    ]),
  });
  const supply = useReadContracts({
    allowFailure: false,
    query: { enabled: active },
    contracts: tokens.map((address) => ({ chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "totalSupply" }) as const),
  });
  const data: TokenDetails[] | undefined =
    identity.data && supply.data
      ? tokens.map((address, i) => {
          const r = identity.data.slice(i * 4, i * 4 + 4);
          return {
            address,
            name: displayText(r[0] as string, 100),
            symbol: displayText(r[1] as string, 32),
            decimals: Number(r[2]),
            totalSupply: supply.data[i] as bigint,
            issuedByFactory: r[3] as boolean,
          };
        })
      : undefined;
  return {
    data,
    isPending: identity.isPending || supply.isPending,
    isError: identity.isError || supply.isError,
    isFetching: identity.isFetching || supply.isFetching,
    refetch: () => Promise.all([identity.refetch(), supply.refetch()]),
  };
}

/** Wallet (not escrow) balances of the connected account. Escrow is a trading concept and arrives with order placement. */
export function useWalletBalances(account: Address | undefined, tokens: readonly Address[]) {
  const query = useReadContracts({
    allowFailure: false,
    query: { enabled: Boolean(account) && tokens.length > 0 },
    contracts: tokens.map(
      (address) => ({ chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "balanceOf", args: [account!] }) as const,
    ),
  });
  return { ...query, data: query.data as bigint[] | undefined };
}

export type BookLevel = { id: bigint; trader: Address; price: bigint; remaining: bigint };

export type MarketSnapshot = {
  priceScale: bigint;
  lotSize: bigint;
  tickSize: bigint;
  maxMatchesPerTx: bigint;
  maxInsertScan: bigint;
  bestBid: { id: bigint; price: bigint };
  bestAsk: { id: bigint; price: bigint };
  lastTradePrice: bigint;
  hasTradePrice: boolean;
  bids: BookLevel[];
  asks: BookLevel[];
};

/** Everything a read-only market view needs, from `view` functions only. */
export function useMarketSnapshot(market: Address, enabled = true, depth: number = TICKET_BOOK_DEPTH) {
  const base = { chainId: CHAIN_ID, address: market, abi: orderBookAbi } as const;
  // The five constants are immutable (static); the book and prices change and are re-read every block.
  const constants = useReadContracts({
    allowFailure: false,
    query: { enabled, ...staticQuery },
    contracts: [
      { ...base, functionName: "PRICE_SCALE" },
      { ...base, functionName: "LOT_SIZE" },
      { ...base, functionName: "TICK_SIZE" },
      { ...base, functionName: "MAX_MATCHES_PER_TX" },
      { ...base, functionName: "MAX_INSERT_SCAN" },
    ],
  });
  const dynamic = useReadContracts({
    allowFailure: false,
    query: { enabled },
    contracts: [
      { ...base, functionName: "getBestBid" },
      { ...base, functionName: "getBestAsk" },
      { ...base, functionName: "lastTradePrice" },
      { ...base, functionName: "hasTradePrice" },
      { ...base, functionName: "getBook", args: [0, BigInt(depth)] },
      { ...base, functionName: "getBook", args: [1, BigInt(depth)] },
    ],
  });

  const data: MarketSnapshot | undefined = useMemo(() => {
    if (!constants.data || !dynamic.data) return undefined;
    const [priceScale, lotSize, tickSize, maxMatches, maxScan] = constants.data;
    const [bid, ask, last, hasLast, bids, asks] = dynamic.data;
    const toLevels = (orders: readonly { id: bigint; trader: Address; price: bigint; amount: bigint; filled: bigint }[]) =>
      orders.map((o) => ({ id: o.id, trader: o.trader, price: o.price, remaining: o.amount - o.filled }));
    return {
      priceScale,
      lotSize,
      tickSize,
      maxMatchesPerTx: maxMatches,
      maxInsertScan: maxScan,
      bestBid: { id: bid[0], price: bid[1] },
      bestAsk: { id: ask[0], price: ask[1] },
      lastTradePrice: last,
      hasTradePrice: hasLast,
      bids: toLevels(bids),
      asks: toLevels(asks),
    };
  }, [constants.data, dynamic.data]);

  return {
    data,
    isPending: constants.isPending || dynamic.isPending,
    isError: constants.isError || dynamic.isError,
    isFetching: constants.isFetching || dynamic.isFetching,
    refetch: () => Promise.all([constants.refetch(), dynamic.refetch()]),
  };
}

export type TradeStats = { count: number; baseVolume: bigint; quoteVolume: bigint };

/** Trade count and volume since deployment, from the market's own `Trade` event logs (no indexer, no estimates). */
export function useTradeStats(market: Address, enabled = true) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["trade-stats", CHAIN_ID, market],
    enabled: enabled && Boolean(client),
    queryFn: async (): Promise<TradeStats> => {
      const logs = await client!.getContractEvents({
        address: market,
        abi: orderBookAbi,
        eventName: "Trade",
        fromBlock: BigInt(D.deployBlock),
        toBlock: "latest",
      });
      let baseVolume = 0n;
      let quoteVolume = 0n;
      for (const log of logs) {
        baseVolume += log.args.baseAmount ?? 0n;
        quoteVolume += log.args.quoteAmount ?? 0n;
      }
      return { count: logs.length, baseVolume, quoteVolume };
    },
  });
}

export type RegisteredMarket = { address: Address; base: Address; quote: Address };

/** The MarketFactory registry, every page up to `REGISTRY_CAP`, with each market's tokens read from the market itself. */
export function useMarketRegistry(enabled = true, pageSize = REGISTRY_PAGE) {
  const count = useReadContracts({
    allowFailure: false,
    query: { enabled },
    contracts: [{ chainId: CHAIN_ID, address: D.marketFactory as Address, abi: marketFactoryAbi, functionName: "marketCount" }],
  });
  const total = count.data?.[0] as bigint | undefined;
  const { pages, truncated } = total === undefined ? { pages: [], truncated: false } : pageRanges(total, pageSize);
  const lists = useReadContracts({
    allowFailure: false,
    query: { enabled: enabled && pages.length > 0 },
    contracts: pages.map((p) => ({ chainId: CHAIN_ID, address: D.marketFactory as Address, abi: marketFactoryAbi, functionName: "getMarkets", args: [p.offset, p.limit] }) as const),
  });
  const addresses = ((lists.data ?? []) as readonly (readonly Address[])[]).flat();
  const pairs = useReadContracts({
    allowFailure: false,
    query: { enabled: enabled && addresses.length > 0, ...staticQuery }, // a market's two tokens never change
    contracts: addresses.flatMap((address) => [
      { chainId: CHAIN_ID, address, abi: orderBookAbi, functionName: "baseToken" } as const,
      { chainId: CHAIN_ID, address, abi: orderBookAbi, functionName: "quoteToken" } as const,
    ]),
  });
  const ready = total !== undefined && (pages.length === 0 || lists.data !== undefined) && (addresses.length === 0 || pairs.data !== undefined);
  const markets: RegisteredMarket[] | undefined = ready
    ? addresses.map((address, i) => ({ address, base: pairs.data![i * 2] as Address, quote: pairs.data![i * 2 + 1] as Address }))
    : undefined;
  return {
    total,
    markets,
    truncated,
    isPending: count.isPending || (pages.length > 0 && lists.isPending) || (addresses.length > 0 && pairs.isPending),
    isError: count.isError || lists.isError || pairs.isError,
  };
}

/** The TokenFactory registry, every page up to `REGISTRY_CAP`. */
export function useTokenRegistry(enabled = true, pageSize = REGISTRY_PAGE) {
  const count = useReadContracts({
    allowFailure: false,
    query: { enabled },
    contracts: [{ chainId: CHAIN_ID, address: D.tokenFactory as Address, abi: tokenFactoryAbi, functionName: "tokenCount" }],
  });
  const total = count.data?.[0] as bigint | undefined;
  const { pages, truncated } = total === undefined ? { pages: [], truncated: false } : pageRanges(total, pageSize);
  const lists = useReadContracts({
    allowFailure: false,
    query: { enabled: enabled && pages.length > 0 },
    contracts: pages.map((p) => ({ chainId: CHAIN_ID, address: D.tokenFactory as Address, abi: tokenFactoryAbi, functionName: "getTokens", args: [p.offset, p.limit] }) as const),
  });
  const tokens: readonly Address[] | undefined =
    total === undefined ? undefined : pages.length === 0 ? [] : lists.data ? ((lists.data as readonly (readonly Address[])[]).flat() as readonly Address[]) : undefined;
  return { total, tokens, truncated, isPending: count.isPending || (pages.length > 0 && lists.isPending), isError: count.isError || lists.isError };
}

/** The two tokens of any market, read from the market itself (so every registered market works, not only the first). */
export function useMarketTokens(market: Address, enabled = true) {
  const base = { chainId: CHAIN_ID, address: market, abi: orderBookAbi } as const;
  const query = useReadContracts({
    allowFailure: false,
    query: { enabled, ...staticQuery },
    contracts: [
      { ...base, functionName: "baseToken" },
      { ...base, functionName: "quoteToken" },
    ],
  });
  return { ...query, data: query.data ? ([query.data[0], query.data[1]] as [Address, Address]) : undefined };
}

/** The order book's allowance from `owner` for one token. The query key includes owner, token and spender. */
export function useAllowance(token: Address | undefined, owner: Address | undefined, spender: Address | undefined) {
  const enabled = Boolean(token && owner && spender);
  const query = useReadContracts({
    allowFailure: false,
    query: { enabled },
    contracts: [{ chainId: CHAIN_ID, address: token as Address, abi: demoTokenAbi, functionName: "allowance", args: [owner as Address, spender as Address] }],
  });
  return { ...query, data: query.data?.[0] as bigint | undefined };
}

export type MyOrderTrade = { makerOrderId: bigint; takerOrderId: bigint; price: bigint; baseAmount: bigint; quoteAmount: bigint; transactionHash: Hex };
/** `placedBlock` is the block of a stop order's `StopOrderPlaced` (the lower bound of its history read); undefined for ordinary orders. */
export type MyOrder = { order: OrderSnapshot; placedTx: Hex | undefined; trades: MyOrderTrade[]; placedBlock?: bigint | undefined };
export const MY_ORDERS_LIMIT = 50;

/**
 * The account's orders on one market: ids from `getUserOrderIds`, each order from `getOrder`, the creating transaction
 * from `OrderPlaced` and the fills from `Trade` logs. Only the latest `MY_ORDERS_LIMIT` orders are read. The query key
 * includes the account, so one wallet's orders are never shown for another.
 */
export function useMyOrders(market: Address, account: Address | undefined, enabled = true) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["my-orders", CHAIN_ID, market, account],
    enabled: enabled && Boolean(client) && Boolean(account),
    queryFn: async (): Promise<{ rows: MyOrder[]; totalIds: number }> => {
      const ids = (await client!.readContract({ address: market, abi: orderBookAbi, functionName: "getUserOrderIds", args: [account!] })) as bigint[];
      const latest = ids.slice(-MY_ORDERS_LIMIT);
      if (latest.length === 0) return { rows: [], totalIds: ids.length };
      const [orders, placed, asMaker, asTaker] = await Promise.all([
        Promise.all(latest.map((id) => client!.readContract({ address: market, abi: orderBookAbi, functionName: "getOrder", args: [id] }) as Promise<OrderSnapshot>)),
        client!.getContractEvents({ address: market, abi: orderBookAbi, eventName: "OrderPlaced", args: { trader: account! }, fromBlock: BigInt(D.deployBlock), toBlock: "latest" }),
        client!.getContractEvents({ address: market, abi: orderBookAbi, eventName: "Trade", args: { makerOrderId: latest }, fromBlock: BigInt(D.deployBlock), toBlock: "latest" }),
        client!.getContractEvents({ address: market, abi: orderBookAbi, eventName: "Trade", args: { takerOrderId: latest }, fromBlock: BigInt(D.deployBlock), toBlock: "latest" }),
      ]);
      const placedTx = new Map(placed.map((l) => [l.args.orderId as bigint, l.transactionHash as Hex]));
      const placedBlock = new Map<bigint, bigint>();
      // A stop-limit order has no OrderPlaced: its creating transaction is its StopOrderPlaced. One extra read, only when a stop is listed.
      if (orders.some((o) => o.triggerPrice !== 0n)) {
        const stops = await client!.getContractEvents({ address: market, abi: orderBookAbi, eventName: "StopOrderPlaced", args: { trader: account! }, fromBlock: BigInt(D.deployBlock), toBlock: "latest" });
        for (const l of stops) {
          placedTx.set(l.args.orderId as bigint, l.transactionHash as Hex);
          if (l.blockNumber !== null && l.blockNumber !== undefined) placedBlock.set(l.args.orderId as bigint, l.blockNumber as bigint);
        }
      }
      const seen = new Set<string>();
      const trades: MyOrderTrade[] = [];
      for (const l of [...asMaker, ...asTaker]) {
        const key = `${l.transactionHash}:${l.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = l.args;
        trades.push({
          makerOrderId: a.makerOrderId as bigint,
          takerOrderId: a.takerOrderId as bigint,
          price: a.price as bigint,
          baseAmount: a.baseAmount as bigint,
          quoteAmount: a.quoteAmount as bigint,
          transactionHash: l.transactionHash as Hex,
        });
      }
      const rows = orders
        .map((order) => ({
          order,
          placedTx: placedTx.get(order.id),
          placedBlock: placedBlock.get(order.id),
          trades: trades.filter((t) => t.makerOrderId === order.id || t.takerOrderId === order.id),
        }))
        .reverse();
      return { rows, totalIds: ids.length };
    },
  });
}

/**
 * What happened to this account's stop orders that are no longer pending (P2-8C): one `eth_getLogs` request (`readStopHistory`) for
 * `StopOrderTriggered` and `OrderCancelled`, filtered on the indexed order ids and bounded to the stops' own lifetime
 * (`fromBlock` = the earliest `StopOrderPlaced` block of the listed ones). It is a separate query so My Orders renders at once
 * and a slow or failed history read cannot delay or break the list (the rows then show neutral wording).
 *
 * Request economy: no request when no stop is past `PendingTrigger`; the key holds the order ids and their statuses, so the
 * same orders are never asked about twice, and it carries the `static` scope, so the refresh on every new block skips it. It is
 * refetched only when an order's status changes (a new key) or after a confirmed transaction of this app. No automatic retry
 * loop (one retry after 2 s at most), and no refetch on window focus or reconnect.
 */
export function useStopHistory(market: Address, account: Address | undefined, rows: MyOrder[] | undefined, enabled = true) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const ids = useMemo(() => (rows ? historyIds(rows.map((r) => r.order), MY_ORDERS_LIMIT) : []), [rows]);
  const statusKey = useMemo(() => (rows ? rows.filter((r) => ids.includes(r.order.id)).map((r) => `${r.order.id}:${r.order.status}`).sort().join(",") : ""), [rows, ids]);
  const fromBlock = useMemo(() => {
    const blocks = (rows ?? []).filter((r) => ids.includes(r.order.id)).map((r) => r.placedBlock ?? BigInt(D.deployBlock));
    return blocks.length ? blocks.reduce((a, b) => (a < b ? a : b)) : BigInt(D.deployBlock);
  }, [rows, ids]);
  return useQuery({
    queryKey: ["stop-history", CHAIN_ID, market, account, statusKey],
    enabled: enabled && Boolean(client) && Boolean(account) && ids.length > 0,
    ...staticQuery,
    retry: 1,
    retryDelay: 2000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // An unreadable history is thrown, not cached as an empty one: the single retry runs, then the rows show neutral wording
    // (`classifyStop` with no history) and the next mount or confirmed transaction asks again.
    queryFn: async () => {
      const history = await readStopHistory(client!, market, ids, fromBlock);
      if (history.status !== "ok") throw new Error("stop history unavailable");
      return history;
    },
  });
}

/** A transaction's receipt and details, for the transaction page. A missing receipt means pending or unknown. */
export function useTxReceipt(hash: Hex | undefined) {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["tx", CHAIN_ID, hash],
    enabled: Boolean(client) && Boolean(hash),
    retry: false,
    queryFn: async () => {
      const [tx, receipt] = await Promise.all([
        client!.getTransaction({ hash: hash! }).catch(() => null),
        client!.getTransactionReceipt({ hash: hash! }).catch(() => null),
      ]);
      return { tx, receipt };
    },
  });
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * What the chain says about one candidate token address, for the List market form. Each read may fail on its own (an
 * arbitrary contract need not have name() or symbol()), so they are not batched as all-or-nothing: if `decimals()` cannot
 * be read the address is reported as "not a token"; the other fields are optional. Strings are sanitised for display.
 */
export function useTokenProbe(address: Address | undefined, enabled = true): TokenProbe | undefined {
  const query = useReadContracts({
    allowFailure: true,
    query: { enabled: enabled && Boolean(address) },
    contracts: address
      ? [
          { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "decimals" },
          { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "name" },
          { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "symbol" },
          { chainId: CHAIN_ID, address, abi: demoTokenAbi, functionName: "totalSupply" },
          { chainId: CHAIN_ID, address: D.tokenFactory as Address, abi: tokenFactoryAbi, functionName: "isFactoryToken", args: [address] },
        ]
      : [],
  });
  if (!address) return undefined;
  const data = query.data;
  if (!data) return query.isError ? { status: "not-a-token" } : { status: "loading" };
  const [decimals, name, symbol, supply, factory] = data;
  if (!decimals || !name || !symbol || !supply || !factory) return { status: "loading" };
  if (decimals.status !== "success") return { status: "not-a-token" };
  return {
    status: "ok",
    decimals: Number(decimals.result),
    name: name.status === "success" ? displayText(name.result as string, 100) : undefined,
    symbol: symbol.status === "success" ? displayText(symbol.result as string, 32) : undefined,
    totalSupply: supply.status === "success" ? (supply.result as bigint) : undefined,
    issuedByFactory: factory.status === "success" && factory.result === true,
  };
}

/**
 * The market `MarketFactory.getMarket(a, b)` reports for the pair (order-insensitive), with its real base and quote read
 * from the market itself so its orientation is known. `undefined` while loading, `null` when the pair has no market.
 */
export function useExistingMarket(a: Address | undefined, b: Address | undefined, enabled = true): ExistingMarket | null | undefined {
  const active = enabled && Boolean(a) && Boolean(b);
  const first = useReadContracts({
    allowFailure: false,
    query: { enabled: active },
    contracts: [{ chainId: CHAIN_ID, address: D.marketFactory as Address, abi: marketFactoryAbi, functionName: "getMarket", args: [a as Address, b as Address] }],
  });
  const market = first.data?.[0] as Address | undefined;
  const exists = market !== undefined && market.toLowerCase() !== ZERO_ADDRESS;
  const tokens = useReadContracts({
    allowFailure: false,
    query: { enabled: active && exists },
    contracts: exists
      ? [
          { chainId: CHAIN_ID, address: market, abi: orderBookAbi, functionName: "baseToken" },
          { chainId: CHAIN_ID, address: market, abi: orderBookAbi, functionName: "quoteToken" },
        ]
      : [],
  });
  if (!active || !first.data) return undefined;
  if (!exists) return null;
  if (!tokens.data) return undefined;
  return { market, base: tokens.data[0] as Address, quote: tokens.data[1] as Address };
}

/** Is this address a market registered by MarketFactory? An on-chain check, so it works beyond the first registry page. */
export function useIsMarket(address: Address | undefined, enabled = true) {
  const query = useReadContracts({
    allowFailure: false,
    query: { enabled: enabled && Boolean(address) },
    contracts: address ? [{ chainId: CHAIN_ID, address: D.marketFactory as Address, abi: marketFactoryAbi, functionName: "isMarket", args: [address] }] : [],
  });
  return { data: query.data?.[0] as boolean | undefined, isPending: Boolean(address) && enabled && query.isPending, isError: query.isError };
}

/** `TokenFactory.MAX_SUPPLY()` and the engine's `LOT_SIZE()`, read from the chain (never assumed). */
export function useCreateConstants(enabled = true) {
  const query = useReadContracts({
    allowFailure: false,
    query: { enabled },
    contracts: [
      { chainId: CHAIN_ID, address: D.tokenFactory as Address, abi: tokenFactoryAbi, functionName: "MAX_SUPPLY" },
      { chainId: CHAIN_ID, address: D.market as Address, abi: orderBookAbi, functionName: "LOT_SIZE" },
    ],
  });
  return { ...query, data: query.data ? { maxSupply: query.data[0] as bigint, lotSize: query.data[1] as bigint } : undefined };
}
