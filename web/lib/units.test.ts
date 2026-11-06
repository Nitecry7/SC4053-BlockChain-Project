import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import {
  AmountInputError,
  PRICE_SCALE,
  formatExact,
  formatTokenAmount,
  groupThousands,
  isLotAligned,
  isTickAligned,
  parsePrice,
  parseTokenAmount,
  quoteCost,
  requiredQuote,
  splitAmount,
} from "./units";

const E18 = 10n ** 18n;
const LOT = 10n ** 9n;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof AmountInputError) return error.code;
    throw error;
  }
  return undefined;
}

describe("parseTokenAmount", () => {
  it.each([
    ["0", 0n],
    ["1", E18],
    ["10", 10n * E18],
    ["2.5", 25n * 10n ** 17n],
    ["0.000000001", LOT],
    ["0.000000000000000001", 1n],
    ["1000000", 1_000_000n * E18],
    ["007.50", 75n * 10n ** 17n],
  ])("parses %s exactly", (input, expected) => {
    expect(parseTokenAmount(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    [" 1", "malformed"],
    ["1 ", "malformed"],
    ["-1", "malformed"],
    ["+1", "malformed"],
    ["1e18", "malformed"],
    ["1,000", "malformed"],
    ["1_000", "malformed"],
    [".", "malformed"],
    [".5", "malformed"],
    ["5.", "malformed"],
    ["1.2.3", "malformed"],
    ["0x10", "malformed"],
    ["abc", "malformed"],
    ["١٢", "malformed"], // non-ASCII digits
    ["0.0000000000000000001", "too-many-decimals"], // 19 decimals
  ])("rejects %j as %s", (input, code) => {
    expect(codeOf(() => parseTokenAmount(input))).toBe(code);
  });

  it("respects a smaller decimals argument", () => {
    expect(parseTokenAmount("1.5", 6)).toBe(1_500_000n);
    expect(codeOf(() => parseTokenAmount("1.0000001", 6))).toBe("too-many-decimals");
  });

  it("rejects values above uint256", () => {
    const tooBig = (maxUint256 + 1n).toString(); // as a whole-unit integer with decimals 0
    expect(codeOf(() => parseTokenAmount(tooBig, 0))).toBe("too-large");
    expect(parseTokenAmount(maxUint256.toString(), 0)).toBe(maxUint256);
  });

  it("parsePrice uses the 1e18 price scale", () => {
    expect(parsePrice("2.2")).toBe(22n * 10n ** 17n);
    expect(parsePrice("1")).toBe(PRICE_SCALE);
  });
});

describe("display helpers", () => {
  it("splits without rounding and dims the tail", () => {
    expect(splitAmount(1_000_000n * E18)).toEqual({ integer: "1,000,000", fraction: "0000", tail: "00000000000000" });
    expect(splitAmount(LOT)).toEqual({ integer: "0", fraction: "0000", tail: "00001000000000" }); // 0.000000001
    expect(splitAmount(99_999n * 10n ** 13n)).toEqual({ integer: "0", fraction: "9999", tail: "90000000000000" });
    expect(splitAmount(1n)).toEqual({ integer: "0", fraction: "0000", tail: "00000000000001" });
  });

  it("formatTokenAmount truncates, never rounds up", () => {
    expect(formatTokenAmount(99_999n * 10n ** 13n)).toBe("0.9999"); // 0.99999 would round to 1.0000
    expect(formatTokenAmount(9_990n * E18)).toBe("9,990.0000");
    expect(formatTokenAmount(25n * 10n ** 17n, 18, 2)).toBe("2.50");
    expect(formatTokenAmount(7n * E18, 18, 0)).toBe("7");
  });

  it("formatExact is lossless", () => {
    expect(formatExact(LOT)).toBe("0.000000001");
    expect(formatExact(10_000n * E18)).toBe("10000");
  });

  it("groups thousands", () => {
    expect(groupThousands("0")).toBe("0");
    expect(groupThousands("999")).toBe("999");
    expect(groupThousands("1000")).toBe("1,000");
    expect(groupThousands("1234567890")).toBe("1,234,567,890");
  });

  it("refuses negative values", () => {
    expect(() => splitAmount(-1n)).toThrow(RangeError);
  });
});

describe("engine mirrors", () => {
  it("SPEC section 3: 4 NTU at limit 2.2 escrows 8.8 SGDx, and the fill at 2.0 costs 8", () => {
    expect(requiredQuote(4n * E18, 22n * 10n ** 17n)).toBe(88n * 10n ** 17n);
    expect(quoteCost(4n * E18, 2n * E18)).toBe(8n * E18);
  });

  it("requiredQuote rounds up and quoteCost rounds down for unaligned inputs", () => {
    expect(requiredQuote(1n, 1n)).toBe(1n);
    expect(quoteCost(1n, 1n)).toBe(0n);
    expect(requiredQuote(3n, PRICE_SCALE / 2n)).toBe(2n); // 1.5 -> 2
    expect(quoteCost(3n, PRICE_SCALE / 2n)).toBe(1n);
    expect(requiredQuote(0n, 5n * E18)).toBe(0n);
  });

  it("rejects what the contract would revert on: inputs or results beyond uint256", () => {
    expect(() => quoteCost(2n ** 255n, 2n ** 255n)).toThrow(/exceeds uint256/);
    expect(() => requiredQuote(maxUint256, maxUint256)).toThrow(/exceeds uint256/);
    expect(() => quoteCost(maxUint256 + 1n, 1n)).toThrow(/uint256 values/);
    expect(() => requiredQuote(-1n, 1n)).toThrow(/uint256 values/);
    // Largest product that still fits after the division: exact, no throw.
    expect(quoteCost(maxUint256, PRICE_SCALE)).toBe(maxUint256);
  });

  it("rounds a large non-aligned product correctly", () => {
    const amount = 10n ** 30n + 7n;
    const price = 3n * 10n ** 17n + 1n;
    const product = amount * price;
    expect(quoteCost(amount, price)).toBe(product / PRICE_SCALE);
    expect(requiredQuote(amount, price)).toBe(product / PRICE_SCALE + 1n);
  });

  it("lot- and tick-aligned inputs always give an exact cost (SPEC A1)", () => {
    let seed = 0x5eedn;
    const next = () => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
      return seed;
    };
    for (let i = 0; i < 500; i++) {
      const amount = (next() % 10n ** 12n) * LOT;
      const price = (next() % 10n ** 12n) * LOT;
      expect(requiredQuote(amount, price)).toBe(quoteCost(amount, price));
      expect((amount * price) % PRICE_SCALE).toBe(0n);
    }
  });

  it("lot and tick checks match the engine rule and reject a zero step", () => {
    expect(isLotAligned(LOT, LOT)).toBe(true);
    expect(isLotAligned(LOT + 1n, LOT)).toBe(false);
    expect(isLotAligned(0n, LOT)).toBe(true); // zero is rejected separately by the engine (ZeroAmount)
    expect(isTickAligned(22n * 10n ** 17n, LOT)).toBe(true);
    expect(isTickAligned(1n, LOT)).toBe(false);
    expect(isLotAligned(LOT, 0n)).toBe(false);
  });

  it("parse and format round-trip exactly (seeded)", () => {
    let seed = 42n;
    for (let i = 0; i < 500; i++) {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
      const value = seed * (i % 2 === 0 ? 1n : 12_345_678_901n);
      expect(parseTokenAmount(formatExact(value))).toBe(value);
    }
  });
});
