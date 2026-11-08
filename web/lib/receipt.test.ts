import { describe, expect, it } from "vitest";
import {
  ALICE, BOB, EVIL, MARKET, NTU, SGDX, approval, dec, orderCancelled, orderPlaced, resetLogIndex, specExampleLogs, trade, transfer,
} from "./test-logs";
import { decodeCancelReceipt, decodeMatchReceipt, decodeOrderReceipt, decodeTxEvents, reconcileOrder } from "./receipt";

// The logs are SYNTHETIC (built with viem's event encoders in test-logs.ts, not captured from a chain). The
// chain-backed equivalents are in trading.integration.test.ts, run against a scratch Anvil.

const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };

describe("decodeOrderReceipt: SPEC worked example", () => {
  it("reads the order id, the fill at the maker price, the refund and the escrow", () => {
    const r = decodeOrderReceipt({ logs: specExampleLogs(), ...pair, user: BOB });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const x = r.receipt;
    expect(x.orderId).toBe(2n);
    expect(x.side).toBe("buy");
    expect(x.trades).toHaveLength(1);
    expect(x.trades[0]).toMatchObject({ makerOrderId: 1n, takerOrderId: 2n, price: dec("2"), baseAmount: dec("4"), quoteAmount: dec("8") });
    expect(x.filledBase).toBe(dec("4"));
    expect(x.tradedQuote).toBe(dec("8"));
    expect(x.escrowPulled).toBe(dec("8.8"));
    expect(x.refundQuote).toBe(dec("0.8"));
    expect(x.baseReceived).toBe(dec("4"));
    expect(x.selfTrade).toBe(false);
  });

  it("reconciles with the order as read from the chain: fully filled, nothing locked", () => {
    const r = decodeOrderReceipt({ logs: specExampleLogs(), ...pair, user: BOB });
    if (!r.ok) throw new Error("decode failed");
    expect(reconcileOrder(r.receipt, { id: 2n, amount: dec("4"), filled: dec("4"), lockedQuote: 0n })).toEqual([]);
  });

  it("reports an accounting mismatch instead of hiding it", () => {
    const r = decodeOrderReceipt({ logs: specExampleLogs(), ...pair, user: BOB });
    if (!r.ok) throw new Error("decode failed");
    // The chain says 1 SGDx is still locked: 8.8 != 8 + 0.8 + 1.
    const problems = reconcileOrder(r.receipt, { id: 2n, amount: dec("4"), filled: dec("4"), lockedQuote: dec("1") });
    expect(problems.join(" ")).toMatch(/Escrow does not equal/);
  });

  it("Alice's side: a sell of 10 that rests (no fills) escrows the base and is reconciled", () => {
    resetLogIndex();
    const logs = [transfer(NTU, ALICE, MARKET, dec("10")), orderPlaced(MARKET, 1n, ALICE, 1, dec("2"), dec("10"))];
    const r = decodeOrderReceipt({ logs, ...pair, user: ALICE });
    if (!r.ok) throw new Error("decode failed");
    expect(r.receipt.side).toBe("sell");
    expect(r.receipt.escrowPulled).toBe(dec("10"));
    expect(r.receipt.trades).toEqual([]);
    expect(reconcileOrder(r.receipt, { id: 1n, amount: dec("10"), filled: 0n, lockedQuote: 0n })).toEqual([]);
  });

  it("a buy that partly fills reconciles with its locked remainder: 22 escrowed = 8 traded + 0.8 refund + 13.2 locked", () => {
    resetLogIndex();
    const logs = [
      transfer(SGDX, BOB, MARKET, dec("22")),
      orderPlaced(MARKET, 5n, BOB, 0, dec("2.2"), dec("10")),
      trade(MARKET, 1n, 5n, ALICE, BOB, dec("2"), dec("4"), dec("8")),
      transfer(NTU, MARKET, BOB, dec("4")),
      transfer(SGDX, MARKET, ALICE, dec("8")),
      transfer(SGDX, MARKET, BOB, dec("0.8")),
    ];
    const r = decodeOrderReceipt({ logs, ...pair, user: BOB });
    if (!r.ok) throw new Error("decode failed");
    expect(reconcileOrder(r.receipt, { id: 5n, amount: dec("10"), filled: dec("4"), lockedQuote: dec("13.2") })).toEqual([]);
  });
});

describe("decodeOrderReceipt: multiple makers, self trade, and spoofing", () => {
  it("sums fills across several makers (taker sells into two bids)", () => {
    resetLogIndex();
    const logs = [
      transfer(NTU, ALICE, MARKET, dec("10")),
      orderPlaced(MARKET, 9n, ALICE, 1, dec("1.9"), dec("10")),
      trade(MARKET, 3n, 9n, BOB, ALICE, dec("2"), dec("4"), dec("8")),
      transfer(NTU, MARKET, BOB, dec("4")),
      transfer(SGDX, MARKET, ALICE, dec("8")),
      trade(MARKET, 4n, 9n, EVIL, ALICE, dec("1.95"), dec("3"), dec("5.85")),
      transfer(NTU, MARKET, EVIL, dec("3")),
      transfer(SGDX, MARKET, ALICE, dec("5.85")),
    ];
    const r = decodeOrderReceipt({ logs, ...pair, user: ALICE });
    if (!r.ok) throw new Error("decode failed");
    expect(r.receipt.trades.map((t) => t.makerOrderId)).toEqual([3n, 4n]);
    expect(r.receipt.filledBase).toBe(dec("7"));
    expect(r.receipt.tradedQuote).toBe(dec("13.85"));
    expect(r.receipt.quoteReceived).toBe(dec("13.85"));
    expect(r.receipt.refundQuote).toBe(0n);
    expect(reconcileOrder(r.receipt, { id: 9n, amount: dec("10"), filled: dec("7"), lockedQuote: 0n })).toEqual([]);
  });

  it("does not count another taker's trades that appear in the same receipt", () => {
    resetLogIndex();
    const logs = [
      transfer(SGDX, BOB, MARKET, dec("8.8")),
      orderPlaced(MARKET, 2n, BOB, 0, dec("2.2"), dec("4")),
      trade(MARKET, 1n, 77n, ALICE, EVIL, dec("2"), dec("1"), dec("2")), // someone else's order
      trade(MARKET, 1n, 2n, ALICE, BOB, dec("2"), dec("4"), dec("8")),
    ];
    const r = decodeOrderReceipt({ logs, ...pair, user: BOB });
    if (!r.ok) throw new Error("decode failed");
    expect(r.receipt.trades).toHaveLength(1);
    expect(r.receipt.filledBase).toBe(dec("4"));
  });

  it("a self trade does not turn the payment to oneself as seller into a refund", () => {
    resetLogIndex();
    // Alice rests a sell (order 1) and then buys her own order with a higher limit.
    const logs = [
      transfer(SGDX, ALICE, MARKET, dec("8.8")),
      orderPlaced(MARKET, 2n, ALICE, 0, dec("2.2"), dec("4")),
      trade(MARKET, 1n, 2n, ALICE, ALICE, dec("2"), dec("4"), dec("8")),
      transfer(NTU, MARKET, ALICE, dec("4")),
      transfer(SGDX, MARKET, ALICE, dec("8")), // paid to herself as the seller
      transfer(SGDX, MARKET, ALICE, dec("0.8")), // her real refund
    ];
    const r = decodeOrderReceipt({ logs, ...pair, user: ALICE });
    if (!r.ok) throw new Error("decode failed");
    expect(r.receipt.selfTrade).toBe(true);
    expect(r.receipt.refundQuote).toBe(dec("0.8")); // not 8.8
    expect(reconcileOrder(r.receipt, { id: 2n, amount: dec("4"), filled: dec("4"), lockedQuote: 0n })).toEqual([]);
  });

  it("ignores OrderPlaced/Trade/Transfer logs from a contract that is not the market or the pair's tokens", () => {
    resetLogIndex();
    const real = specExampleLogs();
    const forged = [
      orderPlaced(EVIL, 999n, BOB, 0, dec("1"), dec("1")),
      trade(EVIL, 1n, 2n, ALICE, BOB, dec("1"), dec("1000"), dec("1000")),
      transfer(EVIL, MARKET, BOB, dec("1000000")),
    ];
    const r = decodeOrderReceipt({ logs: [...forged, ...real], ...pair, user: BOB });
    if (!r.ok) throw new Error("decode failed");
    expect(r.receipt.orderId).toBe(2n); // not the forged 999
    expect(r.receipt.filledBase).toBe(dec("4"));
    expect(r.receipt.refundQuote).toBe(dec("0.8"));
  });

  it("refuses to guess when there is no OrderPlaced for the user, or more than one", () => {
    resetLogIndex();
    expect(decodeOrderReceipt({ logs: specExampleLogs(), ...pair, user: EVIL })).toEqual({ ok: false, reason: "no-order-placed" });
    resetLogIndex();
    const two = [orderPlaced(MARKET, 1n, BOB, 0, dec("1"), dec("1")), orderPlaced(MARKET, 2n, BOB, 0, dec("1"), dec("1"))];
    expect(decodeOrderReceipt({ logs: two, ...pair, user: BOB })).toEqual({ ok: false, reason: "ambiguous-order-placed" });
    expect(decodeOrderReceipt({ logs: [], ...pair, user: BOB })).toEqual({ ok: false, reason: "no-order-placed" });
  });
});

describe("decodeTxEvents (transaction page)", () => {
  it("decodes registered events in log order and counts the rest as unrecognised", () => {
    resetLogIndex();
    const logs = [approval(SGDX, BOB, MARKET, dec("8.8")), ...specExampleLogs(), transfer(EVIL, ALICE, BOB, 1n)];
    const { events, unrecognised } = decodeTxEvents({ logs, markets: [MARKET], tokens: [NTU, SGDX] });
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["Approval", "OrderPlaced", "Trade", "Transfer"]));
    expect(events.filter((e) => e.kind === "Transfer")).toHaveLength(4);
    expect(unrecognised).toBe(1); // the EVIL transfer
    const t = events.find((e) => e.kind === "Trade");
    expect(t).toMatchObject({ kind: "Trade", price: dec("2"), baseAmount: dec("4") });
  });

  it("decodes nothing from unregistered addresses", () => {
    resetLogIndex();
    const { events, unrecognised } = decodeTxEvents({ logs: specExampleLogs(), markets: [], tokens: [] });
    expect(events).toEqual([]);
    expect(unrecognised).toBe(6);
  });
});

describe("decodeCancelReceipt (P2-8B.2)", () => {
  it("reads the event for the requested order and the refund tokens that moved to the trader", () => {
    resetLogIndex();
    const logs = [orderCancelled(MARKET, 1n, ALICE, dec("60"), 0n), transfer(NTU, MARKET, ALICE, dec("60"))];
    const r = decodeCancelReceipt({ logs, ...pair, user: ALICE, orderId: 1n });
    expect(r).toEqual({ ok: true, receipt: { orderId: 1n, trader: ALICE, refundBase: dec("60"), refundQuote: 0n, transferredBase: dec("60"), transferredQuote: 0n } });
  });

  it("a buy's refund is in quote", () => {
    resetLogIndex();
    const logs = [orderCancelled(MARKET, 2n, BOB, 0n, dec("13.2")), transfer(SGDX, MARKET, BOB, dec("13.2"))];
    const r = decodeCancelReceipt({ logs, ...pair, user: BOB, orderId: 2n });
    expect(r).toMatchObject({ ok: true, receipt: { refundQuote: dec("13.2"), transferredQuote: dec("13.2"), transferredBase: 0n } });
  });

  it("does not count transfers to someone else, or from someone other than the market", () => {
    resetLogIndex();
    const logs = [orderCancelled(MARKET, 1n, ALICE, dec("5"), 0n), transfer(NTU, MARKET, BOB, dec("5")), transfer(NTU, EVIL, ALICE, dec("5"))];
    const r = decodeCancelReceipt({ logs, ...pair, user: ALICE, orderId: 1n });
    expect(r).toMatchObject({ ok: true, receipt: { transferredBase: 0n } });
  });

  it("rejects a different order id, a different trader, another contract's event, and a missing event", () => {
    resetLogIndex();
    expect(decodeCancelReceipt({ logs: [orderCancelled(MARKET, 9n, ALICE, 1n, 0n)], ...pair, user: ALICE, orderId: 1n })).toEqual({ ok: false, reason: "no-order-cancelled" });
    expect(decodeCancelReceipt({ logs: [orderCancelled(MARKET, 1n, BOB, 1n, 0n)], ...pair, user: ALICE, orderId: 1n })).toEqual({ ok: false, reason: "no-order-cancelled" });
    expect(decodeCancelReceipt({ logs: [orderCancelled(EVIL, 1n, ALICE, 1n, 0n)], ...pair, user: ALICE, orderId: 1n })).toEqual({ ok: false, reason: "no-order-cancelled" });
    expect(decodeCancelReceipt({ logs: [], ...pair, user: ALICE, orderId: 1n })).toEqual({ ok: false, reason: "no-order-cancelled" });
  });

  it("refuses an ambiguous receipt (two cancellations of the same order for the same trader)", () => {
    resetLogIndex();
    const logs = [orderCancelled(MARKET, 1n, ALICE, 1n, 0n), orderCancelled(MARKET, 1n, ALICE, 1n, 0n)];
    expect(decodeCancelReceipt({ logs, ...pair, user: ALICE, orderId: 1n })).toEqual({ ok: false, reason: "ambiguous-order-cancelled" });
  });

  it("the transaction page decodes OrderCancelled and no longer counts it as unrecognised", () => {
    resetLogIndex();
    const logs = [orderCancelled(MARKET, 1n, ALICE, dec("60"), 0n), transfer(NTU, MARKET, ALICE, dec("60"))];
    const { events, unrecognised } = decodeTxEvents({ logs, markets: [MARKET], tokens: [NTU, SGDX] });
    expect(events.map((e) => e.kind)).toEqual(["OrderCancelled", "Transfer"]);
    expect(events[0]).toMatchObject({ kind: "OrderCancelled", orderId: 1n, refundBase: dec("60"), refundQuote: 0n });
    expect(unrecognised).toBe(0);
  });
});

describe("decodeMatchReceipt (P2-8B.3)", () => {
  const pair = { market: MARKET, baseToken: NTU, quoteToken: SGDX };
  const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as typeof ALICE;

  // Two fills in one transaction: Alice (sell) with Bob (buy) at 2, Carol (sell) with Bob at 3 (Bob's earlier bid is the maker).
  const twoFills = () => {
    resetLogIndex();
    return [
      trade(MARKET, 1n, 3n, ALICE, BOB, dec("2"), dec("1"), dec("2")),
      transfer(NTU, MARKET, BOB, dec("1")),
      transfer(SGDX, MARKET, ALICE, dec("2")),
      transfer(SGDX, MARKET, BOB, dec("1")), // price improvement refund (bid 3 against maker 2)
      trade(MARKET, 2n, 3n, CAROL, BOB, dec("2"), dec("1"), dec("2")),
      transfer(NTU, MARKET, BOB, dec("1")),
      transfer(SGDX, MARKET, CAROL, dec("2")),
    ];
  };

  it("returns every Trade from the market in log order, and what the market paid out per token", () => {
    const r = decodeMatchReceipt({ logs: twoFills(), ...pair });
    expect(r.fills).toHaveLength(2);
    expect(r.fills[0]).toMatchObject({ makerOrderId: 1n, takerOrderId: 3n, maker: ALICE, taker: BOB, price: dec("2"), baseAmount: dec("1"), quoteAmount: dec("2") });
    expect(r.fills[1]).toMatchObject({ makerOrderId: 2n, maker: CAROL });
    expect(r.baseOut).toBe(dec("2"));
    expect(r.quoteOut).toBe(dec("5")); // 2 + 1 refund + 2
    expect(r.baseTo[BOB.toLowerCase()]).toBe(dec("2"));
    expect(r.quoteTo[ALICE.toLowerCase()]).toBe(dec("2"));
    expect(r.quoteTo[BOB.toLowerCase()]).toBe(dec("1"));
  });

  it("a transaction with no Trade logs is a no-op: zero fills, nothing invented", () => {
    resetLogIndex();
    expect(decodeMatchReceipt({ logs: [], ...pair })).toEqual({ fills: [], baseOut: 0n, quoteOut: 0n, baseTo: {}, quoteTo: {} });
  });

  it("ignores trades and transfers emitted by another contract (spoofing) and another market's fills", () => {
    resetLogIndex();
    const OTHER_MARKET = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as typeof ALICE;
    const logs = [
      trade(EVIL, 1n, 3n, ALICE, BOB, dec("2"), dec("1"), dec("2")),
      trade(OTHER_MARKET, 7n, 8n, ALICE, BOB, dec("2"), dec("1"), dec("2")),
      transfer(NTU, ALICE, BOB, dec("5")), // not from the market
    ];
    expect(decodeMatchReceipt({ logs, ...pair })).toEqual({ fills: [], baseOut: 0n, quoteOut: 0n, baseTo: {}, quoteTo: {} });
  });
});
