import type { Address } from "viem";

/** `Status` enum of the engine (CONTRACT_INTERFACE.md): Open, PartiallyFilled, Filled, Cancelled, PendingTrigger. */
export const ORDER_STATUS_NAMES = ["Open", "PartiallyFilled", "Filled", "Cancelled", "PendingTrigger"] as const;
export type OrderStatusName = (typeof ORDER_STATUS_NAMES)[number];

/** An order exactly as `getOrder` returns it (an all-zero order means "not found"). */
export type OrderSnapshot = {
  id: bigint;
  trader: Address;
  /** 0 = Buy, 1 = Sell. */
  side: number;
  price: bigint;
  triggerPrice: bigint;
  amount: bigint;
  filled: bigint;
  lockedQuote: bigint;
  createdAt: bigint;
  status: number;
};

export function statusName(status: number): OrderStatusName | "Unknown" {
  return ORDER_STATUS_NAMES[status] ?? "Unknown";
}

const LABELS: Record<OrderStatusName | "Unknown", string> = {
  Open: "Resting",
  PartiallyFilled: "Partially Filled",
  Filled: "Filled",
  Cancelled: "Cancelled",
  PendingTrigger: "Pending Trigger",
  Unknown: "Unknown",
};

/**
 * Plain wording for the UI, in Title Case because these are badge labels. "Resting" (the engine's `Open`) means the order sits on
 * the live book; a pending stop order does not. Sentences that embed a status lower-case it (`statusLabel(s).toLowerCase()`).
 */
export const statusLabel = (status: number): string => LABELS[statusName(status)];

/** Is the order on the live book (matchable by others)? A pending stop-limit order is not. */
export const isOnLiveBook = (o: Pick<OrderSnapshot, "status">): boolean => o.status === 0 || o.status === 1;

export const remainingBase = (o: Pick<OrderSnapshot, "amount" | "filled">): bigint => o.amount - o.filled;

/**
 * Collateral the order book still holds for this order. Buy: `lockedQuote` (quote token). Sell: the unfilled base
 * while the order is on the book or waiting as a pending stop (a stop escrows its collateral at placement, so a
 * pending sell stop holds `amount - filled` base). Nothing for a filled or cancelled sell.
 */
export function collateralHeld(o: OrderSnapshot): { token: "base" | "quote"; amount: bigint } | undefined {
  if (o.id === 0n) return undefined;
  if (o.side === 0) return { token: "quote", amount: o.lockedQuote };
  return { token: "base", amount: isOnLiveBook(o) || o.status === 4 ? remainingBase(o) : 0n };
}

/** Statuses `cancelOrder` accepts: Open, PartiallyFilled and PendingTrigger. Filled and Cancelled revert `OrderNotActive`. */
export const isCancellableStatus = (status: number): boolean => status === 0 || status === 1 || status === 4;

/** Only the order's own trader can cancel it (the engine reverts `NotOrderOwner` otherwise). */
export function canCancel(o: Pick<OrderSnapshot, "id" | "trader" | "status">, account: string | undefined): boolean {
  return o.id !== 0n && account !== undefined && o.trader.toLowerCase() === account.toLowerCase() && isCancellableStatus(o.status);
}

/**
 * What `cancelOrder` refunds, from the order as `getOrder` reports it (SPEC A7, ENGINE_HANDOFF): a sell gets
 * `amount - filled` in base tokens, a buy gets its remaining `lockedQuote` in quote tokens. `undefined` when the order
 * cannot be cancelled. This is an expectation shown before the transaction; the refund that counts is the one the
 * `OrderCancelled` event reports.
 */
export function expectedRefund(o: OrderSnapshot): { token: "base" | "quote"; amount: bigint } | undefined {
  if (o.id === 0n || !isCancellableStatus(o.status)) return undefined;
  return o.side === 0 ? { token: "quote", amount: o.lockedQuote } : { token: "base", amount: remainingBase(o) };
}

/** `getOrder` returns an all-zero order for an unknown id; the front end treats `id == 0` as "not found". */
export const orderExists = (o: Pick<OrderSnapshot, "id">): boolean => o.id !== 0n;

/** The semantic colour family of a status badge. Every badge also carries its text and an icon, so colour is never the only cue. */
export type StatusTone = "pending" | "resting" | "partial" | "filled" | "cancelled" | "unknown";

const TONES: Record<OrderStatusName | "Unknown", StatusTone> = {
  Open: "resting",
  PartiallyFilled: "partial",
  Filled: "filled",
  Cancelled: "cancelled",
  PendingTrigger: "pending",
  Unknown: "unknown",
};

/** Pending Trigger amber, Resting azure, Partially Filled violet, Filled green, Cancelled grey. A failed transaction is red (see `OrderStatusBadge`). */
export const statusTone = (status: number): StatusTone => TONES[statusName(status)];
