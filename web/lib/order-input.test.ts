import { describe, expect, it } from "vitest";
import { maxUint256 } from "viem";
import { validateOrderInput, type OrderInput } from "./order-input";

const E18 = 10n ** 18n;
const LOT = 10n ** 9n;
const TICK = 10n ** 9n;

const base = (over: Partial<OrderInput> = {}): OrderInput => ({
  side: "buy",
  priceText: "2.2",
  amountText: "4",
  lotSize: LOT,
  tickSize: TICK,
  balances: { base: 10_000n * E18, quote: 10_000n * E18 },
  ...over,
});

describe("validateOrderInput", () => {
  it("accepts the SPEC worked example buy and escrows ceil(4 * 2.2) = 8.8 quote", () => {
    const r = validateOrderInput(base());
    expect(r).toEqual({
      ok: true,
      order: { side: "buy", price: 22n * 10n ** 17n, amount: 4n * E18, collateralToken: "quote", collateral: 88n * 10n ** 17n },
    });
  });

  it("escrows the base amount for a sell", () => {
    const r = validateOrderInput(base({ side: "sell", priceText: "2", amountText: "10" }));
    expect(r).toEqual({
      ok: true,
      order: { side: "sell", price: 2n * E18, amount: 10n * E18, collateralToken: "base", collateral: 10n * E18 },
    });
  });

  it.each([
    ["", "empty"],
    ["abc", "malformed"],
    ["-1", "malformed"],
    ["1e3", "malformed"],
    ["1,5", "malformed"],
    [" 1", "malformed"],
    [".5", "malformed"],
    ["1.1234567890123456789", "too-many-decimals"],
  ])("rejects price text %j as %s", (text, code) => {
    const r = validateOrderInput(base({ priceText: text }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.price?.code).toBe(code);
  });

  it("rejects zero price and zero amount", () => {
    const r = validateOrderInput(base({ priceText: "0", amountText: "0" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.price?.code).toBe("zero");
      expect(r.errors.amount?.code).toBe("zero");
    }
  });

  it("rejects a price that is not a tick multiple and an amount that is not a lot multiple", () => {
    // 1e-10 has 10 decimals: representable in 18 decimals but not a multiple of 1e9 base units.
    const r = validateOrderInput(base({ priceText: "0.0000000001", amountText: "0.0000000001" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.price?.code).toBe("not-tick-multiple");
      expect(r.errors.amount?.code).toBe("not-lot-multiple");
    }
  });

  it("accepts exactly one lot and one tick", () => {
    const r = validateOrderInput(base({ priceText: "0.000000001", amountText: "0.000000001" }));
    expect(r.ok).toBe(true);
  });

  it("reads lot and tick from the contract values, not constants", () => {
    const r = validateOrderInput(base({ lotSize: 10n ** 12n, amountText: "0.000000001" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.amount?.code).toBe("not-lot-multiple");
  });

  it("rejects an amount above uint256", () => {
    const huge = (maxUint256 / E18 + 1n).toString();
    const r = validateOrderInput(base({ amountText: huge, side: "sell" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.amount?.code).toBe("too-large");
  });

  it("rejects amount times price that overflows uint256 even when each fits (the contract's mulDiv would revert)", () => {
    const amount = (maxUint256 / E18).toString(); // fits
    const r = validateOrderInput(base({ amountText: amount, priceText: "1000000000000", side: "buy" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.amount?.code).toBe("too-large");
  });

  it("flags insufficient wallet balance of the collateral token only", () => {
    // Needs 8.8 quote; has 8.7 quote but plenty of base: still insufficient for a buy.
    const buy = validateOrderInput(base({ balances: { base: 1000n * E18, quote: 87n * 10n ** 17n } }));
    expect(buy.ok).toBe(false);
    if (!buy.ok) expect(buy.errors.balance?.code).toBe("insufficient-balance");
    // A sell of 10 base needs base, not quote.
    const sell = validateOrderInput(base({ side: "sell", priceText: "2", amountText: "10", balances: { base: 9n * E18, quote: 0n } }));
    expect(sell.ok).toBe(false);
    if (!sell.ok) expect(sell.errors.balance?.code).toBe("insufficient-balance");
  });

  it("accepts a balance exactly equal to the collateral", () => {
    const r = validateOrderInput(base({ balances: { base: 0n, quote: 88n * 10n ** 17n } }));
    expect(r.ok).toBe(true);
  });

  it("skips the balance check when balances are unknown (not connected)", () => {
    const r = validateOrderInput(base({ balances: undefined }));
    expect(r.ok).toBe(true);
  });

  it("reports price and amount problems together", () => {
    const r = validateOrderInput(base({ priceText: "x", amountText: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.price?.code).toBe("malformed");
      expect(r.errors.amount?.code).toBe("empty");
    }
  });
});
