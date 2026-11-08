/**
 * Is the live book crossed, and may a `matchOrders` count be sent? Pure functions over what the market itself reports
 * (`getBestBid`, `getBestAsk`, `MAX_MATCHES_PER_TX`). This is the single definition used for the live book: it never
 * looks at trade history or at what a previous transaction "should" have produced.
 *
 * (`order-plan.ts` estimates what a NEW order would leave behind before it is placed. That is a prediction about a
 * different moment, so it stays separate.)
 */

export type BestOrder = { id: bigint; price: bigint };

export type CrossedBook =
  | { crossed: false; reason: "no-bid" | "no-ask" | "no-orders" | "spread" }
  | { crossed: true; bidId: bigint; askId: bigint; bidPrice: bigint; askPrice: bigint };

/**
 * Crossed means both heads exist (a non-zero order id: the engine reports id 0 when a side is empty) and the best bid
 * is at or above the best ask. Equal prices cross: the engine's loop only stops when `bid.price < ask.price`.
 */
export function crossedBook(bestBid: BestOrder, bestAsk: BestOrder): CrossedBook {
  const hasBid = bestBid.id !== 0n;
  const hasAsk = bestAsk.id !== 0n;
  if (!hasBid && !hasAsk) return { crossed: false, reason: "no-orders" };
  if (!hasBid) return { crossed: false, reason: "no-bid" };
  if (!hasAsk) return { crossed: false, reason: "no-ask" };
  if (bestBid.price < bestAsk.price) return { crossed: false, reason: "spread" };
  return { crossed: true, bidId: bestBid.id, askId: bestAsk.id, bidPrice: bestBid.price, askPrice: bestAsk.price };
}

export type MatchCountCheck = { ok: true; count: bigint } | { ok: false; reason: "not-a-count" | "below-one" | "above-limit" };

/** The engine reverts `InvalidMaxCount` unless `1 <= maxMatches <= MAX_MATCHES_PER_TX`; refuse that before simulating. */
export function validateMatchCount(value: bigint | number, limit: bigint): MatchCountCheck {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return { ok: false, reason: "not-a-count" };
    value = BigInt(value);
  }
  if (value < 1n) return { ok: false, reason: "below-one" };
  if (value > limit) return { ok: false, reason: "above-limit" };
  return { ok: true, count: value };
}

/**
 * The count a Match orders click sends: the engine's own per-transaction limit. A smaller number would only force more
 * transactions, and `matchOrders` stops by itself as soon as the book no longer crosses.
 */
export const matchCountToSend = (limit: bigint): bigint => limit;

export type BookSpread = { kind: "none" } | { kind: "crossed" } | { kind: "spread"; value: bigint };

/**
 * What the "spread" figures may show. A spread is best ask minus best bid, which is only defined, and only unsigned,
 * when both sides rest and the book is NOT crossed. A crossed book has no spread to state: subtracting would give a
 * negative number, which the amount formatter (rightly) refuses to draw, so the caller shows "Crossed" instead.
 */
export function bookSpread(bestBid: BestOrder, bestAsk: BestOrder): BookSpread {
  if (bestBid.id === 0n || bestAsk.id === 0n) return { kind: "none" };
  if (crossedBook(bestBid, bestAsk).crossed) return { kind: "crossed" };
  return { kind: "spread", value: bestAsk.price - bestBid.price };
}
