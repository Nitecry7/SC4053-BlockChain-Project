"use client";

import { ChartNoAxesColumn } from "lucide-react";
import Link from "next/link";
import { InfoTip } from "@/components/ui/info-tip";
import { Amount } from "@/components/data/amount";
import { EmptyState } from "@/components/data/states";
import { PairMark } from "@/components/data/token-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketRegistry, useMarketSnapshot, useTokenDetails, useTradeStats, type BookLevel, type RegisteredMarket } from "@/hooks/use-dex-data";
import { bookSpread } from "@/lib/crossed-book";
import { buildDepth, position } from "@/lib/depth";
import { quoteCost } from "@/lib/units";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";
import type { DashboardState } from "./use-dashboard";

const cols =
  "grid grid-cols-[minmax(6.5rem,1.5fr)_repeat(2,minmax(3.75rem,1fr))] items-center gap-2 sm:grid-cols-[minmax(6.5rem,1.4fr)_repeat(3,minmax(3.75rem,1fr))_minmax(2.75rem,0.55fr)]";

function Price({ value, has = true }: { value: bigint; has?: boolean }) {
  if (!has || value === 0n) return <span className="text-muted-foreground">—</span>;
  return <Amount value={value} visible={4} showTail={false} />;
}

function MarketRow({ market }: { market: RegisteredMarket }) {
  const snap = useMarketSnapshot(market.address, true, 1).data;
  const trades = useTradeStats(market.address).data?.count;
  const [b, q] = useTokenDetails([market.base, market.quote]).data ?? [];
  return (
    <li className={cn(cols, "min-h-12 border-b border-white/[0.07] text-[0.8125rem] last:border-0")}>
      <span className="flex min-w-0 items-center gap-2 font-semibold">
        {b && q ? (
          <>
            <PairMark base={b.symbol} quote={q.symbol} />
            <span className="truncate">
              {b.symbol} / {q.symbol}
            </span>
          </>
        ) : (
          <Skeleton className="h-4 w-24 bg-white/8" />
        )}
      </span>
      <span className="tabular text-right">{snap ? <Price value={snap.lastTradePrice} has={snap.hasTradePrice} /> : "…"}</span>
      <span className="tabular text-right text-buy">{snap ? <Price value={snap.bestBid.price} /> : "…"}</span>
      <span className="tabular hidden text-right text-sell sm:block">{snap ? <Price value={snap.bestAsk.price} /> : "…"}</span>
      <span className="tabular hidden text-right text-muted-foreground sm:block">{trades ?? "…"}</span>
    </li>
  );
}

/** The seed market's figures under the board, all read from the chain (view calls and Trade logs). */
function MarketSummary({ state }: { state: DashboardState }) {
  const snap = state.market.data;
  const trades = state.trades.data;
  const spread = spreadOf(snap);
  const b = state.pair.base.symbol;
  const q = state.pair.quote.symbol;
  const cells = [
    {
      label: "Spread",
      value: spread.kind === "spread" ? <Amount value={spread.value} visible={4} showTail={false} symbol={q} /> : spread.kind === "crossed" ? "Crossed" : "—",
    },
    { label: "Trades", value: trades ? trades.count.toString() : "…" },
    { label: "Base Volume", value: trades ? <Amount value={trades.baseVolume} visible={2} showTail={false} symbol={b} /> : "…" },
    { label: "Quote Volume", value: trades ? <Amount value={trades.quoteVolume} visible={2} showTail={false} symbol={q} /> : "…" },
  ];
  return (
    <dl className="glass-inset mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[0.875rem] px-3.5 py-3 sm:grid-cols-4" aria-label={`${b}/${q} market summary`}>
      {cells.map((c) => (
        <div key={c.label}>
          <dt className="flex items-center text-[0.6875rem] text-muted-foreground">
            {c.label}
            {c.label === "Spread" && <InfoTip term="spread" />}
          </dt>
          <dd className="tabular mt-0.5 text-[0.8125rem] font-semibold">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Listed markets from the MarketFactory registry with their live top of book. No 24h change: there is no indexer. */
export function MarketBoard({ state, limit = 4 }: { state: DashboardState; limit?: number }) {
  const reg = useMarketRegistry(state.live);
  return (
    <Panel
      id="market-board"
      title="Market Board"
      info="marketBoard"
      action={
        <Link href="/markets" className="text-[0.75rem] font-medium text-lilac hover:text-white">
          All Markets <span aria-hidden>→</span>
        </Link>
      }
    >
      <div>
        <div>
          <div className={cn(cols, "border-b border-white/[0.09] pb-2 text-[0.6875rem] text-muted-foreground")}>
            <span>Pair</span>
            <span className="text-right">Last trade</span>
            <span className="text-right">Best bid</span>
            <span className="hidden text-right sm:block">Best ask</span>
            <span className="hidden text-right sm:block">Trades</span>
          </div>
          {!state.live ? (
            <EmptyState title="No live markets" className="py-5">
              The market registry is read once the deployment is found on this chain.
            </EmptyState>
          ) : reg.markets === undefined ? (
            <div className="space-y-2 py-3" aria-busy="true">
              <Skeleton className="h-8 w-full bg-white/6" />
              <Skeleton className="h-8 w-full bg-white/6" />
            </div>
          ) : reg.markets.length === 0 ? (
            <EmptyState title="No markets listed yet" className="py-5" />
          ) : (
            <ul>
              {reg.markets.slice(0, limit).map((m) => (
                <MarketRow key={m.address} market={m} />
              ))}
            </ul>
          )}
        </div>
      </div>
      {state.live && <MarketSummary state={state} />}
      <p className="mt-3 text-[0.6875rem] text-subtle">Prices in quote token per base token. Trades and volume come from on-chain Trade events.</p>
    </Panel>
  );
}

/** Best ask minus best bid when both sides rest and the book is not crossed; "crossed" or "none" otherwise (see `bookSpread`). */
function spreadOf(snap: { bestBid: { id: bigint; price: bigint }; bestAsk: { id: bigint; price: bigint } } | undefined) {
  return snap ? bookSpread(snap.bestBid, snap.bestAsk) : ({ kind: "none" } as const);
}

/** Real cumulative depth from `getBook`, drawn as a step chart; an honest empty state when nothing rests. */
export function DepthPanel({ state }: { state: DashboardState }) {
  const snap = state.market.data;
  const depth = snap ? buildDepth(snap.bids, snap.asks) : undefined;
  const spread = spreadOf(snap);
  const pair = `${state.pair.base.symbol} / ${state.pair.quote.symbol}`;
  const W = 460;
  const H = 150;
  const pad = 10;

  const toPath = (points: { price: bigint; cumulative: bigint }[], side: "bid" | "ask") => {
    if (!depth || points.length === 0) return { line: "", area: "" };
    const lo = depth.minPrice - (depth.maxPrice - depth.minPrice) / 10n - 1n;
    const hi = depth.maxPrice + (depth.maxPrice - depth.minPrice) / 10n + 1n;
    const x = (p: bigint) => pad + position(p, lo, hi) * (W - 2 * pad);
    const y = (c: bigint) => H - 6 - Number((c * 1000n) / (depth.maxCumulative || 1n)) / 1000 * (H - 24);
    // Stair-steps: rise at each price level, then hold that cumulative depth until the next level.
    let d = `M ${x(points[0]!.price)} ${H - 6}`;
    points.forEach((p, i) => {
      if (i > 0) d += ` L ${x(p.price)} ${y(points[i - 1]!.cumulative)}`;
      d += ` L ${x(p.price)} ${y(p.cumulative)}`;
    });
    const edge = side === "bid" ? pad : W - pad;
    d += ` L ${edge} ${y(points[points.length - 1]!.cumulative)}`;
    return { line: d, area: `${d} L ${edge} ${H - 6} Z` };
  };
  const bid = depth ? toPath(depth.bids, "bid") : undefined;
  const ask = depth ? toPath(depth.asks, "ask") : undefined;

  return (
    <Panel id="depth" title={`Market Depth: ${pair}`} info="marketDepth" className="min-h-[16rem]">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[1.375rem] font-semibold tracking-[-0.03em]">
            {snap?.hasTradePrice ? (
              <>
                <Amount value={snap.lastTradePrice} visible={4} showTail={false} />
                <span className="ml-1.5 text-sm font-medium text-muted-foreground">{state.pair.quote.symbol}</span>
              </>
            ) : snap ? (
              <span className="text-base text-muted-foreground">No trades yet</span>
            ) : (
              <span className="text-base text-muted-foreground">—</span>
            )}
          </p>
          <p className="flex items-center text-[0.6875rem] text-muted-foreground">Last Trade Price<InfoTip term="lastTradePrice" /></p>
        </div>
        {spread.kind === "spread" && (
          <div className="text-right">
            <p className="tabular text-[0.9375rem] font-semibold">
              <Amount value={spread.value} visible={4} showTail={false} />
              <span className="ml-1 text-xs font-medium text-muted-foreground">{state.pair.quote.symbol}</span>
            </p>
            <p className="flex items-center justify-end text-[0.6875rem] text-muted-foreground">Spread (best ask − best bid)<InfoTip term="spread" /></p>
          </div>
        )}
        {spread.kind === "crossed" && (
          <div className="text-right">
            <p className="flex items-center justify-end text-[0.9375rem] font-semibold text-warn">Crossed Book<InfoTip term="crossedBook" /></p>
            <p className="text-[0.6875rem] text-muted-foreground">Best bid is at or above best ask</p>
          </div>
        )}
      </div>
      {depth ? (
        <>
          <p className="tabular mt-3 text-[0.6875rem] text-subtle">
            Max depth <Amount value={depth.maxCumulative} visible={2} showTail={false} symbol={state.pair.base.symbol} />
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label={`Cumulative depth: ${depth.bids.length} bid levels, ${depth.asks.length} ask levels`}>
            <defs>
              <linearGradient id="bid-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3ddc9e" stopOpacity=".38" />
                <stop offset="1" stopColor="#3ddc9e" stopOpacity=".03" />
              </linearGradient>
              <linearGradient id="ask-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f37aa3" stopOpacity=".38" />
                <stop offset="1" stopColor="#f37aa3" stopOpacity=".03" />
              </linearGradient>
            </defs>
            <g stroke="#71819c" opacity=".16">
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <line key={f} x1={pad} x2={W - pad} y1={H - 6 - f * (H - 24)} y2={H - 6 - f * (H - 24)} />
              ))}
            </g>
            {bid?.area && <path d={bid.area} fill="url(#bid-area)" />}
            {bid?.line && <path d={bid.line} fill="none" stroke="#3ddc9e" strokeWidth="2" />}
            {ask?.area && <path d={ask.area} fill="url(#ask-area)" />}
            {ask?.line && <path d={ask.line} fill="none" stroke="#f37aa3" strokeWidth="2" />}
          </svg>
          <div className="tabular -mt-1 mb-2 flex justify-between px-2 text-[0.6875rem] text-subtle" aria-hidden="true">
            <span>
              <Amount value={depth.minPrice} visible={4} showTail={false} />
            </span>
            <span>Price ({state.pair.quote.symbol})</span>
            <span>
              <Amount value={depth.maxPrice} visible={4} showTail={false} />
            </span>
          </div>
          <div className="flex justify-center gap-5 text-[0.6875rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-buy" aria-hidden /> Buyers (bids)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-sell" aria-hidden /> Sellers (asks)
            </span>
          </div>
        </>
      ) : (
        <EmptyState title={state.live ? "No resting orders yet" : "Order book unavailable"} icon={<ChartNoAxesColumn className="size-5" />} className="py-7">
          {state.live
            ? "Depth appears here once traders place limit orders. It is drawn from the contract's own book, never estimated."
            : "Depth is read from the market contract once the deployment is found."}
        </EmptyState>
      )}
    </Panel>
  );
}

function BookRow({ level, side }: { level: BookLevel; side: "Buy" | "Sell" }) {
  return (
    <tr className="border-b border-white/[0.06] last:border-0">
      <td className="py-1.5">
        <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold", side === "Buy" ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell")}>
          {side === "Buy" ? "Buy (bid)" : "Sell (ask)"}
        </span>
      </td>
      <td className="tabular py-1.5 text-right">
        <Amount value={level.price} visible={4} showTail={false} />
      </td>
      <td className="tabular py-1.5 text-right">
        <Amount value={level.remaining} visible={2} showTail={false} />
      </td>
      <td className="tabular py-1.5 text-right text-muted-foreground">
        <Amount value={quoteCost(level.remaining, level.price)} visible={2} showTail={false} />
      </td>
    </tr>
  );
}

/** The top of the live book: asks above, bids below, from `getBook`. Read-only. */
export function BookPanel({ state, levels = 4 }: { state: DashboardState; levels?: number }) {
  const snap = state.market.data;
  const asks = snap ? [...snap.asks].slice(0, levels).reverse() : [];
  const bids = snap ? snap.bids.slice(0, levels) : [];
  const empty = snap && asks.length === 0 && bids.length === 0;
  return (
    <Panel id="book" title={`Order Book (${state.pair.base.symbol} / ${state.pair.quote.symbol})`} info="orderBook" className="min-h-[16rem]">
      {!state.live ? (
        <EmptyState title="Order book unavailable" className="py-8">
          The book is read from the market contract once the deployment is found.
        </EmptyState>
      ) : !snap ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-full bg-white/6" />
          ))}
        </div>
      ) : empty ? (
        <EmptyState title="The book is empty" className="py-8">
          No resting buy or sell orders on this market yet.
        </EmptyState>
      ) : (
        <table className="w-full text-[0.75rem]">
          <caption className="sr-only">Best resting orders: asks then bids</caption>
          <thead>
            <tr className="text-[0.6875rem] text-muted-foreground">
              <th scope="col" className="pb-2 text-left font-medium">Side</th>
              <th scope="col" className="pb-2 text-right font-medium">Price ({state.pair.quote.symbol})</th>
              <th scope="col" className="pb-2 text-right font-medium">Amount ({state.pair.base.symbol})</th>
              <th scope="col" className="pb-2 text-right font-medium">Total ({state.pair.quote.symbol})</th>
            </tr>
          </thead>
          <tbody>
            {asks.map((l) => (
              <BookRow key={`a${l.id}`} level={l} side="Sell" />
            ))}
            {bids.map((l) => (
              <BookRow key={`b${l.id}`} level={l} side="Buy" />
            ))}
          </tbody>
        </table>
      )}
      {snap && !empty && (
        <p className="mt-3 text-[0.6875rem] text-subtle">
          Best {asks.length} asks and {bids.length} bids, read from the market&rsquo;s getBook. Amounts are what is still unfilled.
        </p>
      )}
    </Panel>
  );
}
