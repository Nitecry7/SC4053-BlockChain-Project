"use client";

import { ArrowDownUp, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { Panel } from "@/components/dashboard/panel";
import { StatusBanners } from "@/components/dashboard/status-banners";
import { DEPLOYMENT } from "@/components/dashboard/use-dashboard";
import { AddressChip, shortAddress } from "@/components/data/address-chip";
import { FactoryFacts } from "@/components/registry/factory-facts";
import { PageHeader } from "@/components/registry/page-header";
import { useExistingMarket, useMarketRegistry, useTokenDetails, useTokenProbe, useTokenRegistry } from "@/hooks/use-dex-data";
import { useMarketCreateFlow } from "@/hooks/use-create-flow";
import { canList, classifyPair, pairMessage } from "@/lib/create-plan";
import { FlowNotices } from "./flow-notices";
import { MarketResult } from "./market-result";
import { SubmitButton } from "./submit-button";
import { EMPTY_SLOT, resolveSlot, TokenSlot, type SlotValue } from "./token-slot";
import { useCreateContext } from "./use-create-context";

const BUSY_LABEL: Record<string, string> = {
  simulating: "Checking with the contract…",
  "order-wallet": "Waiting for MetaMask…",
  "order-confirming": "Confirming on-chain…",
  reconciling: "Reading the result…",
};

/**
 * List a market through `MarketFactory.createMarket`. The pair is checked against the chain before the wallet is asked
 * (addresses, ERC-20 behaviour, 18 decimals, and above all whether the pair already has a market in either orientation),
 * the irreversible base/quote orientation is shown and must be acknowledged, and success is confirmed against the
 * factory's registry and the market's own tokens.
 */
export function MarketForm() {
  const params = useSearchParams();
  const ctx = useCreateContext();
  const factory = DEPLOYMENT.marketFactory as Address;
  const flow = useMarketCreateFlow(factory);
  const registry = useTokenRegistry(ctx.live);
  const list = (registry.tokens ?? []) as readonly Address[];
  const details = useTokenDetails(list, ctx.live && list.length > 0);
  const markets = useMarketRegistry(ctx.live);

  const [baseSlot, setBaseSlot] = useState<SlotValue>(() => ({ text: params.get("base") ?? "", custom: false }));
  const [quoteSlot, setQuoteSlot] = useState<SlotValue>(() => ({ text: params.get("quote") ?? "", custom: false }));
  const [ack, setAck] = useState(false);

  // A different account or network ends the acknowledgement: it was given for the previous context.
  const ctxKey = `${flow.ctx.account}:${flow.ctx.chainId}`.toLowerCase();
  const [seenCtxKey, setSeenCtxKey] = useState(ctxKey);
  if (seenCtxKey !== ctxKey) {
    setSeenCtxKey(ctxKey);
    setAck(false);
  }

  const { state } = flow;
  const phase = state.phase;
  const base = resolveSlot(baseSlot).address;
  const quote = resolveSlot(quoteSlot).address;
  const baseProbe = useTokenProbe(base, ctx.live);
  const quoteProbe = useTokenProbe(quote, ctx.live);
  const bothReadable = baseProbe?.status === "ok" && quoteProbe?.status === "ok" && base?.toLowerCase() !== quote?.toLowerCase();
  const existing = useExistingMarket(base, quote, ctx.live && bothReadable && baseProbe.decimals === 18 && quoteProbe.decimals === 18);
  const pair = classifyPair({ base, quote, baseProbe, quoteProbe, existing });
  const message = pairMessage(pair);
  const registryTokens = details.data ?? [];

  const locked = flow.busy;
  const symbolOf = (probe: typeof baseProbe, address?: Address) => (probe?.status === "ok" && probe.symbol ? probe.symbol : address ? shortAddress(address) : "?");
  const baseName = symbolOf(baseProbe, base);
  const quoteName = symbolOf(quoteProbe, quote);

  const editBase = (v: SlotValue) => {
    setBaseSlot(v);
    setAck(false);
    if (phase === "failed") flow.reset();
  };
  const editQuote = (v: SlotValue) => {
    setQuoteSlot(v);
    setAck(false);
    if (phase === "failed") flow.reset();
  };
  const swap = () => {
    setBaseSlot(quoteSlot);
    setQuoteSlot(baseSlot);
    setAck(false);
    if (phase === "failed") flow.reset();
  };

  let label = "List market";
  let onClick = () => {
    if (canList(pair) && base && quote) flow.create({ base, quote });
  };
  let disabled = !canList(pair) || !ack;
  if (phase === "stale") {
    label = "Dismiss";
    onClick = flow.reset;
    disabled = false;
  } else if (phase === "failed") {
    label = "Try again";
    onClick = flow.reset;
    disabled = false;
  } else if (!canList(pair)) {
    label = pair.kind === "exists" ? "Already listed" : "Choose a valid pair";
  } else if (!ack) {
    label = "Acknowledge the orientation to continue";
  }

  const done = phase === "done" && state.result;
  const existingSymbol = (addr: Address) => (base && addr.toLowerCase() === base.toLowerCase() ? baseName : quote && addr.toLowerCase() === quote.toLowerCase() ? quoteName : shortAddress(addr));

  return (
    <>
      <PageHeader title="List Market" meta={markets.total !== undefined ? `${markets.total.toString()} listed so far` : undefined}>
        Open an order book for a pair of 18-decimal tokens through the on-chain MarketFactory. Anyone can list a pair, once, and the base and quote you choose become permanent.
      </PageHeader>
      <StatusBanners state={ctx} />
      <div>
        <Panel id="list-market" title={done ? "Your New Market" : "Choose the Pair"} className="min-w-0">
          {done ? (
            <div className="space-y-3">
              <MarketResult outcome={state.result!} />
              <button
                type="button"
                onClick={() => {
                  flow.reset();
                  setBaseSlot(EMPTY_SLOT);
                  setQuoteSlot(EMPTY_SLOT);
                  setAck(false);
                }}
                className="h-11 w-full rounded-xl border border-white/20 bg-white/[0.04] text-[0.8125rem] font-semibold text-white hover:bg-white/[0.08]"
              >
                List another market
              </button>
            </div>
          ) : (
            <>
              <fieldset disabled={locked || !ctx.live} className="min-w-0 space-y-2">
                <legend className="sr-only">Token pair</legend>
                <TokenSlot id="market-base" label="Base token" help="The asset being bought and sold." value={baseSlot} onChange={editBase} registry={registryTokens} probe={baseProbe} />
                <div className="relative -my-1 flex justify-center">
                  <button
                    type="button"
                    onClick={swap}
                    aria-label="Swap base and quote"
                    className="z-10 grid size-8 place-items-center rounded-[0.625rem] border border-white/20 bg-[#1c2440] text-muted-foreground hover:text-white focus-visible:outline-2"
                  >
                    <ArrowDownUp className="size-4" aria-hidden />
                  </button>
                </div>
                <TokenSlot id="market-quote" label="Quote token" help="The asset prices are expressed in." value={quoteSlot} onChange={editQuote} registry={registryTokens} probe={quoteProbe} />
              </fieldset>

              {message && pair.kind !== "exists" && pair.kind !== "incomplete" && (
                <p role="status" className="mt-3 flex gap-2 rounded-[0.75rem] border border-warn/35 bg-warn/[0.08] px-3 py-2 text-[0.75rem] text-[#e8dcb0]" data-testid="pair-message">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                  <span>{message}</span>
                </p>
              )}

              {pair.kind === "exists" && (
                <div className="mt-3 space-y-2 rounded-[0.875rem] border border-warn/35 bg-warn/[0.08] px-3.5 py-3 text-[0.75rem]" data-testid="duplicate-panel">
                  <p className="text-[0.8125rem] font-semibold">This pair already has a market</p>
                  <p className="text-[#e8dcb0]">
                    {message} It is listed as <strong>{existingSymbol(pair.existingBase)} / {existingSymbol(pair.existingQuote)}</strong>
                    {pair.orientation === "reversed" ? " (base and quote the other way round from what you chose)" : ""}. No transaction is needed, and none will be sent.
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    Market <AddressChip address={pair.market} className="text-[0.6875rem]" />
                  </p>
                  <Link
                    href={`/trade?market=${pair.market}`}
                    className="inline-flex h-9 items-center rounded-xl border border-[rgb(208_199_255/0.3)] bg-[linear-gradient(100deg,rgb(111_92_232/0.9),rgb(118_96_228/0.9)_49%,rgb(120_98_220/0.9))] px-3.5 text-[0.8125rem] font-semibold text-white hover:brightness-105"
                  >
                    Open the existing market
                  </Link>
                </div>
              )}

              {canList(pair) && base && quote && (
                <div className="mt-3 space-y-2 rounded-[0.875rem] border border-lilac/30 bg-[#161d36]/70 px-3.5 py-3 text-[0.75rem]" role="group" aria-labelledby="market-review-title" data-testid="review">
                  <p id="market-review-title" className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
                    <ShieldCheck className="size-4 text-lilac" aria-hidden /> Review before you sign
                  </p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Trading pair</dt>
                    <dd className="text-right font-semibold" data-testid="review-pair">{baseName} / {quoteName}</dd>
                    <dt className="text-muted-foreground">Base token</dt>
                    <dd className="text-right">{baseName} <AddressChip address={base} copy={false} className="text-[0.6875rem]" /></dd>
                    <dt className="text-muted-foreground">Quote token</dt>
                    <dd className="text-right">{quoteName} <AddressChip address={quote} copy={false} className="text-[0.6875rem]" /></dd>
                    <dt className="text-muted-foreground">Existing market, either orientation</dt>
                    <dd className="text-right">None (checked on-chain just now)</dd>
                  </dl>
                  <p className="text-[#c3cce0]">
                    Prices on this market will be quoted in <strong>{quoteName}</strong> per 1 <strong>{baseName}</strong>. A price of 2 means 2 {quoteName} for 1 {baseName}; amounts
                    are in {baseName}.
                  </p>
                  {pair.unverified.length > 0 && (
                    <p className="text-warn">
                      {pair.unverified.map((s) => (s === "base" ? baseName : quoteName)).join(" and ")} {pair.unverified.length > 1 ? "were" : "was"} not issued by this app&rsquo;s
                      TokenFactory, so this app cannot vouch for {pair.unverified.length > 1 ? "them" : "it"}. Listing a token does not make it safe.
                    </p>
                  )}
                  <p className="flex gap-1.5 text-warn" data-testid="orientation-warning">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      The first listing fixes which token is the base and which is the quote. Once registered, this pair can never be listed the other way round, and nothing here
                      can undo it. If you want prices in {baseName} per {quoteName}, press Swap now.
                    </span>
                  </p>
                  <label className="flex items-start gap-2 text-[#dfe4f5]">
                    <input type="checkbox" checked={ack} disabled={locked} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-[#7c5cf2]" />
                    <span>I understand that base and quote cannot be changed after this market is listed.</span>
                  </label>
                </div>
              )}

              <SubmitButton ctx={ctx} label={label} onClick={onClick} disabled={disabled} busy={flow.busy} busyLabel={BUSY_LABEL[phase]} />
              <FlowNotices kind="market" state={state} reset={flow.reset} dismissAbandoned={flow.dismissAbandoned} />
            </>
          )}
        </Panel>

        <FactoryFacts
          title="How Listing Works"
          address={factory}
          facts={[
            { term: "One market per pair", detail: "A pair can be listed once, in either order. The reverse pair is refused so liquidity is never split. The check is made on-chain before you sign." },
            { term: "Base and quote are permanent", detail: "The first listing fixes the orientation. The base is the asset traded; the quote is the asset prices are expressed in." },
            { term: "Any 18-decimal token", detail: "The contract does not require TokenFactory tokens. Others are allowed but marked unverified: listing a token does not vouch for it." },
            { term: "No fees, no admin", detail: "Listing is a single transaction paid in gas. There is no owner and no list of approved tokens." },
          ]}
        />
      </div>
    </>
  );
}
