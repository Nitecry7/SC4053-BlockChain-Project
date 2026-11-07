import { describe, expect, it } from "vitest";
import { buildDepth, position } from "./depth";

const E18 = 10n ** 18n;

describe("buildDepth", () => {
  it("is undefined for an empty book", () => {
    expect(buildDepth([], [])).toBeUndefined();
    expect(buildDepth([{ price: E18, remaining: 0n }], [])).toBeUndefined();
  });
  it("accumulates each side from the best price outward and merges equal prices", () => {
    const d = buildDepth(
      [
        { price: 2n * E18, remaining: 3n * E18 },
        { price: 2n * E18, remaining: 1n * E18 },
        { price: 19n * 10n ** 17n, remaining: 2n * E18 },
      ],
      [{ price: 21n * 10n ** 17n, remaining: 5n * E18 }],
    )!;
    expect(d.bids).toEqual([
      { price: 2n * E18, cumulative: 4n * E18 },
      { price: 19n * 10n ** 17n, cumulative: 6n * E18 },
    ]);
    expect(d.asks).toEqual([{ price: 21n * 10n ** 17n, cumulative: 5n * E18 }]);
    expect(d.maxCumulative).toBe(6n * E18);
    expect(d.minPrice).toBe(19n * 10n ** 17n);
    expect(d.maxPrice).toBe(21n * 10n ** 17n);
  });
  it("handles a one-sided book", () => {
    const d = buildDepth([], [{ price: 2n * E18, remaining: 10n * E18 }])!;
    expect(d.bids).toEqual([]);
    expect(d.minPrice).toBe(d.maxPrice);
  });
});

describe("position", () => {
  it("maps linearly and handles an empty range", () => {
    expect(position(5n, 0n, 10n)).toBe(0.5);
    expect(position(0n, 0n, 10n)).toBe(0);
    expect(position(10n, 0n, 10n)).toBe(1);
    expect(position(7n, 7n, 7n)).toBe(0.5);
  });
});
