import { quoteCost, requiredQuote } from "./units";
import type { Side } from "./order-input";

/**
 * How many orders of the opposite side the ticket reads. It must exceed the engine's per-transaction fill cap
 * (`MAX_MATCHES_PER_TX`, 10 today) by at least one, or the estimator can never see the maker that would still cross
 * after the cap. If the cap is ever raised, `bookSnapshotExhausted` reports that the snapshot was cut short.
 */
export const TICKET_BOOK_DEPTH = 11;

export type AllowanceStep = "unknown" | "sufficient" | "approval-required";

/**
 * Does the order book already have enough allowance? Only the exact collateral is ever requested: buy escrow
 * (`requiredQuote`) in the quote token, or the sell amount in the base token. `undefined` means "not read yet".
 */
export function allowanceStep(needed: bigint, allowance: bigint | undefined): AllowanceStep {
  if (allowance === undefined) return "unknown";
  return allowance >= needed ? "sufficient" : "approval-required";
}

/** One live book order on the opposite side, best first, as returned by `getBook` (remaining = amount - filled). */
export type BookLevelInput = { id: bigint; price: bigint; remaining: bigint };

export type EstimatedFill = { makerId: bigint; price: bigint; base: bigint; quote: bigint };

export type ExecutionEstimate = {
  fills: EstimatedFill[];
  /** Base token the taker buys (buy) or sells (sell) in this transaction. */
  filledBase: bigint;
  /** Quote exchanged at the makers' prices: floor(qty * makerPrice / PRICE_SCALE), summed per fill. */
  tradedQuote: bigint;
  /** Buy only: quote returned to the taker for price improvement and rounding during matching. */
  refundQuote: bigint;
  /** Base not filled; it rests on the book at the limit price. */
  remainingBase: bigint;
  /** Collateral still escrowed for the resting remainder: buy = ceil(remaining * limit), sell = remaining base. */
  lockedAfter: bigint;
  /** The fill cap was hit while the next maker still crosses: the remainder rests crossed (matchOrders is a stub). */
  crossedRemainder: boolean;
  /** The snapshot ended while the order could still cross: the book may hold more makers than were read. */
  bookSnapshotExhausted: boolean;
};

/**
 * Mirrors `OrderBook._matchTaker` / `_settleFill` against a snapshot of the opposite side, so the ticket can preview
 * the result. It is an estimate: the chain decides, using the book as it is when the transaction is mined.
 */
export function estimateExecution(input: {
  side: Side;
  price: bigint;
  amount: bigint;
  book: readonly BookLevelInput[];
  maxMatches: number;
  /** How many orders the snapshot asked for; used to tell "book is empty" from "snapshot too shallow". */
  snapshotDepth: number;
}): ExecutionEstimate {
  const { side, price, amount, book, maxMatches, snapshotDepth } = input;
  const fills: EstimatedFill[] = [];
  let filled = 0n;
  let tradedQuote = 0n;
  let refund = 0n;
  let locked = side === "buy" ? requiredQuote(amount, price) : 0n;
  let i = 0;
  let crossedRemainder = false;

  const crosses = (maker: BookLevelInput) => (side === "buy" ? price >= maker.price : price <= maker.price);

  for (; i < maxMatches && filled < amount; i++) {
    const maker = book[i];
    if (!maker || !crosses(maker)) break;
    const qty = amount - filled < maker.remaining ? amount - filled : maker.remaining;
    const cost = quoteCost(qty, maker.price);
    filled += qty;
    tradedQuote += cost;
    if (side === "buy") {
      const newLocked = requiredQuote(amount - filled, price);
      refund += locked - cost - newLocked;
      locked = newLocked;
    }
    fills.push({ makerId: maker.id, price: maker.price, base: qty, quote: cost });
  }

  const remainingBase = amount - filled;
  const nextMaker = book[i];
  if (remainingBase > 0n && i === maxMatches && nextMaker && crosses(nextMaker)) crossedRemainder = true;
  // The snapshot ended while the order still had base left and the snapshot was full: more makers may exist beyond it,
  // whether or not the fill cap was reached. (When the next maker is visible, `crossedRemainder` already says so.)
  const bookSnapshotExhausted = remainingBase > 0n && i >= book.length && book.length >= snapshotDepth;

  return {
    fills,
    filledBase: filled,
    tradedQuote,
    refundQuote: refund,
    remainingBase,
    lockedAfter: side === "buy" ? locked : remainingBase,
    crossedRemainder,
    bookSnapshotExhausted,
  };
}
