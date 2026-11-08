"use client";

import { CircleCheck, CircleX, Hourglass } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import type { Address, Hex } from "viem";
import { Panel } from "@/components/dashboard/panel";
import { StatusBanners } from "@/components/dashboard/status-banners";
import { useDashboard } from "@/components/dashboard/use-dashboard";
import { AddressChip } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { EmptyState } from "@/components/data/states";
import { PageHeader } from "@/components/registry/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketRegistry, useTokenDetails, useTokenRegistry, useTxReceipt } from "@/hooks/use-dex-data";
import { decodeTxEvents, type TxEvent } from "@/lib/receipt";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A transaction as the chain recorded it: status, who called what, and the events of the registered contracts. */
export function TxView() {
  const { hash } = useParams<{ hash: string }>();
  const valid = HASH.test(hash ?? "");
  const state = useDashboard();
  const tx = useTxReceipt(valid ? (hash as Hex) : undefined);
  const markets = useMarketRegistry(state.live);
  const tokenReg = useTokenRegistry(state.live);
  const tokenList = useMemo(() => [...(tokenReg.tokens ?? [])] as Address[], [tokenReg.tokens]);
  const tokenDetails = useTokenDetails(tokenList, state.live && tokenList.length > 0);
  const symbol = (a: Address) => tokenDetails.data?.find((t) => same(t.address, a))?.symbol ?? `${a.slice(0, 6)}…${a.slice(-4)}`;
  const pairOf = (market: Address) => markets.markets?.find((m) => same(m.address, market));
  const label = (a: Address | null | undefined) => {
    if (!a) return "none (contract creation)";
    if (markets.markets?.some((m) => same(m.address, a))) return "Market";
    if (tokenList.some((t) => same(t, a))) return `Token ${symbol(a)}`;
    return "Other address";
  };

  const registriesFailed = markets.isError || tokenReg.isError;
  const registriesReady = markets.markets !== undefined && tokenReg.tokens !== undefined;
  const receipt = tx.data?.receipt;
  const decoded = useMemo(
    () =>
      receipt
        ? decodeTxEvents({ logs: receipt.logs, markets: (markets.markets ?? []).map((m) => m.address), tokens: tokenList })
        : undefined,
    [receipt, markets.markets, tokenList],
  );

  let body: React.ReactNode;
  if (!valid) body = <EmptyState title="That is not a transaction hash">A transaction hash is 0x followed by 64 hexadecimal digits.</EmptyState>;
  else if (!state.live) body = <EmptyState title="Cannot read this chain">The deployment or the node is not reachable.</EmptyState>;
  else if (tx.isPending)
    body = (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-8 w-48 bg-white/8" />
        <Skeleton className="h-24 w-full bg-white/6" />
      </div>
    );
  else if (tx.isError) body = <EmptyState title="Could not read the transaction">The chain read failed. It will retry on the next block.</EmptyState>;
  else if (!tx.data?.tx && !receipt)
    body = <EmptyState title="Transaction not found">This node has no transaction with that hash. It may belong to another chain, or the chain may have been restarted.</EmptyState>;
  else if (!receipt)
    body = (
      <EmptyState title="Pending" icon={<Hourglass className="size-5" />}>
        The node has the transaction but it is not in a block yet. This page refreshes with each new block.
      </EmptyState>
    );
  else {
    const ok = receipt.status === "success";
    body = (
      <div className="space-y-4">
        <div
          className={`flex items-start gap-2.5 rounded-[0.875rem] border px-3.5 py-3 ${ok ? "border-buy/30 bg-buy/[0.07]" : "border-sell/35 bg-sell/[0.08]"}`}
          data-testid="tx-status"
          data-status={receipt.status}
        >
          {ok ? <CircleCheck className="mt-0.5 size-5 text-buy" aria-hidden /> : <CircleX className="mt-0.5 size-5 text-sell" aria-hidden />}
          <div className="text-[0.8125rem]">
            <p className="font-semibold">{ok ? "Succeeded" : "Reverted"}</p>
            <p className="text-[#c3cce0]">
              {ok
                ? `Included in block ${receipt.blockNumber.toString()}.`
                : `Included in block ${receipt.blockNumber.toString()}, but the contract call reverted. Nothing it tried to change was kept; only gas was spent.`}
            </p>
          </div>
        </div>

        <dl className="glass-inset grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[0.875rem] px-3.5 py-3 text-[0.75rem]">
          <dt className="text-muted-foreground">Block</dt>
          <dd className="tabular">{receipt.blockNumber.toString()}</dd>
          <dt className="text-muted-foreground">From</dt>
          <dd><AddressChip address={receipt.from} /></dd>
          <dt className="text-muted-foreground">To</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {receipt.to ? <AddressChip address={receipt.to} /> : "—"} <span className="text-subtle">{label(receipt.to)}</span>
          </dd>
          <dt className="text-muted-foreground">Gas used</dt>
          <dd className="tabular">{receipt.gasUsed.toString()}</dd>
          <dt className="text-muted-foreground">Logs</dt>
          <dd className="tabular">{receipt.logs.length}</dd>
        </dl>

        <div>
          <h2 className="mb-2 text-[0.9375rem] font-semibold tracking-[-0.02em]">Decoded Events</h2>
          {registriesFailed ? (
            <p className="text-[0.75rem] text-muted-foreground">The market and token registries could not be read, so this page cannot tell which events to trust and decodes none.</p>
          ) : !registriesReady ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-8 w-full bg-white/6" />
              <Skeleton className="h-8 w-full bg-white/6" />
            </div>
          ) : decoded && decoded.events.length > 0 ? (
            <ol className="space-y-1.5" data-testid="tx-events">
              {decoded.events.map((e, i) => (
                <li key={i} className="glass-inset rounded-[0.75rem] px-3 py-2 text-[0.75rem]">
                  <EventLine e={e} symbol={symbol} pairOf={pairOf} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[0.75rem] text-muted-foreground">No events from this app&rsquo;s markets or tokens.</p>
          )}
          {registriesReady && decoded && decoded.unrecognised > 0 && (
            <p className="mt-2 text-[0.6875rem] text-muted-foreground">
              {decoded.unrecognised} log{decoded.unrecognised > 1 ? "s" : ""} from other contracts {decoded.unrecognised > 1 ? "are" : "is"} not decoded here, because only events emitted by the
              registered markets and tokens are trusted.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Transaction" meta={valid ? <AddressChip address={hash!} /> : undefined}>
        What the chain recorded for this transaction. Events are decoded from the contracts&rsquo; own ABIs.{" "}
        <Link href="/trade" className="text-lilac hover:text-white">Back to Trade</Link>
      </PageHeader>
      <StatusBanners state={state} />
      <Panel id="tx" title="Receipt">
        {body}
      </Panel>
    </>
  );
}

function EventLine({
  e,
  symbol,
  pairOf,
}: {
  e: TxEvent;
  symbol: (a: Address) => string;
  pairOf: (market: Address) => { base: Address; quote: Address } | undefined;
}) {
  // Amounts in order and trade events are base amounts and quote-per-base prices of that event's market.
  const pair = e.kind === "OrderPlaced" || e.kind === "Trade" || e.kind === "OrderCancelled" || e.kind === "StopOrderPlaced" ? pairOf(e.market) : undefined;
  const b = pair ? symbol(pair.base) : undefined;
  const q = pair ? symbol(pair.quote) : undefined;
  switch (e.kind) {
    case "OrderPlaced":
      return (
        <>
          <strong>Order #{e.orderId.toString()} placed</strong> by <AddressChip address={e.trader} copy={false} className="text-[0.75rem]" />: {e.side === "buy" ? "Buy" : "Sell"}{" "}
          <Amount value={e.amount} visible={4} showTail={false} symbol={b} /> at limit <Amount value={e.price} visible={4} showTail={false} symbol={q} />
        </>
      );
    case "Trade":
      return (
        <>
          <strong>Trade</strong>: maker #{e.makerOrderId.toString()} with taker #{e.takerOrderId.toString()}, <Amount value={e.baseAmount} visible={4} showTail={false} symbol={b} /> at the maker&rsquo;s price{" "}
          <Amount value={e.price} visible={4} showTail={false} symbol={q} /> for <Amount value={e.quoteAmount} visible={4} showTail={false} symbol={q} />
        </>
      );
    case "OrderCancelled":
      return (
        <>
          <strong>Order #{e.orderId.toString()} cancelled</strong> by <AddressChip address={e.trader} copy={false} className="text-[0.75rem]" />: refund{" "}
          {e.refundBase > 0n ? <Amount value={e.refundBase} visible={4} showTail={false} symbol={b} /> : null}
          {e.refundBase > 0n && e.refundQuote > 0n ? " and " : null}
          {e.refundQuote > 0n ? <Amount value={e.refundQuote} visible={4} showTail={false} symbol={q} /> : null}
          {e.refundBase === 0n && e.refundQuote === 0n ? "nothing (no escrow was left)" : null}
        </>
      );
    case "StopOrderPlaced":
      return (
        <>
          <strong>Stop-limit order #{e.orderId.toString()} placed</strong> by <AddressChip address={e.trader} copy={false} className="text-[0.75rem]" />: {e.side === "buy" ? "Buy" : "Sell"}{" "}
          <Amount value={e.amount} visible={4} showTail={false} symbol={b} />, trigger <Amount value={e.triggerPrice} visible={4} showTail={false} symbol={q} />, limit{" "}
          <Amount value={e.limitPrice} visible={4} showTail={false} symbol={q} />. It is pending, not on the order book.
        </>
      );
    case "StopOrderTriggered":
      return (
        <>
          <strong>Stop order #{e.orderId.toString()} activated</strong> at a last trade price of <Amount value={e.lastTradePrice} visible={4} showTail={false} />. Activation is not a fill: see the trades below it, if any.
        </>
      );
    case "Transfer":
      return (
        <>
          <strong>{symbol(e.token)} transfer</strong>: <Amount value={e.value} visible={4} showTail={false} /> from <AddressChip address={e.from} copy={false} className="text-[0.75rem]" /> to{" "}
          <AddressChip address={e.to} copy={false} className="text-[0.75rem]" />
        </>
      );
    case "Approval":
      return (
        <>
          <strong>{symbol(e.token)} approval</strong>: <AddressChip address={e.owner} copy={false} className="text-[0.75rem]" /> allows <AddressChip address={e.spender} copy={false} className="text-[0.75rem]" /> to move{" "}
          <Amount value={e.value} visible={4} showTail={false} />
        </>
      );
  }
}
