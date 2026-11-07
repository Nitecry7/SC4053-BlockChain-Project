import { describe, expect, it } from "vitest";
import { canCancel, collateralHeld, expectedRefund, isCancellableStatus, isOnLiveBook, orderExists, remainingBase, statusLabel, statusName, type OrderSnapshot } from "./order-status";

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

  // P2-8B.2: this test used to say a pending stop order has no statable collateral, written while the engine's stop
  // functions were stubs. The engine now escrows a stop at placement (ENGINE_HANDOFF Part 2), so a pending sell stop
  // holds its unfilled base and a pending buy stop holds its lockedQuote. An unknown order still states none.
  it("a pending sell stop holds its whole unfilled base; an unknown order states no collateral", () => {
    expect(collateralHeld({ ...base, status: 4, filled: 0n })).toEqual({ token: "base", amount: 10n * E18 });
    expect(collateralHeld({ ...base, id: 0n })).toBeUndefined();
  });

  it("a pending buy stop holds its lockedQuote", () => {
    expect(collateralHeld({ ...base, side: 0, status: 4, filled: 0n, lockedQuote: 25n * E18 / 10n })).toEqual({ token: "quote", amount: 25n * E18 / 10n });
  });

  it("a cancelled sell holds nothing; a cancelled buy's lockedQuote is zero", () => {
    expect(collateralHeld({ ...base, status: 3 })).toEqual({ token: "base", amount: 0n });
    expect(collateralHeld({ ...base, side: 0, status: 3, lockedQuote: 0n })).toEqual({ token: "quote", amount: 0n });
  });

  it("an all-zero order means not found", () => {
    expect(orderExists({ id: 0n })).toBe(false);
    expect(orderExists({ id: 1n })).toBe(true);
  });
});

describe("cancellation helpers (P2-8B.2)", () => {
  const me = base.trader;
  it("Open, PartiallyFilled and PendingTrigger can be cancelled; Filled and Cancelled cannot", () => {
    expect([0, 1, 2, 3, 4].map(isCancellableStatus)).toEqual([true, true, false, false, true]);
  });

  it("only the order's own trader can cancel it (address case does not matter)", () => {
    expect(canCancel(base, me)).toBe(true);
    expect(canCancel(base, me.toLowerCase())).toBe(true);
    expect(canCancel(base, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")).toBe(false);
    expect(canCancel(base, undefined)).toBe(false);
    expect(canCancel({ ...base, id: 0n }, me)).toBe(false);
    expect(canCancel({ ...base, status: 2 }, me)).toBe(false);
    expect(canCancel({ ...base, status: 3 }, me)).toBe(false);
    expect(canCancel({ ...base, status: 4 }, me)).toBe(true);
  });

  it("a sell's refund is amount minus filled, in base", () => {
    expect(expectedRefund(base)).toEqual({ token: "base", amount: 6n * E18 });
    expect(expectedRefund({ ...base, filled: 0n, status: 0 })).toEqual({ token: "base", amount: 10n * E18 });
  });

  it("a buy's refund is its lockedQuote, in quote (the contract's own figure, not a recomputation)", () => {
    expect(expectedRefund({ ...base, side: 0, lockedQuote: 13_200_000_000_000_000_000n })).toEqual({ token: "quote", amount: 13_200_000_000_000_000_000n });
  });

  it("a pending stop refunds its full escrow", () => {
    expect(expectedRefund({ ...base, status: 4, filled: 0n })).toEqual({ token: "base", amount: 10n * E18 });
    expect(expectedRefund({ ...base, side: 0, status: 4, lockedQuote: 3n * E18 })).toEqual({ token: "quote", amount: 3n * E18 });
  });

  it("there is no refund for a filled, cancelled or unknown order", () => {
    expect(expectedRefund({ ...base, status: 2 })).toBeUndefined();
    expect(expectedRefund({ ...base, status: 3 })).toBeUndefined();
    expect(expectedRefund({ ...base, id: 0n })).toBeUndefined();
  });
});
