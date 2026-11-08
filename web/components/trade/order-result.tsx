"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/data/amount";
import { shortAddress } from "@/components/data/address-chip";
import type { DashboardState } from "@/components/dashboard/use-dashboard";
import { useAllowance } from "@/hooks/use-dex-data";
import type { OrderOutcome } from "@/lib/order-runner";
import { collateralHeld, remainingBase, statusLabel } from "@/lib/order-status";
import { cn } from "@/lib/utils";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[0.6875rem] font-medium text-[#c3cce0]">{title}</p>
      <dl className="glass-inset grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-[0.75rem] px-3 py-2 text-[0.75rem]">{children}</dl>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </>
  );
}

/**
 * What a confirmed `placeLimitOrder` actually did, from the decoded receipt and `getOrder`. Four quantities stay
 * separate: what executed in this transaction, what is still locked in escrow, what is in the wallet now, and the
 * allowance that remains.
 */
export function OrderResult({ outcome, state }: { outcome: OrderOutcome; state: DashboardState }) {
  const { decoded, latest, atBlock } = outcome;
  const { base, quote } = state.pair;
  const isBuy = decoded.side === "buy";
  const collateralToken = isBuy ? quote : base;
  const held = collateralHeld(latest);
  const allowance = useAllowance(collateralToken.address, state.account.address, state.marketAddress);
  const maxMatches = state.market.data?.maxMatchesPerTx;
  const hitCap = maxMatches !== undefined && BigInt(decoded.trades.length) >= maxMatches && remainingBase(atBlock) > 0n;
  const fullyFilled = atBlock.status === 2;

  return (
    <div className="space-y-3" data-testid="order-result">
      <div className={cn("flex items-start gap-2.5 rounded-[0.875rem] border px-3.5 py-3", outcome.problems.length > 0 ? "border-warn/40 bg-warn/[0.08]" : "border-buy/30 bg-buy/[0.07]")}>
        {outcome.problems.length > 0 ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-buy" aria-hidden />}
        <div className="min-w-0 text-[0.75rem] leading-relaxed">
          <p className="text-[0.8125rem] font-semibold">
            Order #{decoded.orderId.toString()} {outcome.problems.length > 0 ? "mined, but the checks disagree:" : "confirmed:"}{" "}
            <span data-testid="order-status">{statusLabel(atBlock.status)}</span>
          </p>
          <p className="text-[#c3cce0]">
            {isBuy ? "Buy" : "Sell"} {base.symbol}. Confirmed in block {outcome.blockNumber.toString()}; read from the receipt and from{" "}
            <span className="font-mono">getOrder</span>, not from the simulation.
            {latest.status !== atBlock.status && <> It is now <strong>{statusLabel(latest.status).toLowerCase()}</strong> after later trades.</>}
          </p>
        </div>
      </div>

      <Group title="Executed in this transaction (from the receipt's events)">
        <Row label="Filled">
          <Amount value={decoded.filledBase} visible={4} showTail={false} symbol={base.symbol} /> of <Amount value={decoded.amount} visible={4} showTail={false} />
        </Row>
        <Row label={isBuy ? "Quote paid at maker prices" : "Quote received at maker prices"}>
          <Amount value={decoded.tradedQuote} visible={4} showTail={false} symbol={quote.symbol} />
        </Row>
        {isBuy && (
          <Row label="Refunded (price improvement)">
            <Amount value={decoded.refundQuote} visible={4} showTail={false} symbol={quote.symbol} />
          </Row>
        )}
        <Row label="Remaining unfilled">
          <Amount value={remainingBase(atBlock)} visible={4} showTail={false} symbol={base.symbol} />
        </Row>
      </Group>

      <Group title="Still locked in escrow for this order">
        <Row label={held ? `Collateral (${held.token === "quote" ? quote.symbol : base.symbol})` : "Collateral"}>
          {held ? <Amount value={held.amount} visible={4} showTail={false} symbol={held.token === "quote" ? quote.symbol : base.symbol} /> : "—"}
        </Row>
        <Row label="Escrowed when placed">
          <Amount value={decoded.escrowPulled} visible={4} showTail={false} symbol={collateralToken.symbol} />
        </Row>
      </Group>

      <Group title="In your wallet now">
        <Row label={base.symbol}>{state.balances.data?.[0] !== undefined ? <Amount value={state.balances.data[0]} visible={4} showTail={false} /> : "…"}</Row>
        <Row label={quote.symbol}>{state.balances.data?.[1] !== undefined ? <Amount value={state.balances.data[1]} visible={4} showTail={false} /> : "…"}</Row>
        <Row label={`${collateralToken.symbol} allowance left for the order book`}>
          {allowance.data !== undefined ? <Amount value={allowance.data} visible={4} showTail={false} /> : "…"}
        </Row>
      </Group>

      {decoded.trades.length > 0 && (
        <div>
          <p className="mb-1 text-[0.6875rem] font-medium text-[#c3cce0]">Trades ({decoded.trades.length})</p>
          <ul className="glass-inset divide-y divide-white/[0.06] rounded-[0.75rem] text-[0.6875rem]">
            {decoded.trades.map((t, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 px-3 py-1.5">
                <span className="text-muted-foreground">vs #{t.makerOrderId.toString()}</span>
                <span className="tabular text-right">
                  <Amount value={t.baseAmount} visible={4} showTail={false} /> @ <Amount value={t.price} visible={4} showTail={false} />
                </span>
                <span className="tabular text-right text-muted-foreground">
                  <Amount value={t.quoteAmount} visible={4} showTail={false} symbol={quote.symbol} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!fullyFilled && decoded.trades.length === 0 && (
        <p className="text-[0.75rem] text-[#c3cce0]">No one crossed your price, so the order rests on the book at your limit until a later order matches it.</p>
      )}
      {hitCap && (
        <p className={cn("flex gap-2 rounded-[0.75rem] border border-warn/35 bg-warn/[0.08] px-3 py-2 text-[0.75rem] text-[#e8dcb0]")}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <span>
            The engine matches at most {maxMatches?.toString()} orders per transaction. The remainder was placed on the book and may still cross the other
            side. Matching only happens inside transactions; nothing matches it in the background. If the book is now crossed, the{" "}
            <strong className="font-semibold">Match orders</strong> panel below the book lets anyone settle it with a separate transaction.
          </span>
        </p>
      )}
      {outcome.problems.length > 0 && (
        <div role="alert" className="rounded-[0.75rem] border border-sell/40 bg-sell/[0.08] px-3 py-2 text-[0.75rem]">
          <p className="font-semibold text-sell">The decoded logs and the chain disagree</p>
          <ul className="mt-1 list-disc pl-4 text-[#e9c3d1]">
            {outcome.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[0.6875rem] text-muted-foreground">
        Transaction{" "}
        <Link href={`/tx/${outcome.hash}`} className="font-mono text-lilac hover:text-white" title={outcome.hash}>
          {shortAddress(outcome.hash, 10, 6)}
        </Link>{" "}
        · gas {outcome.gasUsed.toString()}
      </p>
    </div>
  );
}
