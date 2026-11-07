"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Amount } from "@/components/data/amount";
import { shortAddress } from "@/components/data/address-chip";
import { EmptyState } from "@/components/data/states";
import { Panel } from "@/components/dashboard/panel";
import type { DashboardState } from "@/components/dashboard/use-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { useCancelFlow } from "@/hooks/use-cancel-flow";
import { MY_ORDERS_LIMIT, useMyOrders } from "@/hooks/use-dex-data";
import { canCancel, collateralHeld, remainingBase, statusLabel } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { CancelPanel } from "./cancel-panel";

/**
 * The connected account's orders on the selected market, read from `getUserOrderIds`, `getOrder` and the market's
 * logs. Queries are keyed by account, so another wallet's orders are never shown. An order that is open, partly
 * filled or a pending stop gets a Cancel action (`CancelPanel`): it states the refund first, asks the wallet for one
 * `cancelOrder` transaction, and reports success only after the confirmed receipt has been read back. Cancelled orders
 * stay in this list as history; they are no longer on the book.
 */
export function MyOrders({ state }: { state: DashboardState }) {
  const { live, ready, account, pair, marketAddress, network } = state;
  const q = useMyOrders(marketAddress, ready ? account.address : undefined, live);
  const market = `${pair.base.symbol} / ${pair.quote.symbol}`;

  const pairInfo = useMemo(
    () => ({ market: marketAddress, baseToken: pair.base.address, quoteToken: pair.quote.address }),
    [marketAddress, pair.base.address, pair.quote.address],
  );
  const flow = useCancelFlow(pairInfo);
  const [selected, setSelected] = useState<bigint | undefined>();
  const selectedRow = q.data?.rows.find((r) => r.order.id === selected);
  const idle = flow.state.phase === "idle";

  let body: React.ReactNode;
  if (!live) body = <EmptyState title="Orders unavailable">They are read once the deployment is found on this chain.</EmptyState>;
  else if (network.kind === "disconnected") body = <EmptyState title="Connect a wallet to see your orders">Orders are listed per account and per market.</EmptyState>;
  else if (network.kind === "connecting") body = <EmptyState title="Connecting to your wallet…" />;
  else if (network.kind === "wrong-network") body = <EmptyState title="Switch to Anvil to see your orders">Your wallet is on another network.</EmptyState>;
  else if (q.isError) body = <EmptyState title="Could not read your orders">The chain read failed. It will retry on the next block.</EmptyState>;
  else if (!q.data)
    body = (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-10 w-full bg-white/6" />
        <Skeleton className="h-10 w-full bg-white/6" />
      </div>
    );
  else if (q.data.rows.length === 0) body = <EmptyState title={`No orders yet on ${market}`}>Orders you place on this market appear here with their fills and status.</EmptyState>;
  else
    body = (
      <>
        <table className="w-full text-[0.75rem]" data-testid="my-orders">
          <caption className="sr-only">Your orders on {market}</caption>
          <thead className="max-lg:sr-only">
            <tr className="border-b border-white/[0.09] text-[0.6875rem] text-muted-foreground">
              <th scope="col" className="pb-2 text-left font-medium">Order</th>
              <th scope="col" className="pb-2 text-left font-medium">Market</th>
              <th scope="col" className="pb-2 text-left font-medium">Side</th>
              <th scope="col" className="pb-2 text-right font-medium">Limit price</th>
              <th scope="col" className="pb-2 text-right font-medium">Amount</th>
              <th scope="col" className="pb-2 text-right font-medium">Filled</th>
              <th scope="col" className="pb-2 text-right font-medium">Remaining</th>
              <th scope="col" className="pb-2 text-right font-medium">Locked collateral</th>
              <th scope="col" className="pb-2 pl-3 text-left font-medium">Status</th>
              <th scope="col" className="pb-2 text-right font-medium">Transaction</th>
            </tr>
          </thead>
          <tbody className="max-lg:block">
            {q.data.rows.map(({ order, placedTx, trades }) => {
              const held = collateralHeld(order);
              const buy = order.side === 0;
              return (
                <tr
                  key={order.id.toString()}
                  data-order-id={order.id.toString()}
                  className="border-b border-white/[0.07] align-top last:border-0 max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-3 max-lg:gap-y-1 max-lg:py-3"
                >
                  <td className="tabular py-2.5 pr-3 font-semibold max-lg:py-0">#{order.id.toString()}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground max-lg:py-0">{market}</td>
                  <td className="py-2.5 pr-3 max-lg:py-0">
                    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold", buy ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell")}>{buy ? "Buy" : "Sell"}</span>
                  </td>
                  <td className="tabular py-2.5 text-right max-lg:py-0 max-lg:text-left"><span className="text-muted-foreground lg:hidden">Price </span><Amount value={order.price} visible={4} showTail={false} /></td>
                  <td className="tabular py-2.5 text-right max-lg:py-0 max-lg:text-left"><span className="text-muted-foreground lg:hidden">Amount </span><Amount value={order.amount} visible={4} showTail={false} /></td>
                  <td className="tabular py-2.5 text-right max-lg:py-0 max-lg:text-left"><span className="text-muted-foreground lg:hidden">Filled </span><Amount value={order.filled} visible={4} showTail={false} /></td>
                  <td className="tabular py-2.5 text-right max-lg:py-0 max-lg:text-left"><span className="text-muted-foreground lg:hidden">Left </span><Amount value={order.status === 3 ? 0n : remainingBase(order)} visible={4} showTail={false} /></td>
                  <td className="tabular py-2.5 text-right max-lg:py-0 max-lg:text-left">
                    <span className="text-muted-foreground lg:hidden">Locked </span>
                    {held ? <Amount value={held.amount} visible={4} showTail={false} symbol={held.token === "quote" ? pair.quote.symbol : pair.base.symbol} /> : "—"}
                  </td>
                  <td className="py-2.5 pl-3 max-lg:py-0 max-lg:pl-0">
                    <span className="inline-block rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[0.6875rem] font-medium" data-testid="order-row-status">{statusLabel(order.status)}</span>
                    {canCancel(order, account.address) && (
                      <button
                        type="button"
                        data-testid={`cancel-order-${order.id.toString()}`}
                        aria-label={`Cancel order #${order.id.toString()}`}
                        aria-expanded={selected === order.id}
                        disabled={!live || !ready || !idle}
                        onClick={() => setSelected(order.id)}
                        className="ml-2 inline-flex h-8 items-center rounded-lg px-2 text-[0.75rem] font-medium text-lilac hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 text-right max-lg:py-0 max-lg:text-left">
                    {placedTx ? (
                      <Link href={`/tx/${placedTx}`} className="font-mono text-lilac hover:text-white" title={placedTx}>
                        {shortAddress(placedTx, 8, 4)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {trades.length > 0 && (
                      <details className="mt-1 text-left lg:text-right">
                        <summary className="cursor-pointer text-[0.6875rem] text-muted-foreground hover:text-foreground">{trades.length} fill{trades.length > 1 ? "s" : ""}</summary>
                        <ul className="mt-1 space-y-0.5 text-[0.6875rem]">
                          {trades.map((t) => (
                            <li key={`${t.transactionHash}-${t.makerOrderId}-${t.takerOrderId}`} className="tabular">
                              <Amount value={t.baseAmount} visible={4} showTail={false} /> @ <Amount value={t.price} visible={4} showTail={false} />{" "}
                              <Link href={`/tx/${t.transactionHash}`} className="font-mono text-lilac hover:text-white" title={t.transactionHash}>
                                {shortAddress(t.transactionHash, 6, 4)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[0.6875rem] text-muted-foreground">
          {q.data.totalIds > MY_ORDERS_LIMIT ? `Showing your latest ${MY_ORDERS_LIMIT} of ${q.data.totalIds} orders. ` : ""}
          Fills include trades where your order was the resting (maker) order. Cancelled orders stay listed here as history; they are no longer on the book.
        </p>
      </>
    );

  return (
    <Panel id="my-orders" title="My orders" action={<span className="text-[0.6875rem] text-muted-foreground">{market}</span>}>
      {body}
      <CancelPanel state={state} flow={flow} row={selectedRow} selected={selected} onClose={() => setSelected(undefined)} />
    </Panel>
  );
}
