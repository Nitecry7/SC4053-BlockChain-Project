import { describe, expect, it } from "vitest";
import { isStopOrder, stopHints, stopState, stopStateText, validateStopInput } from "./stop-orders";
import { requiredQuote } from "./units";

const E18 = 10n ** 18n;
const dec = (s: string) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};
const LOT = 10n ** 9n;
const TICK = 10n ** 9n;
const wallet = { base: dec("1000"), quote: dec("1000") };

describe("stopState: the engine's eligibility rule", () => {
  it("a SELL stop is eligible when last <= trigger, equality included", () => {
    expect(stopState("sell", dec("1.8"), dec("1.8"), true)).toEqual({ kind: "eligible" });
    expect(stopState("sell", dec("1.8"), dec("1.7"), true)).toEqual({ kind: "eligible" });
    expect(stopState(1, dec("1.8"), dec("1.9"), true)).toEqual({ kind: "waiting", need: "fall" });
  });
  it("a BUY stop is eligible when last >= trigger, equality included", () => {
    expect(stopState("buy", dec("2.5"), dec("2.5"), true)).toEqual({ kind: "eligible" });
    expect(stopState("buy", dec("2.5"), dec("2.6"), true)).toEqual({ kind: "eligible" });
    expect(stopState(0, dec("2.5"), dec("2.4"), true)).toEqual({ kind: "waiting", need: "rise" });
  });
  it("one tick either side of the boundary flips the answer (wei exact)", () => {
    expect(stopState("sell", dec("1.8"), dec("1.8") + 1n, true).kind).toBe("waiting");
    expect(stopState("sell", dec("1.8"), dec("1.8") - 1n, true).kind).toBe("eligible");
    expect(stopState("buy", dec("2"), dec("2") - 1n, true).kind).toBe("waiting");
    expect(stopState("buy", dec("2"), dec("2") + 1n, true).kind).toBe("eligible");
  });
  it("before the first trade nothing is eligible, whatever lastTradePrice reads (it is 0)", () => {
    expect(stopState("sell", dec("1.8"), 0n, false)).toEqual({ kind: "no-trade-price" });
    expect(stopState("buy", 1n, 0n, false)).toEqual({ kind: "no-trade-price" });
  });
});

describe("stopStateText keeps 'waiting for price' and 'eligible, needs a trigger transaction' apart", () => {
  it("an eligible stop does NOT say it needs another trade, and does not say it has activated or can fill", () => {
    const t = stopStateText({ kind: "eligible" }, "sell", "1.8");
    expect(t).toMatch(/^Eligible now/);
    expect(t).toMatch(/Trigger stops transaction/);
    expect(t).toMatch(/does not need another trade/);
    expect(t).not.toMatch(/filled|executed|activated/i);
  });
  it("a waiting stop names the trade it needs, per side", () => {
    expect(stopStateText({ kind: "waiting", need: "fall" }, "sell", "1.8")).toBe("Waiting for price: it needs the last trade price to fall to or below 1.8.");
    expect(stopStateText({ kind: "waiting", need: "rise" }, "buy", "2.5")).toBe("Waiting for price: it needs the last trade price to rise to or above 2.5.");
  });
  it("before the first trade it says no stop can trigger yet", () => {
    expect(stopStateText({ kind: "no-trade-price" }, "sell", "1.8")).toMatch(/no trade has happened/);
  });
});

describe("stopHints are warnings, never errors", () => {
  const base = { limitPrice: dec("1.7"), triggerPrice: dec("1.8") };
  it("no trade yet", () => {
    expect(stopHints({ side: "sell", ...base, lastTradePrice: 0n, hasTradePrice: false }).map((h) => h.code)).toEqual(["no-trade-price"]);
  });
  it("an already-eligible stop is flagged as needing a trigger transaction, not another trade", () => {
    const h = stopHints({ side: "sell", ...base, lastTradePrice: dec("1.8"), hasTradePrice: true });
    expect(h.map((x) => x.code)).toEqual(["eligible-now"]);
    expect(h[0]!.text).toMatch(/needs a Trigger stops transaction from anyone, not another trade/);
  });
  it("the textbook example (sell, last 2, trigger 1.8, limit 1.7) has no hint at all", () => {
    expect(stopHints({ side: "sell", ...base, lastTradePrice: dec("2"), hasTradePrice: true })).toEqual([]);
  });
  it("a limit beyond the trigger is warned about, per side", () => {
    expect(stopHints({ side: "sell", triggerPrice: dec("1.8"), limitPrice: dec("1.9"), lastTradePrice: dec("2"), hasTradePrice: true }).map((h) => h.code)).toEqual(["limit-beyond-trigger"]);
    expect(stopHints({ side: "buy", triggerPrice: dec("2.5"), limitPrice: dec("2.4"), lastTradePrice: dec("2"), hasTradePrice: true }).map((h) => h.code)).toEqual(["limit-beyond-trigger"]);
  });
});

describe("validateStopInput", () => {
  const ok = { side: "sell" as const, triggerText: "1.8", priceText: "1.7", amountText: "10", lotSize: LOT, tickSize: TICK, balances: wallet };
  it("a sell stop escrows the base amount; the order is built in the engine's units with the LIMIT as price", () => {
    const r = validateStopInput(ok);
    expect(r.ok && r.order).toMatchObject({ kind: "stop", side: "sell", triggerPrice: dec("1.8"), price: dec("1.7"), amount: dec("10"), collateralToken: "base", collateral: dec("10") });
  });
  it("a buy stop escrows requiredQuote(amount, LIMIT price), never the trigger price", () => {
    const r = validateStopInput({ ...ok, side: "buy", triggerText: "2.5", priceText: "2.6", amountText: "4" });
    expect(r.ok && r.order.collateral).toBe(requiredQuote(dec("4"), dec("2.6")));
    expect(r.ok && r.order.collateral).not.toBe(requiredQuote(dec("4"), dec("2.5")));
    expect(r.ok && r.order.collateralToken).toBe("quote");
  });
  it("rounds the buy escrow UP exactly as the engine (ceiling)", () => {
    const r = validateStopInput({ ...ok, side: "buy", triggerText: "2", priceText: "0.000000001", amountText: "0.000000001" });
    expect(r.ok && r.order.collateral).toBe(requiredQuote(1_000_000_000n, 1_000_000_000n));
  });
  it("zero, empty and malformed trigger, price and amount are errors, all reported at once", () => {
    const r = validateStopInput({ ...ok, triggerText: "0", priceText: "", amountText: "0" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.trigger?.code).toBe("zero");
      expect(r.errors.price?.code).toBe("empty");
      expect(r.errors.amount?.code).toBe("zero");
    }
    const m = validateStopInput({ ...ok, triggerText: "1,8" });
    expect(!m.ok && m.errors.trigger?.code).toBe("malformed");
  });
  it("precision: more than 18 decimals, off-tick trigger and off-lot amount are refused (nothing is rounded)", () => {
    expect(!validateStopInput({ ...ok, triggerText: "1.0000000000000000001" }).ok).toBe(true);
    const t = validateStopInput({ ...ok, triggerText: "1.8000000005" });
    expect(!t.ok && t.errors.trigger?.code).toBe("not-tick-multiple");
    const a = validateStopInput({ ...ok, amountText: "10.0000000005" });
    expect(!a.ok && a.errors.amount?.code).toBe("not-lot-multiple");
  });
  it("the balance must cover the escrow, and the error says so", () => {
    const r = validateStopInput({ ...ok, balances: { base: dec("9"), quote: 0n } });
    expect(!r.ok && r.errors.balance?.code).toBe("insufficient-balance");
  });
  it("the trigger is not part of the escrow check: a huge trigger with a small limit still validates", () => {
    const r = validateStopInput({ ...ok, side: "buy", triggerText: "1000000", priceText: "1", amountText: "1" });
    expect(r.ok && r.order.collateral).toBe(dec("1"));
  });
  it("without balances (not connected) the balance check is skipped", () => {
    expect(validateStopInput({ ...ok, balances: undefined }).ok).toBe(true);
  });
});

describe("isStopOrder", () => {
  it("is triggerPrice != 0, before and after activation", () => {
    expect(isStopOrder({ triggerPrice: 1n })).toBe(true);
    expect(isStopOrder({ triggerPrice: 0n })).toBe(false);
  });
});
