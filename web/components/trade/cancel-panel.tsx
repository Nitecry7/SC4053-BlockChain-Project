"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/data/amount";
import { shortAddress } from "@/components/data/address-chip";
import type { DashboardState } from "@/components/dashboard/use-dashboard";
import { WalletOutcome, WalletWaiting } from "@/components/wallet/wallet-pending-notice";
import type { useCancelFlow } from "@/hooks/use-cancel-flow";
import type { MyOrder } from "@/hooks/use-dex-data";
import type { CancelOutcome } from "@/lib/cancel-runner";
import { isBusy } from "@/lib/order-flow";
import { canCancel, collateralHeld, expectedRefund, remainingBase, statusLabel } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { TxStatus } from "./tx-status";

type Flow = ReturnType<typeof useCancelFlow>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </>
  );
}

const primary =
  "h-10 rounded-xl border border-[rgb(208_199_255/0.3)] bg-[linear-gradient(100deg,rgb(111_92_232/0.9),rgb(118_96_228/0.9)_49%,rgb(120_98_220/0.9))] px-4 text-[0.8125rem] font-semibold text-white shadow-[inset_0_1px_5px_rgb(255_255_255/0.2),0_10px_24px_-12px_rgb(124_92_242/0.8)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-[linear-gradient(100deg,rgb(101_86_204/0.4),rgb(162_139_248/0.4)_49%,rgb(120_98_220/0.4))] disabled:text-white/70 disabled:shadow-none disabled:hover:brightness-100";

/**
 * Cancelling one of the connected account's orders: a confirmation that states the refund before anything is sent, the
 * same lifecycle notices as the ticket (wallet waiting, step list with the transaction hash, rejection, failure, a
 * flow dropped because the account or network changed, a request abandoned with "Try again"), and a result that is
 * shown only once the cancellation is confirmed on-chain and read back from the receipt.
 */
export function CancelPanel({
  state,
  flow,
  row,
  selected,
  onClose,
}: {
  state: DashboardState;
  flow: Flow;
  /** The selected order as My orders last read it, if it is still listed. */
  row: MyOrder | undefined;
  selected: bigint | undefined;
  onClose: () => void;
}) {
  const { phase } = flow.state;
  if (selected === undefined && phase === "idle" && !flow.state.abandoned) return null;
  const { base, quote } = state.pair;
  const id = selected?.toString() ?? "";

  const confirming = phase === "idle" && selected !== undefined;
  const order = row?.order;
  const eligible = order !== undefined && canCancel(order, state.account.address);
  const refund = order ? expectedRefund(order) : undefined;
  const symbolOf = (token: "base" | "quote") => (token === "base" ? base.symbol : quote.symbol);
  const pending = order?.status === 4;
  const canSend = state.live && state.ready && eligible;

  return (
    <div className="mt-3 space-y-2.5" data-testid="cancel-panel" aria-live="polite">
      {flow.state.abandoned && (
        <WalletOutcome
          kind="cancel"
          error={{
            kind: "unknown",
            title: "A request you retried may still complete",
            detail: flow.state.abandoned.hash
              ? `The earlier cancel request was signed after you pressed Try again (transaction ${flow.state.abandoned.hash}). Check its page and My orders before sending another.`
              : "If you approve the earlier cancel request in your wallet it will still go through. Reject it there, or check My orders before sending another.",
          }}
          retryLabel="Dismiss"
          onRetry={flow.dismissAbandoned}
        />
      )}

      {confirming && (
        <section className="glass-inset space-y-2.5 rounded-[0.875rem] border border-lilac/30 px-3.5 py-3" aria-labelledby="cancel-title" data-testid="cancel-confirm">
          <h3 id="cancel-title" className="text-[0.8125rem] font-semibold">
            Cancel order #{id}?
          </h3>
          {!order ? (
            <p className="text-[0.75rem] text-muted-foreground">This order is no longer in your list. Your orders are being re-read.</p>
          ) : !eligible ? (
            <p className="text-[0.75rem] text-[#e8dcb0]" role="status">
              Order #{id} is {statusLabel(order.status).toLowerCase()} and can no longer be cancelled.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.75rem]">
                <Row label="Order">
                  {order.side === 0 ? "Buy" : "Sell"} <Amount value={order.amount} visible={4} showTail={false} symbol={base.symbol} /> at{" "}
                  <Amount value={order.price} visible={4} showTail={false} symbol={quote.symbol} />
                </Row>
                <Row label="Status">{statusLabel(order.status)}</Row>
                <Row label="Filled so far">
                  <Amount value={order.filled} visible={4} showTail={false} symbol={base.symbol} />
                </Row>
                <Row label={refund ? `You get back (${symbolOf(refund.token)})` : "You get back"}>
                  {refund ? (
                    <span data-testid="cancel-expected">
                      <Amount value={refund.amount} visible={4} showTail={false} symbol={symbolOf(refund.token)} />
                    </span>
                  ) : (
                    "—"
                  )}
                </Row>
              </dl>
              <p className="text-[0.75rem] text-[#c3cce0]">
                {pending
                  ? "This stop order has not triggered yet. Cancelling releases its whole escrow and it will never trigger."
                  : order.side === 0
                    ? "The quote token still locked for the unfilled part is returned to your wallet. Fills that already happened stay as trades."
                    : "The unfilled base tokens are returned to your wallet. Fills that already happened stay as trades."}{" "}
                No token approval is needed: your wallet is asked to confirm one transaction and only gas is spent. The refund shown here is what the order
                holds now; the amount that counts is the one the confirmed transaction reports.
              </p>
              {!canSend && (
                <p className="text-[0.75rem] text-warn" role="status">
                  {!state.live ? "The chain is not verified right now, so cancelling is paused." : "Connect your wallet on Anvil to cancel."}
                </p>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {eligible && (
              <button type="button" data-testid="cancel-confirm-button" disabled={!canSend} onClick={() => flow.cancel(selected!)} className={primary}>
                Confirm cancel
              </button>
            )}
            <button type="button" onClick={onClose} className="text-[0.75rem] text-lilac hover:text-white">
              {eligible ? "Keep order" : "Close"}
            </button>
          </div>
        </section>
      )}

      {phase === "simulating" && (
        <p className="text-[0.75rem] text-muted-foreground" role="status">
          Checking order #{id} with the contract before your wallet is asked…
        </p>
      )}
      {phase === "order-wallet" && <WalletWaiting kind="cancel" onRetry={flow.reset} />}
      {(isBusy(phase) || phase === "failed") && <TxStatus state={flow.state} kind="order" />}
      {phase === "failed" && flow.state.failure && (
        <div className="space-y-2">
          <WalletOutcome kind="cancel" error={flow.state.failure} onRetry={flow.reset} />
          <button
            type="button"
            onClick={() => {
              flow.reset();
              onClose();
            }}
            className="text-[0.75rem] text-lilac hover:text-white"
          >
            Close
          </button>
        </div>
      )}
      {phase === "stale" && (
        <WalletOutcome
          kind="cancel"
          error={{
            kind: "unknown",
            title: "Your account or network changed",
            detail: `The earlier cancel request was dropped here and its result is not applied to this view. A transaction may still have been sent from the previous account${flow.state.orderHash ? ` (${flow.state.orderHash})` : ""}. Check My orders.`,
          }}
          retryLabel="Dismiss"
          onRetry={() => {
            flow.reset();
            onClose();
          }}
        />
      )}
      {phase === "done" && flow.state.result && <CancelResult outcome={flow.state.result} state={state} onClose={() => { flow.reset(); onClose(); }} />}
    </div>
  );
}

/** What a confirmed `cancelOrder` actually did, from the decoded receipt and `getOrder`. */
function CancelResult({ outcome, state, onClose }: { outcome: CancelOutcome; state: DashboardState; onClose: () => void }) {
  const { base, quote } = state.pair;
  const bad = outcome.problems.length > 0;
  const held = collateralHeld(outcome.latest);
  const refundLines = [
    outcome.refundBase > 0n ? { value: outcome.refundBase, symbol: base.symbol } : undefined,
    outcome.refundQuote > 0n ? { value: outcome.refundQuote, symbol: quote.symbol } : undefined,
  ].filter((x): x is { value: bigint; symbol: string } => x !== undefined);
  const moved = [
    outcome.transferredBase > 0n ? { value: outcome.transferredBase, symbol: base.symbol } : undefined,
    outcome.transferredQuote > 0n ? { value: outcome.transferredQuote, symbol: quote.symbol } : undefined,
  ].filter((x): x is { value: bigint; symbol: string } => x !== undefined);
  const expectedSymbol = outcome.expected.token === "base" ? base.symbol : quote.symbol;

  return (
    <div className="space-y-2.5" data-testid="cancel-result">
      <div className={cn("flex items-start gap-2.5 rounded-[0.875rem] border px-3.5 py-3", bad ? "border-warn/40 bg-warn/[0.08]" : "border-buy/30 bg-buy/[0.07]")}>
        {bad ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-buy" aria-hidden />}
        <div className="min-w-0 text-[0.75rem] leading-relaxed">
          <p className="text-[0.8125rem] font-semibold">
            Order #{outcome.orderId.toString()} {bad ? "cancelled, but the checks disagree" : "cancelled"}
          </p>
          <p className="text-[#c3cce0]">
            Status on-chain now: <span data-testid="cancel-status" className="font-medium text-foreground">{statusLabel(outcome.latest.status)}</span>
          </p>
          <p className="text-[#c3cce0]">
            Confirmed in block {outcome.blockNumber.toString()}; read from the receipt&rsquo;s <span className="font-mono">OrderCancelled</span> event and from{" "}
            <span className="font-mono">getOrder</span>, not from the simulation. It is no longer on the book, and it stays in this list as history.
          </p>
        </div>
      </div>

      <dl className="glass-inset grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-[0.75rem] px-3 py-2 text-[0.75rem]">
        <Row label="Refund reported by the event">
          <span data-testid="cancel-refund">
            {refundLines.length === 0 ? "nothing (no escrow was left)" : refundLines.map((l, i) => (
              <span key={l.symbol}>
                {i > 0 && " and "}
                <Amount value={l.value} visible={4} showTail={false} symbol={l.symbol} />
              </span>
            ))}
          </span>
        </Row>
        <Row label={`Expected from the order (${expectedSymbol})`}>
          <Amount value={outcome.expected.amount} visible={4} showTail={false} symbol={expectedSymbol} />
        </Row>
        <Row label="Moved to your wallet in this transaction">
          {moved.length === 0 ? "nothing" : moved.map((l, i) => (
            <span key={l.symbol}>
              {i > 0 && " and "}
              <Amount value={l.value} visible={4} showTail={false} symbol={l.symbol} />
            </span>
          ))}
        </Row>
        <Row label="Escrow still held for this order">
          {held ? <Amount value={held.amount} visible={4} showTail={false} symbol={held.token === "quote" ? quote.symbol : base.symbol} /> : "—"}
        </Row>
        <Row label="Filled before the cancel">
          <Amount value={outcome.after.filled} visible={4} showTail={false} symbol={base.symbol} /> of <Amount value={outcome.after.amount} visible={4} showTail={false} />
        </Row>
        <Row label="Unfilled part released">
          <Amount value={remainingBase(outcome.after)} visible={4} showTail={false} symbol={base.symbol} />
        </Row>
        <Row label={`${base.symbol} in your wallet now`}>{state.balances.data?.[0] !== undefined ? <Amount value={state.balances.data[0]} visible={4} showTail={false} /> : "…"}</Row>
        <Row label={`${quote.symbol} in your wallet now`}>{state.balances.data?.[1] !== undefined ? <Amount value={state.balances.data[1]} visible={4} showTail={false} /> : "…"}</Row>
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

      <p className="flex flex-wrap items-center gap-x-3 text-[0.6875rem] text-muted-foreground">
        <span>
          Transaction{" "}
          <Link href={`/tx/${outcome.hash}`} className="font-mono text-lilac hover:text-white" title={outcome.hash}>
            {shortAddress(outcome.hash, 10, 6)}
          </Link>{" "}
          · gas {outcome.gasUsed.toString()}
        </span>
        <button type="button" onClick={onClose} className="text-[0.75rem] text-lilac hover:text-white">
          Close
        </button>
      </p>
    </div>
  );
}
