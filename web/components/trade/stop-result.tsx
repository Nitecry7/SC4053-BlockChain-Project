"use client";

import { CircleCheck, Hourglass, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/data/amount";
import { shortAddress } from "@/components/data/address-chip";
import type { DashboardState } from "@/components/dashboard/use-dashboard";
import { OrderStatusBadge } from "@/components/data/order-status-badge";
import { stopState, stopStateText } from "@/lib/stop-orders";
import type { StopOutcome } from "@/lib/stop-runner";
import { formatExact } from "@/lib/units";
import { cn } from "@/lib/utils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </>
  );
}

/**
 * What a confirmed `placeStopLimitOrder` did, from the decoded receipt and `getOrder`. The order is PENDING: it is
 * escrowed and waiting, it is not on the order book and it has not traded. Whether it is waiting for the price or already
 * eligible (and then only waiting for a Trigger stops transaction) is read from the market's current last trade price.
 */
export function StopResult({ outcome, state }: { outcome: StopOutcome; state: DashboardState }) {
  const { base, quote } = state.pair;
  const snap = state.market.data;
  const bad = outcome.problems.length > 0;
  const d = outcome.decoded;
  const symbolCollateral = d.side === "buy" ? quote.symbol : base.symbol;
  const held = d.side === "buy" ? outcome.latest.lockedQuote : outcome.latest.amount - outcome.latest.filled;
  const pending = outcome.latest.status === 4;
  const st = snap && pending ? stopState(d.side, d.triggerPrice, snap.lastTradePrice, snap.hasTradePrice) : undefined;

  return (
    <div className="space-y-3" data-testid="stop-result">
      <div className={cn("flex items-start gap-2.5 rounded-[0.875rem] border px-3.5 py-3", bad ? "border-warn/40 bg-warn/[0.08]" : "border-buy/30 bg-buy/[0.07]")}>
        {bad ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-buy" aria-hidden />}
        <div className="min-w-0 text-[0.75rem] leading-relaxed">
          <p className="text-[0.8125rem] font-semibold">
            Stop-limit order #{d.orderId.toString()} {bad ? "placed, but the checks disagree" : "placed and pending"}
          </p>
          <p className="text-[#c3cce0]">
            Status on-chain now: <OrderStatusBadge status={outcome.latest.status} data-testid="stop-result-status" className="ml-1 align-middle" />
          </p>
          <p className="text-[#c3cce0]">
            Confirmed in block {outcome.blockNumber.toString()}; read from the receipt&rsquo;s <span className="font-mono">StopOrderPlaced</span> event and from <span className="font-mono">getOrder</span>.
            Nothing has been activated or filled: the order is waiting, with its collateral in escrow, and it is not on the order book.
          </p>
        </div>
      </div>

      <dl className="glass-inset grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-[0.75rem] px-3 py-2 text-[0.75rem]">
        <Row label="Side">{d.side === "buy" ? `Buy ${base.symbol}` : `Sell ${base.symbol}`}</Row>
        <Row label="Trigger Price">
          <Amount value={d.triggerPrice} visible={4} showTail={false} symbol={quote.symbol} />
        </Row>
        <Row label="Limit Price">
          <Amount value={d.limitPrice} visible={4} showTail={false} symbol={quote.symbol} />
        </Row>
        <Row label="Amount">
          <Amount value={d.amount} visible={4} showTail={false} symbol={base.symbol} />
        </Row>
        <Row label="Collateral Escrowed Now">
          <Amount value={held} visible={4} showTail={false} symbol={symbolCollateral} />
        </Row>
        <Row label="Moved to the order book in this transaction">
          <Amount value={d.side === "buy" ? d.escrowQuote : d.escrowBase} visible={4} showTail={false} symbol={symbolCollateral} />
        </Row>
      </dl>

      {st && (
        <p className="flex gap-2 rounded-[0.75rem] border border-lilac/30 bg-[#161d36]/70 px-3 py-2 text-[0.75rem] text-[#c3cce0]" data-testid="stop-result-state" role="status">
          <Hourglass className="mt-0.5 size-4 shrink-0 text-lilac" aria-hidden />
          <span>{stopStateText(st, d.side, formatExact(d.triggerPrice))}</span>
        </p>
      )}

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

      <p className="text-[0.6875rem] text-muted-foreground">
        The trigger compares with this market&rsquo;s own last trade price, not an outside price feed, and trading can move it. A stop-limit order is not a guarantee of execution or of price.
        Transaction{" "}
        <Link href={`/tx/${outcome.hash}`} className="font-mono text-lilac hover:text-white" title={outcome.hash}>
          {shortAddress(outcome.hash, 10, 6)}
        </Link>{" "}
        · gas {outcome.gasUsed.toString()}
      </p>
    </div>
  );
}
