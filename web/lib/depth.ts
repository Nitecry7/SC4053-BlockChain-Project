export type Level = { price: bigint; remaining: bigint };
export type DepthPoint = { price: bigint; cumulative: bigint };
export type Depth = { bids: DepthPoint[]; asks: DepthPoint[]; maxCumulative: bigint; minPrice: bigint; maxPrice: bigint };

/**
 * Cumulative depth from book levels, best price first on each side (as `getBook` returns them). Bids accumulate
 * downward in price, asks upward. Equal prices merge. Returns undefined when both sides are empty.
 */
export function buildDepth(bids: readonly Level[], asks: readonly Level[]): Depth | undefined {
  const accumulate = (levels: readonly Level[]) => {
    const out: DepthPoint[] = [];
    let total = 0n;
    for (const level of levels) {
      if (level.remaining <= 0n) continue;
      total += level.remaining;
      const last = out[out.length - 1];
      if (last && last.price === level.price) last.cumulative = total;
      else out.push({ price: level.price, cumulative: total });
    }
    return out;
  };
  const b = accumulate(bids);
  const a = accumulate(asks);
  if (b.length === 0 && a.length === 0) return undefined;
  const prices = [...b, ...a].map((p) => p.price);
  const max = (xs: bigint[]) => xs.reduce((m, x) => (x > m ? x : m));
  const min = (xs: bigint[]) => xs.reduce((m, x) => (x < m ? x : m));
  return {
    bids: b,
    asks: a,
    maxCumulative: max([...b, ...a].map((p) => p.cumulative)),
    minPrice: min(prices),
    maxPrice: max(prices),
  };
}

/** Linear position of `value` in [lo, hi] as a float in [0, 1]; the midpoint when the range is empty. */
export function position(value: bigint, lo: bigint, hi: bigint): number {
  if (hi <= lo) return 0.5;
  const scaled = ((value - lo) * 1_000_000n) / (hi - lo);
  return Number(scaled) / 1_000_000;
}
