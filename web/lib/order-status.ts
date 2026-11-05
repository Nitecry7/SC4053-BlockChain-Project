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
  PartiallyFilled: "Partly filled",
  Filled: "Filled",
  Cancelled: "Cancelled",
  PendingTrigger: "Pending trigger",
  Unknown: "Unknown",
};

/** Plain wording for the UI. "Resting" means it sits on the live book; a pending stop order does not. */
export const statusLabel = (status: number): string => LABELS[statusName(status)];

/** Is the order on the live book (matchable by others)? A pending stop-limit order is not. */
export const isOnLiveBook = (o: Pick<OrderSnapshot, "status">): boolean => o.status === 0 || o.status === 1;

export const remainingBase = (o: Pick<OrderSnapshot, "amount" | "filled">): bigint => o.amount - o.filled;

/**
 * Collateral the order book still holds for this order. Buy: `lockedQuote` (quote token). Sell: the unfilled base
 * while the order is on the book. `undefined` when it cannot be stated (a pending stop order).
 */
export function collateralHeld(o: OrderSnapshot): { token: "base" | "quote"; amount: bigint } | undefined {
  if (o.id === 0n) return undefined;
  if (o.side === 0) return { token: "quote", amount: o.lockedQuote };
  if (o.status === 4) return undefined;
  return { token: "base", amount: isOnLiveBook(o) ? remainingBase(o) : 0n };
}

/** `getOrder` returns an all-zero order for an unknown id; the front end treats `id == 0` as "not found". */
export const orderExists = (o: Pick<OrderSnapshot, "id">): boolean => o.id !== 0n;
