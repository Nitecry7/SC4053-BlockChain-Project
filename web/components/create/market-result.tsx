"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { AddressChip, shortAddress } from "@/components/data/address-chip";
import { useTokenDetails } from "@/hooks/use-dex-data";
import type { MarketOutcome } from "@/lib/create-runner";

/** What a confirmed `createMarket` produced, verified against MarketFactory's registry and the market's own tokens. */
export function MarketResult({ outcome }: { outcome: MarketOutcome }) {
  const details = useTokenDetails([outcome.base, outcome.quote]);
  const base = details.data?.[0]?.symbol ?? shortAddress(outcome.base);
  const quote = details.data?.[1]?.symbol ?? shortAddress(outcome.quote);
  return (
    <div className="space-y-3" data-testid="market-result">
      <div className="flex items-start gap-2.5 rounded-[0.875rem] border border-buy/30 bg-buy/[0.07] px-3.5 py-3">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-buy" aria-hidden />
        <div className="min-w-0 text-[0.75rem] leading-relaxed">
          <p className="text-[0.8125rem] font-semibold">
            Market listed: <span data-testid="market-created-pair">{base} / {quote}</span>
          </p>
          <p className="text-[#c3cce0]">
            Confirmed in block {outcome.blockNumber.toString()}. The address comes from MarketFactory&rsquo;s own event and was checked against its registry and the
            market&rsquo;s own tokens, not taken from the simulation.
          </p>
        </div>
      </div>

      <dl className="glass-inset grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[0.875rem] px-3.5 py-3 text-[0.75rem]">
        <dt className="text-muted-foreground">Market contract</dt>
        <dd className="text-right" data-testid="market-address">
          <AddressChip address={outcome.market} />
        </dd>
        <dt className="text-muted-foreground">Base token</dt>
        <dd className="text-right">
          {base} <AddressChip address={outcome.base} copy={false} className="text-[0.6875rem]" />
        </dd>
        <dt className="text-muted-foreground">Quote token</dt>
        <dd className="text-right">
          {quote} <AddressChip address={outcome.quote} copy={false} className="text-[0.6875rem]" />
        </dd>
        <dt className="text-muted-foreground">Registry position</dt>
        <dd className="tabular text-right">
          {outcome.registryIndex.toString()} of {outcome.registryCount.toString()}
        </dd>
      </dl>

      <p className="text-[0.75rem] leading-relaxed text-[#c3cce0]">
        Prices on this market are quoted in {quote} per 1 {base}. This orientation is now permanent. The book starts empty and nothing has traded: no price, volume or
        history is shown until orders are placed.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/trade?market=${outcome.market}`}
          className="inline-flex h-10 items-center rounded-xl border border-[rgb(208_199_255/0.3)] bg-[linear-gradient(100deg,rgb(111_92_232/0.9),rgb(118_96_228/0.9)_49%,rgb(120_98_220/0.9))] px-4 text-[0.8125rem] font-semibold text-white hover:brightness-105"
        >
          Trade this market
        </Link>
        <Link href="/markets" className="inline-flex h-10 items-center rounded-xl border border-white/20 bg-white/[0.04] px-4 text-[0.8125rem] font-semibold text-white hover:bg-white/[0.08]">
          All markets
        </Link>
        <Link href={`/tx/${outcome.hash}`} className="inline-flex h-10 items-center px-2 font-mono text-[0.75rem] text-lilac hover:text-white" title={outcome.hash}>
          {shortAddress(outcome.hash, 10, 6)}
        </Link>
      </div>
    </div>
  );
}
