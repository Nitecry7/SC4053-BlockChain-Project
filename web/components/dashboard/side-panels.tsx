"use client";

import { ChevronRight, Layers, ListOrdered, Store } from "lucide-react";
import { ComingSoon } from "@/components/data/states";
import { useMarketRegistry, useTokenRegistry } from "@/hooks/use-dex-data";
import { Panel } from "./panel";
import type { DashboardState } from "./use-dashboard";

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
    <section aria-label="What comes next" className="glass mt-4 flex flex-col gap-3 rounded-[1.125rem] bg-[linear-gradient(110deg,rgb(72_81_139/0.5),rgb(27_39_64/0.85)_48%,rgb(57_59_114/0.48))] px-4 py-3.5 sm:flex-row sm:items-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[rgb(121_111_215/0.42)] text-white" aria-hidden>
        <ListOrdered className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-semibold">Limit orders are live</p>
        <p className="mt-0.5 text-[0.75rem] text-[#bdc5db]">Place orders, approve exact collateral and follow every fill from the ticket. Cancelling orders, and issuing tokens and listing markets from the browser, come next.</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Planned features">
        {["Cancel orders", "Create token", "List market"].map((t) => (
          <li key={t} className="rounded-full border border-white/[0.14] px-3.5 py-2 text-[0.6875rem] text-[#dfe4f5]">
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}
