import { describe, expect, it } from "vitest";
import { bookSpread, crossedBook, matchCountToSend, validateMatchCount } from "./crossed-book";

const E18 = 10n ** 18n;
const o = (id: bigint, price: string) => ({ id, price: BigInt(Math.round(Number(price) * 1e9)) * 10n ** 9n });

describe("crossedBook", () => {
  it("is crossed when the best bid is above the best ask", () => {
    const r = crossedBook(o(5n, "3"), o(2n, "2"));
    expect(r).toEqual({ crossed: true, bidId: 5n, askId: 2n, bidPrice: 3n * E18, askPrice: 2n * E18 });
  });
  it("is crossed at EQUAL prices (the engine only stops when bid < ask)", () => {
    expect(crossedBook(o(5n, "2"), o(2n, "2")).crossed).toBe(true);
  });
  it("is not crossed when there is a spread", () => {
    expect(crossedBook(o(5n, "1.9"), o(2n, "2"))).toEqual({ crossed: false, reason: "spread" });
  });
  it("is not crossed when a side is empty (id 0), whatever the price field says", () => {
    expect(crossedBook({ id: 0n, price: 0n }, o(2n, "2"))).toEqual({ crossed: false, reason: "no-bid" });
    expect(crossedBook(o(5n, "3"), { id: 0n, price: 0n })).toEqual({ crossed: false, reason: "no-ask" });
    // an empty ask side reports price 0: that must not read as "bid >= ask"
    expect(crossedBook(o(5n, "3"), { id: 0n, price: 0n }).crossed).toBe(false);
  });
  it("an empty book is not crossed", () => {
    expect(crossedBook({ id: 0n, price: 0n }, { id: 0n, price: 0n })).toEqual({ crossed: false, reason: "no-orders" });
  });
});

describe("validateMatchCount", () => {
  it("accepts 1 up to the engine limit", () => {
    expect(validateMatchCount(1, 10n)).toEqual({ ok: true, count: 1n });
    expect(validateMatchCount(10n, 10n)).toEqual({ ok: true, count: 10n });
  });
  it("rejects zero, negative, above the limit and non-integers (the engine would revert InvalidMaxCount)", () => {
    expect(validateMatchCount(0, 10n)).toEqual({ ok: false, reason: "below-one" });
    expect(validateMatchCount(-3n, 10n)).toEqual({ ok: false, reason: "below-one" });
    expect(validateMatchCount(11, 10n)).toEqual({ ok: false, reason: "above-limit" });
    expect(validateMatchCount(1.5, 10n)).toEqual({ ok: false, reason: "not-a-count" });
    expect(validateMatchCount(Number.NaN, 10n)).toEqual({ ok: false, reason: "not-a-count" });
  });
  it("follows the limit the market reports, not a constant", () => {
    expect(validateMatchCount(11, 20n).ok).toBe(true);
    expect(validateMatchCount(6, 5n)).toEqual({ ok: false, reason: "above-limit" });
  });
});

describe("matchCountToSend", () => {
  it("is the market's own limit, which validateMatchCount accepts", () => {
    expect(matchCountToSend(10n)).toBe(10n);
    expect(validateMatchCount(matchCountToSend(10n), 10n).ok).toBe(true);
  });
});

describe("bookSpread: a crossed book has no spread (it would be negative, and the page used to crash on it)", () => {
  it("is best ask minus best bid for an uncrossed book", () => {
    expect(bookSpread(o(5n, "1.9"), o(2n, "2"))).toEqual({ kind: "spread", value: 100_000_000_000_000_000n });
  });
  it("is 'crossed' (never a negative number) when the best bid is above the best ask", () => {
    expect(bookSpread(o(5n, "3"), o(2n, "2"))).toEqual({ kind: "crossed" });
  });
  it("is 'crossed' at equal prices too, matching the engine", () => {
    expect(bookSpread(o(5n, "2"), o(2n, "2"))).toEqual({ kind: "crossed" });
  });
  it("is 'none' when a side is empty", () => {
    expect(bookSpread({ id: 0n, price: 0n }, o(2n, "2"))).toEqual({ kind: "none" });
    expect(bookSpread(o(5n, "3"), { id: 0n, price: 0n })).toEqual({ kind: "none" });
  });
});
