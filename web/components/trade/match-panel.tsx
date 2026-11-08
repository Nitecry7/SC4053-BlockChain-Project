"use client";

import { CircleCheck, Layers, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Amount } from "@/components/data/amount";
import { shortAddress } from "@/components/data/address-chip";
import { Panel } from "@/components/dashboard/panel";
import type { DashboardState } from "@/components/dashboard/use-dashboard";
import { WalletOutcome, WalletWaiting } from "@/components/wallet/wallet-pending-notice";
import { useMatchFlow, useMatchPreview } from "@/hooks/use-match-flow";
import { crossedBook } from "@/lib/crossed-book";
import type { MatchOutcome } from "@/lib/match-runner";
import { isBusy } from "@/lib/order-flow";
import { statusLabel } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { TxStatus } from "./tx-status";

const primary =
  "h-10 rounded-xl border border-[rgb(208_199_255/0.3)] bg-[linear-gradient(100deg,rgb(111_92_232/0.9),rgb(118_96_228/0.9)_49%,rgb(120_98_220/0.9))] px-4 text-[0.8125rem] font-semibold text-white shadow-[inset_0_1px_5px_rgb(255_255_255/0.2),0_10px_24px_-12px_rgb(124_92_242/0.8)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-[linear-gradient(100deg,rgb(101_86_204/0.4),rgb(162_139_248/0.4)_49%,rgb(120_98_220/0.4))] disabled:text-white/70 disabled:shadow-none disabled:hover:brightness-100";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </>
  );
}

/**
 * Match orders. Anyone can ask the market to settle buy and sell orders that cross (a placement that hit the engine's
 * per-transaction fill cap leaves such a remainder). The panel appears only while the market itself reports a crossed
 * book (`getBestBid` >= `getBestAsk`), or while a matching request is in flight or has a result to show. Nothing here is
 * sent automatically and nothing repeats: each transaction is one deliberate click. A result is shown only after the
 * transaction is confirmed and its `Trade` events and the touched orders have been read back from the chain.
 */
export function MatchPanel({ state }: { state: DashboardState }) {
  const snap = state.market.data;
  const limit = snap?.maxMatchesPerTx;
  const pairInfo = useMemo(
    () => ({ market: state.marketAddress, baseToken: state.pair.base.address, quoteToken: state.pair.quote.address }),
    [state.marketAddress, state.pair.base.address, state.pair.quote.address],
  );
  const flow = useMatchFlow(pairInfo, limit);
  const { phase } = flow.state;

  const book = snap && !state.market.isError ? crossedBook(snap.bestBid, snap.bestAsk) : undefined;
  // A review belongs to the pair of orders it was opened for: if the book changes under it (another match, a cancel, a
  // new order at the top), the review closes instead of silently applying to different orders.
  const crossKey = book?.crossed ? `${book.bidId}:${book.askId}` : undefined;
  const [reviewFor, setReviewFor] = useState<string | undefined>();
  const reviewing = crossKey !== undefined && reviewFor === crossKey;
  const setReviewing = (open: boolean) => setReviewFor(open ? crossKey : undefined);
  const idle = phase === "idle";
  const canSend = state.live && state.ready && limit !== undefined && book?.crossed === true;
  const preview = useMatchPreview(state.marketAddress, limit, state.account.address, reviewing && idle && canSend);

  if (!(book?.crossed || !idle || flow.state.abandoned)) return null;
  const { quote } = state.pair;
  const close = () => {
    flow.reset();
    setReviewing(false);
  };

  return (
    <Panel id="match" title="Match orders" className="min-h-0" action={<Layers className="size-4 text-subtle" aria-hidden />}>
      <div className="space-y-2.5" data-testid="match-panel" aria-live="polite">
        {flow.state.abandoned && (
          <WalletOutcome
            kind="match"
            error={{
              kind: "unknown",
              title: "A request you retried may still complete",
              detail: flow.state.abandoned.hash
                ? `The earlier match request was signed after you pressed Try again (transaction ${flow.state.abandoned.hash}). Check its page and the book before sending another.`
                : "If you approve the earlier match request in your wallet it will still go through. Reject it there, or check the book before sending another.",
            }}
            retryLabel="Dismiss"
            onRetry={flow.dismissAbandoned}
          />
        )}

        {idle && book?.crossed && !reviewing && (
          <section className="glass-inset space-y-2.5 rounded-[0.875rem] border border-lilac/30 px-3.5 py-3" aria-labelledby="match-crossed-title" data-testid="match-crossed">
            <h3 id="match-crossed-title" className="text-[0.8125rem] font-semibold">
              Buy and sell orders on this book can be matched
            </h3>
            <p className="text-[0.75rem] text-[#c3cce0]">
              The best buy order (#{book.bidId.toString()}, <Amount value={book.bidPrice} visible={4} showTail={false} symbol={quote.symbol} />) is at or above the best sell order (#
              {book.askId.toString()}, <Amount value={book.askPrice} visible={4} showTail={false} symbol={quote.symbol} />). Another settlement transaction can clear them. Anyone can
              send it: you pay gas, no token approval is needed, and you neither send nor receive trading tokens. Each transaction settles at most {limit?.toString() ?? "a limited number of"}{" "}
              fills, so a book with more crossed orders may need another one.
            </p>
            {!canSend && (
              <p className="text-[0.75rem] text-warn" role="status">
                {!state.live ? "The chain is not verified right now, so matching is paused." : "Connect your wallet on Anvil to send a matching transaction."}
              </p>
            )}
            <button type="button" data-testid="match-review-button" disabled={!canSend} onClick={() => setReviewing(true)} className={primary}>
              Review match
            </button>
          </section>
        )}

        {idle && reviewing && (
          <section className="glass-inset space-y-2.5 rounded-[0.875rem] border border-lilac/30 px-3.5 py-3" aria-labelledby="match-confirm-title" data-testid="match-confirm">
            <h3 id="match-confirm-title" className="text-[0.8125rem] font-semibold">
              Match crossed orders?
            </h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.75rem]">
              <Row label="Will be sent">
                <span className="font-mono">matchOrders({limit?.toString()})</span>
              </Row>
              <Row label="Settles at most">{limit?.toString()} fills</Row>
              <Row label="Simulated now (an estimate)">
                <span data-testid="match-preview">
                  {preview.status === "loading" && "checking…"}
                  {preview.status === "ready" && `about ${preview.preview.fills.toString()} fill${preview.preview.fills === 1n ? "" : "s"}`}
                  {preview.status === "error" && "the contract would reject it"}
                  {preview.status === "idle" && "—"}
                </span>
              </Row>
              {preview.status === "ready" && preview.preview.gas !== undefined && <Row label="Gas estimate">{preview.preview.gas.toString()}</Row>}
            </dl>
            {preview.status === "error" && (
              <p className="text-[0.75rem] text-warn" role="status">
                {preview.message}
              </p>
            )}
            <p className="text-[0.75rem] text-[#c3cce0]">
              No token approval is needed: your wallet is asked to confirm one transaction and only gas is spent. Each fill executes at the price of the order that entered
              the book first. The simulation is only an estimate of the next block; what counts is what the confirmed transaction reports.
            </p>
            {!canSend && (
              <p className="text-[0.75rem] text-warn" role="status">
                {!state.live ? "The chain is not verified right now, so matching is paused." : book?.crossed ? "Connect your wallet on Anvil to send." : "The book is no longer crossed."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="match-confirm-button"
                disabled={!canSend || preview.status === "loading" || preview.status === "error"}
                onClick={() => {
                  setReviewing(false);
                  flow.match();
                }}
                className={primary}
              >
                Confirm match
              </button>
              <button type="button" onClick={() => setReviewing(false)} className="text-[0.75rem] text-lilac hover:text-white">
                Not now
              </button>
            </div>
          </section>
        )}

        {phase === "simulating" && (
          <p className="text-[0.75rem] text-muted-foreground" role="status">
            Re-reading the book and checking the match with the contract before your wallet is asked…
          </p>
        )}
        {phase === "order-wallet" && <WalletWaiting kind="match" onRetry={flow.reset} />}
        {(isBusy(phase) || phase === "failed") && <TxStatus state={flow.state} kind="order" />}
        {phase === "failed" && flow.state.failure && (
          <div className="space-y-2">
            <WalletOutcome kind="match" error={flow.state.failure} onRetry={flow.reset} />
            <button type="button" onClick={close} className="text-[0.75rem] text-lilac hover:text-white">
              Close
            </button>
          </div>
        )}
        {phase === "stale" && (
          <WalletOutcome
            kind="match"
            error={{
              kind: "unknown",
              title: "Your account or network changed",
              detail: `The earlier match request was dropped here and its result is not applied to this view. A transaction may still have been sent from the previous account${flow.state.orderHash ? ` (${flow.state.orderHash})` : ""}. Check the book.`,
            }}
            retryLabel="Dismiss"
            onRetry={close}
          />
        )}
        {phase === "done" && flow.state.result && (
          <MatchResult
            outcome={flow.state.result}
            state={state}
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

/** What a confirmed `matchOrders` actually did, from the market's `Trade` events and `getOrder`. */
function MatchResult({ outcome, state, onClose, onAgain }: { outcome: MatchOutcome; state: DashboardState; onClose: () => void; onAgain: () => void }) {
  const { base, quote } = state.pair;
  const bad = outcome.problems.length > 0;
  const n = outcome.fills.length;
  return (
    <div className="space-y-2.5" data-testid="match-result">
      <div className={cn("flex items-start gap-2.5 rounded-[0.875rem] border px-3.5 py-3", bad ? "border-warn/40 bg-warn/[0.08]" : "border-buy/30 bg-buy/[0.07]")}>
        {bad ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-buy" aria-hidden />}
        <div className="min-w-0 text-[0.75rem] leading-relaxed">
          <p className="text-[0.8125rem] font-semibold" data-testid="match-headline">
            {outcome.noop ? "Confirmed: no eligible orders were settled" : `${bad ? "Matched, but the checks disagree: " : "Matched: "}${n} fill${n === 1 ? "" : "s"} settled`}
          </p>
          <p className="text-[#c3cce0]">
            Confirmed in block {outcome.blockNumber.toString()}; read from the market&rsquo;s <span className="font-mono">Trade</span> events and from <span className="font-mono">getOrder</span>,
            not from the simulation (which estimated {outcome.simulatedFills.toString()}).
            {outcome.noop && " Nothing crossed when the transaction was mined, so no trade was made; only gas was spent."}
          </p>
        </div>
      </div>

      {n > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[0.75rem]" data-testid="match-fills">
            <caption className="sr-only">Fills settled by this transaction</caption>
            <thead>
              <tr className="text-[0.6875rem] text-muted-foreground">
                <th scope="col" className="pb-1.5 text-left font-medium">Maker → taker</th>
                <th scope="col" className="pb-1.5 text-right font-medium">Amount ({base.symbol})</th>
                <th scope="col" className="pb-1.5 text-right font-medium">Price ({quote.symbol})</th>
                <th scope="col" className="pb-1.5 text-right font-medium">Total ({quote.symbol})</th>
              </tr>
            </thead>
            <tbody>
              {outcome.fills.map((f, i) => (
                <tr key={i} className="border-b border-white/[0.06] last:border-0">
                  <td className="py-1.5">
                    #{f.makerOrderId.toString()} <span className="text-muted-foreground">({shortAddress(f.maker, 4, 4)})</span> → #{f.takerOrderId.toString()}{" "}
                    <span className="text-muted-foreground">({shortAddress(f.taker, 4, 4)})</span>
                  </td>
                  <td className="tabular py-1.5 text-right">
                    <Amount value={f.baseAmount} visible={4} showTail={false} />
                  </td>
                  <td className="tabular py-1.5 text-right">
                    <Amount value={f.price} visible={4} showTail={false} />
                  </td>
                  <td className="tabular py-1.5 text-right">
                    <Amount value={f.quoteAmount} visible={4} showTail={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="glass-inset grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-[0.75rem] px-3 py-2 text-[0.75rem]">
        <Row label="Fills settled">
          <span data-testid="match-count">{n}</span>
        </Row>
        <Row label={`Total ${base.symbol} settled`}>
          <Amount value={outcome.totalBase} visible={4} showTail={false} symbol={base.symbol} />
        </Row>
        <Row label={`Total ${quote.symbol} settled`}>
          <Amount value={outcome.totalQuote} visible={4} showTail={false} symbol={quote.symbol} />
        </Row>
        {outcome.quoteReturned > 0n && (
          <Row label="Price improvement returned to buyers">
            <Amount value={outcome.quoteReturned} visible={4} showTail={false} symbol={quote.symbol} />
          </Row>
        )}
        {outcome.effects.map((e) => (
          <Row key={e.orderId.toString()} label={`Order #${e.orderId.toString()} now`}>
            {statusLabel(e.after.status)}
            {e.after.filled !== e.after.amount && (
              <>
                {" "}
                (<Amount value={e.after.filled} visible={4} showTail={false} /> of <Amount value={e.after.amount} visible={4} showTail={false} /> filled)
              </>
            )}
          </Row>
        ))}
        <Row label="Still crossed afterwards">
          <span data-testid="match-still-crossed">{outcome.stillCrossed ? "Yes: another match is needed" : "No"}</span>
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
        {outcome.stillCrossed && state.live && state.ready && (
          <button type="button" data-testid="match-again-button" onClick={onAgain} className="text-[0.75rem] font-medium text-lilac hover:text-white">
            Review another match
          </button>
        )}
        <button type="button" onClick={onClose} className="text-[0.75rem] text-lilac hover:text-white">
          Close
        </button>
      </p>
    </div>
  );
}
