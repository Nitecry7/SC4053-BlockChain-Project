"use client";

import { ActingAs } from "@/components/wallet/acting-as";
import { CircleCheck, Crosshair, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Amount } from "@/components/data/amount";
import { InfoTip } from "@/components/ui/info-tip";
import type { GlossaryKey } from "@/lib/glossary";
import { shortAddress } from "@/components/data/address-chip";
import { Panel } from "@/components/dashboard/panel";
import type { DashboardState } from "@/components/dashboard/use-dashboard";
import { WalletOutcome, WalletWaiting } from "@/components/wallet/wallet-pending-notice";
import { useTriggerFlow, useTriggerPreview, useTriggerableStops } from "@/hooks/use-trigger-flow";
import { isBusy } from "@/lib/order-flow";
import { OrderStatusBadge } from "@/components/data/order-status-badge";
import type { TriggerOutcome, TriggeredStop } from "@/lib/trigger-runner";
import { formatExact } from "@/lib/units";
import { cn } from "@/lib/utils";
import { TxStatus } from "./tx-status";

const primary =
  "h-10 rounded-xl border border-[rgb(208_199_255/0.3)] bg-[linear-gradient(100deg,rgb(111_92_232/0.9),rgb(118_96_228/0.9)_49%,rgb(120_98_220/0.9))] px-4 text-[0.8125rem] font-semibold text-white shadow-[inset_0_1px_5px_rgb(255_255_255/0.2),0_10px_24px_-12px_rgb(124_92_242/0.8)] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-[linear-gradient(100deg,rgb(101_86_204/0.4),rgb(162_139_248/0.4)_49%,rgb(120_98_220/0.4))] disabled:text-white/70 disabled:shadow-none disabled:hover:brightness-100";

function Row({ label, children, info }: { label: string; children: React.ReactNode; info?: GlossaryKey }) {
  return (
    <>
      <dt className="flex items-center text-muted-foreground">
        {label}
        {info && <InfoTip term={info} />}
      </dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </>
  );
}

/**
 * Trigger stops. A pending stop-limit order that is ELIGIBLE (the engine's rule holds at the current last trade price)
 * does not wait for another trade: it waits for someone to send `triggerStopOrders`. Anyone may. The panel appears only
 * while the contract itself says a trigger call would activate at least one stop (one `eth_call` per block), or while a
 * request is in flight or has a result on screen. Activation is not execution: an activated stop becomes an ordinary
 * order that may trade at once, rest unfilled, or be cancelled and refunded by the engine. Nothing is sent automatically
 * and nothing repeats: every transaction is one deliberate click, and the result comes only from the confirmed receipt.
 */
export function TriggerPanel({ state }: { state: DashboardState }) {
  const snap = state.market.data;
  const limit = snap?.maxMatchesPerTx;
  const pairInfo = useMemo(
    () => ({ market: state.marketAddress, baseToken: state.pair.base.address, quoteToken: state.pair.quote.address }),
    [state.marketAddress, state.pair.base.address, state.pair.quote.address],
  );
  const flow = useTriggerFlow(pairInfo, limit);
  const { phase } = flow.state;
  const idle = phase === "idle";

  const eligible = useTriggerableStops(state.marketAddress, limit, state.ready ? state.account.address : undefined, state.live && snap?.hasTradePrice === true);
  const count = eligible.data !== undefined && !eligible.isError && snap?.hasTradePrice ? eligible.data : 0n;

  // A review belongs to the last trade price it was opened at; if the price moves under it, it closes.
  const reviewKey = count > 0n && snap ? snap.lastTradePrice.toString() : undefined;
  const [reviewFor, setReviewFor] = useState<string | undefined>();
  const reviewing = reviewKey !== undefined && reviewFor === reviewKey;
  const setReviewing = (open: boolean) => setReviewFor(open ? reviewKey : undefined);

  const canSend = state.live && state.ready && limit !== undefined && count > 0n;
  const preview = useTriggerPreview(state.marketAddress, limit, state.ready ? state.account.address : undefined, reviewing && idle && canSend);

  if (!(count > 0n || !idle || flow.state.abandoned)) return null;
  const { quote } = state.pair;
  const close = () => {
    flow.reset();
    setReviewing(false);
  };

  return (
    <Panel id="trigger" title="Trigger Stops" info="triggerStops" className="min-h-0" action={<Crosshair className="size-4 text-subtle" aria-hidden />}>
      <div className="space-y-2.5" data-testid="trigger-panel" aria-live="polite">
        {flow.state.abandoned && (
          <WalletOutcome
            kind="trigger"
            error={{
              kind: "unknown",
              title: "A request you retried may still complete",
              detail: flow.state.abandoned.hash
                ? `The earlier trigger request was signed after you pressed Try again (transaction ${flow.state.abandoned.hash}). Check its page and My orders before sending another.`
                : "If you approve the earlier trigger request in your wallet it will still go through. Reject it there, or check My orders before sending another.",
            }}
            retryLabel="Dismiss"
            onRetry={flow.dismissAbandoned}
          />
        )}

        {idle && count > 0n && !reviewing && snap && (
          <section className="glass-inset space-y-2.5 rounded-[0.875rem] border border-lilac/30 px-3.5 py-3" aria-labelledby="trigger-eligible-title" data-testid="trigger-eligible">
            <h3 id="trigger-eligible-title" className="text-[0.8125rem] font-semibold">
              Pending stop orders are eligible and waiting for a trigger transaction
            </h3>
            <p className="text-[0.75rem] text-[#c3cce0]">
              The last trade price is <Amount value={snap.lastTradePrice} visible={4} showTail={false} symbol={quote.symbol} />, and the contract says about {count.toString()} stop order
              {count === 1n ? "" : "s"} would activate now (a simulation of the next block, not a promise). <strong>No other trade is needed</strong>: eligible stops stay pending, with their
              collateral escrowed, until a Trigger stops transaction is mined. Anyone can send it: you pay gas, no token approval is needed, and you neither send nor receive trading tokens.
              Each transaction activates at most {limit?.toString() ?? "a limited number of"} stops.
            </p>
            <p className="text-[0.75rem] text-[#c3cce0]">
              <strong>Activation is not execution.</strong> An activated stop becomes an ordinary order at its limit price. It may trade at once (partly or fully, as a taker), rest unfilled, or be
              cancelled and refunded by the engine if more orders rank ahead of it than the engine will scan.
            </p>
            {!canSend && (
              <p className="text-[0.75rem] text-warn" role="status">
                {!state.live ? "The chain is not verified right now, so triggering is paused." : "Connect your wallet on Anvil to send a trigger transaction."}
              </p>
            )}
            <button type="button" data-testid="trigger-review-button" disabled={!canSend} onClick={() => setReviewing(true)} className={primary}>
              Review trigger
            </button>
          </section>
        )}

        {idle && reviewing && (
          <section className="glass-inset space-y-2.5 rounded-[0.875rem] border border-lilac/30 px-3.5 py-3" aria-labelledby="trigger-confirm-title" data-testid="trigger-confirm">
            <h3 id="trigger-confirm-title" className="text-[0.8125rem] font-semibold">
              Trigger eligible stop orders?
            </h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.75rem]">
              <ActingAs address={state.account.address} />
              <Row label="Will Be Sent">
                <span className="font-mono">triggerStopOrders({limit?.toString()})</span>
              </Row>
              <Row label="Activates at Most">{limit?.toString()} stops</Row>
              <Row label="Last trade price now">{snap?.hasTradePrice ? <Amount value={snap.lastTradePrice} visible={4} showTail={false} symbol={quote.symbol} /> : "—"}</Row>
              <Row label="Simulated now (an estimate)">
                <span data-testid="trigger-preview">
                  {preview.status === "loading" && "checking…"}
                  {preview.status === "ready" && `about ${preview.preview.count.toString()} stop${preview.preview.count === 1n ? "" : "s"}`}
                  {preview.status === "error" && "the contract would reject it"}
                  {preview.status === "idle" && "—"}
                </span>
              </Row>
              {preview.status === "ready" && preview.preview.gas !== undefined && <Row label="Gas Estimate" info="gas">{preview.preview.gas.toString()}</Row>}
            </dl>
            {preview.status === "error" && (
              <p className="text-[0.75rem] text-warn" role="status">
                {preview.message}
              </p>
            )}
            <p className="text-[0.75rem] text-[#c3cce0]">
              No token approval is needed: your wallet is asked to confirm one transaction and only gas is spent. Activation is not a fill: what each stop does next (trade, rest or be
              refunded) is decided by the contract and is shown only after the transaction is confirmed. The simulation is only an estimate of the next block.
            </p>
            {!canSend && (
              <p className="text-[0.75rem] text-warn" role="status">
                {!state.live ? "The chain is not verified right now, so triggering is paused." : count > 0n ? "Connect your wallet on Anvil to send." : "No stop is eligible any more."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="trigger-confirm-button"
                disabled={!canSend || preview.status === "loading" || preview.status === "error"}
                onClick={() => {
                  setReviewing(false);
                  flow.trigger();
                }}
                className={primary}
              >
                Confirm trigger
              </button>
              <button type="button" onClick={() => setReviewing(false)} className="text-[0.75rem] text-lilac hover:text-white">
                Not now
              </button>
            </div>
          </section>
        )}

        {phase === "simulating" && (
          <p className="text-[0.75rem] text-muted-foreground" role="status">
            Checking the trigger with the contract before your wallet is asked…
          </p>
        )}
        {phase === "order-wallet" && <WalletWaiting kind="trigger" onRetry={flow.reset} />}
        {(isBusy(phase) || phase === "failed") && <TxStatus state={flow.state} kind="order" />}
        {phase === "failed" && flow.state.failure && (
          <div className="space-y-2">
            <WalletOutcome kind="trigger" error={flow.state.failure} onRetry={flow.reset} />
            <button type="button" onClick={close} className="text-[0.75rem] text-lilac hover:text-white">
              Close
            </button>
          </div>
        )}
        {phase === "stale" && (
          <WalletOutcome
            kind="trigger"
            error={{
              kind: "unknown",
              title: "Your account or network changed",
              detail: `The earlier trigger request was dropped here and its result is not applied to this view. A transaction may still have been sent from the previous account${flow.state.orderHash ? ` (${flow.state.orderHash})` : ""}. Check My orders.`,
            }}
            retryLabel="Dismiss"
            onRetry={close}
          />
        )}
        {phase === "done" && flow.state.result && (
          <TriggerResult
            outcome={flow.state.result}
            state={state}
            canSend={state.live && state.ready}
            onClose={close}
            onAgain={() => {
              flow.reset();
              setReviewing(true);
            }}
          />
        )}
      </div>
    </Panel>
  );
}

function describe(t: TriggeredStop, state: DashboardState): string {
  const { base, quote } = state.pair;
  if (t.outcome === "filled") return "Activated and filled completely, as a taker at the resting orders' prices.";
  if (t.outcome === "partly-filled") return `Activated and filled ${formatExact(t.tradedBase)} ${base.symbol} (of ${formatExact(t.after.amount)}); the rest now rests on the book at its limit price.`;
  if (t.outcome === "resting") return "Activated: it is now an ordinary resting order at its limit price. Nothing was filled.";
  if (t.outcome === "auto-cancelled") {
    const parts = [t.refundBase > 0n ? `${formatExact(t.refundBase)} ${base.symbol}` : "", t.refundQuote > 0n ? `${formatExact(t.refundQuote)} ${quote.symbol}` : ""].filter(Boolean);
    return `Activated, but the engine could not place the rest in the book (too many orders rank ahead of its limit price), so it cancelled it and refunded ${parts.join(" and ") || "nothing"}.`;
  }
  return "An unexpected state was read: see the problems below.";
}

/** What a confirmed `triggerStopOrders` actually did, from the receipt's own events and `getOrder`. */
function TriggerResult({ outcome, state, canSend, onClose, onAgain }: { outcome: TriggerOutcome; state: DashboardState; canSend: boolean; onClose: () => void; onAgain: () => void }) {
  const { base, quote } = state.pair;
  const bad = outcome.problems.length > 0;
  const n = outcome.triggered.length;
  return (
    <div className="space-y-2.5" data-testid="trigger-result">
      <div className={cn("flex items-start gap-2.5 rounded-[0.875rem] border px-3.5 py-3", bad ? "border-warn/40 bg-warn/[0.08]" : "border-buy/30 bg-buy/[0.07]")}>
        {bad ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-buy" aria-hidden />}
        <div className="min-w-0 text-[0.75rem] leading-relaxed">
          <p className="text-[0.8125rem] font-semibold" data-testid="trigger-headline">
            {outcome.noop ? "Confirmed: no stop order was activated" : `${bad ? "Triggered, but the checks disagree: " : "Triggered: "}${n} stop order${n === 1 ? "" : "s"} activated`}
          </p>
          <p className="text-[#c3cce0]">
            Confirmed in block {outcome.blockNumber.toString()}; read from the market&rsquo;s <span className="font-mono">StopOrderTriggered</span>, <span className="font-mono">Trade</span> and{" "}
            <span className="font-mono">OrderCancelled</span> events and from <span className="font-mono">getOrder</span>, not from the simulation (which estimated {outcome.simulatedCount.toString()}).
            {outcome.noop && " Nothing was eligible when the transaction was mined, so no order changed; only gas was spent."} Activation is not execution: each line below says what actually happened to that order.
          </p>
        </div>
      </div>

      {n > 0 && (
        <ul className="space-y-1.5 text-[0.75rem]" data-testid="trigger-stops">
          {outcome.triggered.map((t) => (
            <li key={t.orderId.toString()} className="glass-inset rounded-[0.75rem] px-3 py-2" data-testid={`trigger-stop-${t.orderId.toString()}`} data-outcome={t.outcome}>
              <p className="font-medium">
                Order #{t.orderId.toString()} <span className="text-muted-foreground">({shortAddress(t.after.trader, 4, 4)})</span>: <OrderStatusBadge status={t.after.status} className="ml-1 align-middle" />
              </p>
              <p className="text-[#c3cce0]">{describe(t, state)}</p>
              <p className="text-[0.6875rem] text-muted-foreground">
                It became eligible at a last trade price of <Amount value={t.lastTradePrice} visible={4} showTail={false} symbol={quote.symbol} />; its trigger was{" "}
                <Amount value={t.before.triggerPrice} visible={4} showTail={false} symbol={quote.symbol} />.
              </p>
            </li>
          ))}
        </ul>
      )}

      <dl className="glass-inset grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-[0.75rem] px-3 py-2 text-[0.75rem]">
        <Row label="Stop Orders Activated">
          <span data-testid="trigger-count">{n}</span>
        </Row>
        <Row label={`Total ${base.symbol} traded by them`}>
          <Amount value={outcome.totalBase} visible={4} showTail={false} symbol={base.symbol} />
        </Row>
        <Row label={`Total ${quote.symbol} traded by them`}>
          <Amount value={outcome.totalQuote} visible={4} showTail={false} symbol={quote.symbol} />
        </Row>
        <Row label="Last trade price now">
          <Amount value={outcome.lastTradeAfter} visible={4} showTail={false} symbol={quote.symbol} />
        </Row>
        <Row label="More stops eligible now">
          <span data-testid="trigger-still-eligible">{outcome.stillEligible > 0n ? `Yes, about ${outcome.stillEligible.toString()}: another trigger is needed` : "No"}</span>
        </Row>
        <Row label="Order book crossed now">
          <span data-testid="trigger-crossed">{outcome.crossed ? "Yes: use Match orders to settle it" : "No"}</span>
        </Row>
      </dl>

      {bad && (
        <div role="alert" className="rounded-[0.75rem] border border-sell/40 bg-sell/[0.08] px-3 py-2 text-[0.75rem]">
          <p className="font-semibold text-sell">The decoded logs and the chain disagree</p>
          <ul className="mt-1 list-disc pl-4 text-[#e9c3d1]">
            {outcome.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
        <span>
          Transaction{" "}
          <Link href={`/tx/${outcome.hash}`} className="font-mono text-lilac hover:text-white" title={outcome.hash}>
            {shortAddress(outcome.hash, 10, 6)}
          </Link>{" "}
          · gas {outcome.gasUsed.toString()}
        </span>
        {outcome.stillEligible > 0n && canSend && (
          <button type="button" data-testid="trigger-again-button" onClick={onAgain} className="text-[0.75rem] font-medium text-lilac hover:text-white">
            Review another trigger
          </button>
        )}
        <button type="button" onClick={onClose} className="text-[0.75rem] text-lilac hover:text-white">
          Close
        </button>
      </p>
    </div>
  );
}
