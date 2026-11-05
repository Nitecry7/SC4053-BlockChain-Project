"use client";

import { ArrowDownUp, ChevronRight, Layers, ListOrdered, Lock, Store } from "lucide-react";
import { useState } from "react";
import { Amount } from "@/components/data/amount";
import { ComingSoon } from "@/components/data/states";
import { TokenMark } from "@/components/data/token-mark";
import { useMarketRegistry, useTokenRegistry } from "@/hooks/use-dex-data";
import { cn } from "@/lib/utils";
import { Panel } from "./panel";
import { DEPLOYMENT, type DashboardState } from "./use-dashboard";

/**
 * Where the reference shows a swap panel: a limit-order ticket (this exchange is an order book, not an AMM). It is laid
 * out as it will work, but every input is disabled and nothing can be signed until order placement ships.
 */
export function OrderPanel({ state }: { state: DashboardState }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const snap = state.market.data;
  const base = DEPLOYMENT.baseToken.symbol;
  const quote = DEPLOYMENT.quoteToken.symbol;
  const field = "glass-inset relative rounded-[0.875rem] px-3.5 py-3";
  return (
    <Panel
      id="order"
      title="Limit order"
      action={
        <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          <Lock className="size-3.5" aria-hidden /> Next phase
        </span>
      }
    >
      <div role="radiogroup" aria-label="Order side (preview)" className="mb-3 flex gap-1 rounded-[0.875rem] border border-white/[0.1] bg-[#10162a]/60 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => setSide(s)}
            className={cn(
              "flex-1 rounded-[0.625rem] border border-transparent py-2 text-[0.8125rem] font-medium text-[#c5cce3] transition-colors",
              side === s && "glass-active text-white",
            )}
          >
            {s === "buy" ? `Buy ${base}` : `Sell ${base}`}
          </button>
        ))}
      </div>

      <fieldset disabled className="min-w-0 space-y-2" aria-describedby="order-note">
        <div className={field}>
          <label htmlFor="order-price" className="text-[0.6875rem] text-[#c3cce0]">
            Limit price
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input id="order-price" inputMode="decimal" placeholder="0.0" className="min-w-0 flex-1 bg-transparent text-[1.375rem] font-semibold text-[#b2b9d0] outline-none placeholder:text-[#6f7899] disabled:cursor-not-allowed" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#151d2f]/80 py-1 pr-2.5 pl-1 text-[0.75rem] font-semibold">
              <TokenMark symbol={quote} size="sm" /> {quote}
            </span>
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-subtle">{quote} per {base}</p>
        </div>
        <div className="relative -my-1 flex justify-center">
          <span className="z-10 grid size-8 place-items-center rounded-[0.625rem] border border-white/20 bg-[#1c2440] text-muted-foreground" aria-hidden>
            <ArrowDownUp className="size-4" />
          </span>
        </div>
        <div className={field}>
          <label htmlFor="order-amount" className="text-[0.6875rem] text-[#c3cce0]">
            Amount
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input id="order-amount" inputMode="decimal" placeholder="0.0" className="min-w-0 flex-1 bg-transparent text-[1.375rem] font-semibold text-[#b2b9d0] outline-none placeholder:text-[#6f7899] disabled:cursor-not-allowed" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#151d2f]/80 py-1 pr-2.5 pl-1 text-[0.75rem] font-semibold">
              <TokenMark symbol={base} size="sm" /> {base}
            </span>
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-subtle">
            {side === "buy" ? `Escrows ${quote} at your limit; refunds any price improvement` : `Escrows the ${base} you sell`}
          </p>
        </div>
      </fieldset>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.6875rem]">
        <dt className="text-muted-foreground">Lot size</dt>
        <dd className="tabular text-right">{snap ? <Amount value={snap.lotSize} visible={9} showTail={false} symbol={base} /> : "—"}</dd>
        <dt className="text-muted-foreground">Tick size</dt>
        <dd className="tabular text-right">{snap ? <Amount value={snap.tickSize} visible={9} showTail={false} symbol={quote} /> : "—"}</dd>
      </dl>

      <button
        type="button"
        disabled
        className="mt-3 h-11 w-full cursor-not-allowed rounded-xl border border-[rgb(208_199_255/0.2)] bg-[linear-gradient(100deg,rgb(101_86_204/0.45),rgb(162_139_248/0.45)_49%,rgb(120_98_220/0.45))] text-[0.8125rem] font-semibold text-white/75"
      >
        {side === "buy" ? `Place buy order` : `Place sell order`}
      </button>
      <p id="order-note" className="mt-2 text-center text-[0.6875rem] text-muted-foreground">
        Order placement arrives in the next phase. Nothing can be signed here yet.
      </p>
    </Panel>
  );
}

/** Issuance and listing exist on-chain (TokenFactory, MarketFactory); the browser forms come later. Counts are real. */
export function CreateListPanel({ state }: { state: DashboardState }) {
  const tokens = useTokenRegistry(state.live);
  const markets = useMarketRegistry(state.live);
  const rows = [
    { icon: Layers, title: "Create token", text: "Issue a new 18-decimal ERC-20 through TokenFactory.", count: tokens.total, unit: "issued" },
    { icon: Store, title: "List market", text: "Open an order book for a token pair through MarketFactory.", count: markets.total, unit: "listed" },
  ];
  return (
    <Panel id="create" title="Create & list">
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.title} className="flex min-h-[4.75rem] items-center gap-3 rounded-[0.875rem] border border-white/[0.12] bg-[linear-gradient(140deg,rgb(81_92_138/0.32),rgb(45_53_82/0.3))] p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(140deg,rgb(127_107_223/0.46),rgb(77_77_159/0.36))] text-[#e6defe]" aria-hidden>
              <r.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[0.8125rem] font-semibold">{r.title}</span>
                <ComingSoon />
              </span>
              <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-[#bfc8dd]">{r.text}</span>
              <span className="tabular mt-0.5 block text-[0.6875rem] text-subtle">
                {r.count !== undefined ? `${r.count.toString()} ${r.unit} on this chain` : state.live ? "Reading…" : "—"}
              </span>
            </span>
            <ChevronRight className="size-4 text-subtle" aria-hidden />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The reference's "future" strip, reworded as the honest roadmap for the next phase. */
export function RoadmapStrip() {
  return (
    <section aria-label="Next phase" className="glass mt-4 flex flex-col gap-3 rounded-[1.125rem] bg-[linear-gradient(110deg,rgb(72_81_139/0.5),rgb(27_39_64/0.85)_48%,rgb(57_59_114/0.48))] px-4 py-3.5 sm:flex-row sm:items-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[rgb(121_111_215/0.42)] text-white" aria-hidden>
        <ListOrdered className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-semibold">Trading comes next</p>
        <p className="mt-0.5 text-[0.75rem] text-[#bdc5db]">Placing and cancelling limit orders, approvals, and your order history arrive in the next phase.</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Planned features">
        {["Limit orders", "Cancel orders", "Order history"].map((t) => (
          <li key={t} className="rounded-full border border-white/[0.14] px-3.5 py-2 text-[0.6875rem] text-[#dfe4f5]">
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}
