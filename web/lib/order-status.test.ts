import { describe, expect, it } from "vitest";
import { collateralHeld, isOnLiveBook, orderExists, remainingBase, statusLabel, statusName, type OrderSnapshot } from "./order-status";

const E18 = 10n ** 18n;
const base: OrderSnapshot = {
  id: 1n,
  trader: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  side: 1,
  price: 2n * E18,
  triggerPrice: 0n,
  amount: 10n * E18,
  filled: 4n * E18,
  lockedQuote: 0n,
  createdAt: 1n,
  status: 1,
};

describe("order status helpers", () => {
  it("names the engine's Status enum and falls back for an unknown value", () => {
    expect([0, 1, 2, 3, 4].map(statusName)).toEqual(["Open", "PartiallyFilled", "Filled", "Cancelled", "PendingTrigger"]);
    expect(statusName(9)).toBe("Unknown");
    expect(statusLabel(0)).toBe("Resting");
    expect(statusLabel(1)).toBe("Partly filled");
    expect(statusLabel(4)).toBe("Pending trigger");
  });

  it("only Open and PartiallyFilled orders are on the live book; a pending stop order is not", () => {
    expect([0, 1, 2, 3, 4].map((status) => isOnLiveBook({ status }))).toEqual([true, true, false, false, false]);
  });

  it("remaining is amount minus filled", () => {
    expect(remainingBase(base)).toBe(6n * E18);
  });

  it("a sell's collateral is its unfilled base while resting, and nothing once filled", () => {
    expect(collateralHeld(base)).toEqual({ token: "base", amount: 6n * E18 });
    expect(collateralHeld({ ...base, filled: base.amount, status: 2 })).toEqual({ token: "base", amount: 0n });
  });

  it("a buy's collateral is its lockedQuote (the contract's own figure), not a recomputation", () => {
    expect(collateralHeld({ ...base, side: 0, lockedQuote: 13_200_000_000_000_000_000n })).toEqual({ token: "quote", amount: 13_200_000_000_000_000_000n });
  });

  it("states no collateral for a pending stop order or an unknown order", () => {
    expect(collateralHeld({ ...base, status: 4 })).toBeUndefined();
    expect(collateralHeld({ ...base, id: 0n })).toBeUndefined();
  });

  it("an all-zero order means not found", () => {
    expect(orderExists({ id: 0n })).toBe(false);
    expect(orderExists({ id: 1n })).toBe(true);
  });
});
