import { describe, expect, it } from "vitest";
import { TICKET_BOOK_DEPTH, allowanceStep, estimateExecution, type BookLevelInput } from "./order-plan";
import { quoteCost, requiredQuote } from "./units";

const E18 = 10n ** 18n;
const dec = (s: string) => {
  const [i = "0", f = ""] = s.split(".");
  return BigInt(i) * E18 + BigInt(f.padEnd(18, "0"));
};
const lvl = (id: number, price: string, remaining: string): BookLevelInput => ({ id: BigInt(id), price: dec(price), remaining: dec(remaining) });

describe("allowanceStep", () => {
  it("is unknown until read", () => expect(allowanceStep(5n, undefined)).toBe("unknown"));
  it("is sufficient when allowance >= needed (no approval requested)", () => {
    expect(allowanceStep(5n, 5n)).toBe("sufficient");
    expect(allowanceStep(5n, 6n)).toBe("sufficient");
  });
  it("requires approval when allowance < needed, including a partial allowance", () => {
    expect(allowanceStep(5n, 4n)).toBe("approval-required");
    expect(allowanceStep(5n, 0n)).toBe("approval-required");
  });
});

describe("estimateExecution (mirrors OrderBook._matchTaker/_settleFill)", () => {
  const opts = { maxMatches: 10, snapshotDepth: 10 };

  it("SPEC worked example: Bob buys 4 @ limit 2.2 against Alice's sell of 10 @ 2.0", () => {
    const e = estimateExecution({ side: "buy", price: dec("2.2"), amount: dec("4"), book: [lvl(1, "2", "10")], ...opts });
    expect(e.fills).toEqual([{ makerId: 1n, price: dec("2"), base: dec("4"), quote: dec("8") }]);
    expect(e.filledBase).toBe(dec("4"));
    expect(e.tradedQuote).toBe(dec("8")); // executes at the maker price, so Alice receives 8 SGDx
    expect(e.refundQuote).toBe(dec("0.8")); // 8.8 escrowed - 8 cost
    expect(e.remainingBase).toBe(0n);
    expect(e.lockedAfter).toBe(0n);
    expect(e.crossedRemainder).toBe(false);
  });

  it("a buy that partly fills rests the remainder with ceil(remaining * limit) still escrowed", () => {
    const e = estimateExecution({ side: "buy", price: dec("2.2"), amount: dec("10"), book: [lvl(1, "2", "4")], ...opts });
    expect(e.filledBase).toBe(dec("4"));
    expect(e.refundQuote).toBe(dec("0.8")); // 22 - 8 - 13.2
    expect(e.remainingBase).toBe(dec("6"));
    expect(e.lockedAfter).toBe(dec("13.2"));
    expect(e.lockedAfter + e.tradedQuote + e.refundQuote).toBe(requiredQuote(dec("10"), dec("2.2"))); // escrow is conserved
  });

  it("a buy that does not cross rests entirely with the full escrow", () => {
    const e = estimateExecution({ side: "buy", price: dec("1.9"), amount: dec("5"), book: [lvl(1, "2", "10")], ...opts });
    expect(e.fills).toEqual([]);
    expect(e.remainingBase).toBe(dec("5"));
    expect(e.lockedAfter).toBe(dec("9.5"));
    expect(e.refundQuote).toBe(0n);
  });

  it("a sell sweeps several bids best first at each maker's price and rests the rest as base", () => {
    const book = [lvl(1, "2", "4"), lvl(2, "1.95", "3"), lvl(3, "1.8", "5")];
    const e = estimateExecution({ side: "sell", price: dec("1.9"), amount: dec("10"), book, ...opts });
    expect(e.fills.map((f) => [f.makerId, f.base, f.quote])).toEqual([
      [1n, dec("4"), dec("8")],
      [2n, dec("3"), dec("5.85")],
    ]);
    expect(e.tradedQuote).toBe(dec("13.85"));
    expect(e.refundQuote).toBe(0n); // sellers are refunded nothing
    expect(e.remainingBase).toBe(dec("3"));
    expect(e.lockedAfter).toBe(dec("3"));
  });

  it("an exact-price match crosses (>= for buys, <= for sells)", () => {
    const buy = estimateExecution({ side: "buy", price: dec("2"), amount: dec("1"), book: [lvl(1, "2", "1")], ...opts });
    expect(buy.filledBase).toBe(dec("1"));
    expect(buy.refundQuote).toBe(0n);
    const sell = estimateExecution({ side: "sell", price: dec("2"), amount: dec("1"), book: [lvl(1, "2", "1")], ...opts });
    expect(sell.filledBase).toBe(dec("1"));
  });

  it("stops at the fill cap and flags a remainder that still crosses (the Match orders action settles it)", () => {
    const book = Array.from({ length: 12 }, (_, i) => lvl(i + 1, "2", "1"));
    const e = estimateExecution({ side: "buy", price: dec("2"), amount: dec("12"), book, maxMatches: 10, snapshotDepth: 12 });
    expect(e.fills).toHaveLength(10);
    expect(e.filledBase).toBe(dec("10"));
    expect(e.remainingBase).toBe(dec("2"));
    expect(e.crossedRemainder).toBe(true);
  });

  it("does not flag a crossed remainder when the cap is hit but the next maker no longer crosses", () => {
    const book = [...Array.from({ length: 10 }, (_, i) => lvl(i + 1, "2", "1")), lvl(11, "2.5", "1")];
    const e = estimateExecution({ side: "buy", price: dec("2"), amount: dec("12"), book, maxMatches: 10, snapshotDepth: 12 });
    expect(e.fills).toHaveLength(10);
    expect(e.crossedRemainder).toBe(false);
  });

  it("flags a too-shallow snapshot: the order could still cross, but only `snapshotDepth` makers were read", () => {
    const book = Array.from({ length: 3 }, (_, i) => lvl(i + 1, "2", "1"));
    const shallow = estimateExecution({ side: "buy", price: dec("2"), amount: dec("5"), book, maxMatches: 10, snapshotDepth: 3 });
    expect(shallow.bookSnapshotExhausted).toBe(true);
    const complete = estimateExecution({ side: "buy", price: dec("2"), amount: dec("5"), book, maxMatches: 10, snapshotDepth: 10 });
    expect(complete.bookSnapshotExhausted).toBe(false);
  });

  it("REGRESSION: the fill cap equals the snapshot depth, so the 11th maker is invisible: flag it instead of reporting 'no crossing'", () => {
    // Found by the real-chain test: 12 makers cross, the ticket read only 10 (depth == cap), crossedRemainder was false.
    const book = Array.from({ length: 10 }, (_, i) => lvl(i + 1, "2", "1"));
    const hidden = estimateExecution({ side: "buy", price: dec("2"), amount: dec("12"), book, maxMatches: 10, snapshotDepth: 10 });
    expect(hidden.fills).toHaveLength(10);
    expect(hidden.crossedRemainder).toBe(false); // it cannot be proven from this snapshot...
    expect(hidden.bookSnapshotExhausted).toBe(true); // ...so the snapshot must say it was cut short
    // With one more level read (TICKET_BOOK_DEPTH = maxMatches + 1) the crossing is visible.
    const seen = estimateExecution({ side: "buy", price: dec("2"), amount: dec("12"), book: [...book, lvl(11, "2", "1")], maxMatches: 10, snapshotDepth: TICKET_BOOK_DEPTH });
    expect(seen.crossedRemainder).toBe(true);
    expect(seen.bookSnapshotExhausted).toBe(false);
  });

  it("with lot- and tick-aligned inputs every cost is exact and escrow is exactly conserved (property check)", () => {
    // Deterministic pseudo-random walk over aligned values; refund + cost + remaining escrow must equal the escrow.
    let seed = 12345n;
    const next = (mod: bigint) => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
      return seed % mod;
    };
    for (let n = 0; n < 300; n++) {
      const lot = 10n ** 9n;
      const amount = (1n + next(2000n)) * lot * 1000n;
      const limit = (1n + next(5000n)) * 10n ** 9n * 100_000n;
      const book = Array.from({ length: 1 + Number(next(8n)) }, (_, i) => ({
        id: BigInt(i + 1),
        price: (1n + next(5000n)) * 10n ** 9n * 100_000n,
        remaining: (1n + next(500n)) * lot * 1000n,
      })).sort((a, b) => (a.price < b.price ? -1 : 1));
      const e = estimateExecution({ side: "buy", price: limit, amount, book, maxMatches: 10, snapshotDepth: 20 });
      expect(e.lockedAfter + e.tradedQuote + e.refundQuote).toBe(requiredQuote(amount, limit));
      for (const f of e.fills) expect(f.quote).toBe(requiredQuote(f.base, f.price)); // ceil == floor for aligned values
      expect(quoteCost(amount, limit)).toBe(requiredQuote(amount, limit));
    }
  });
});
