import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { orderBookAbi } from "@/lib/contracts/abis";
import { classifyStop, historyIds, readStopHistory, UNREAD_HISTORY, type StopHistory } from "./stop-history";
import type { OrderSnapshot } from "./order-status";

const E18 = 10n ** 18n;
const OWNER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as const;
const MARKET = "0xCafac3dD18aC6c6e92c921884f9E4176737C052c" as const;
const TX_TRIGGER = ("0x" + "a".repeat(64)) as Hex;
const TX_LATER = ("0x" + "b".repeat(64)) as Hex;

const stop = (over: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: 3n,
  trader: OWNER,
  side: 0,
  price: (17n * E18) / 10n,
  triggerPrice: (18n * E18) / 10n,
  amount: 10n * E18,
  filled: 0n,
  lockedQuote: 17n * E18,
  createdAt: 1n,
  status: 4,
  ...over,
});
const snap = { lastTradePrice: 2n * E18, hasTradePrice: true };
const none: StopHistory = { status: "ok", triggered: {}, cancelled: {} };
const trig = (tx: Hex = TX_TRIGGER): StopHistory["triggered"] => ({ "3": { tx, lastTradePrice: (18n * E18) / 10n } });
const canc = (tx: Hex): StopHistory["cancelled"] => ({ "3": { tx } });
const text = (o: OrderSnapshot, history: StopHistory | undefined) => classifyStop({ order: o, snapshot: snap, history });

describe("classifyStop: a stop's history is read from logs, never inferred from the status", () => {
  it("pending stops need no history: waiting, eligible and no-trade-price keep the engine's rule", () => {
    expect(classifyStop({ order: stop(), snapshot: { lastTradePrice: E18, hasTradePrice: true }, history: undefined }).kind).toBe("pending-waiting");
    expect(classifyStop({ order: stop(), snapshot: snap, history: undefined }).kind).toBe("pending-eligible");
    expect(classifyStop({ order: stop(), snapshot: { lastTradePrice: 0n, hasTradePrice: false }, history: undefined }).kind).toBe("pending-no-price");
    expect(classifyStop({ order: stop(), snapshot: undefined, history: undefined }).kind).toBe("pending-unread");
  });

  it("REGRESSION (order #3): cancelled with no StopOrderTriggered is 'cancelled before activation', never 'activated'", () => {
    const r = text(stop({ status: 3, lockedQuote: 0n }), none);
    expect(r.kind).toBe("cancelled-before-activation");
    expect(r.text).toMatch(/cancelled it before it activated/i);
    expect(r.text).toMatch(/never triggered/i);
    expect(r.text).not.toMatch(/activated:|now an ordinary order/i);
  });

  it("activated and resting, partly filled, filled", () => {
    expect(text(stop({ status: 0 }), { ...none, triggered: trig() }).kind).toBe("activated-resting");
    expect(text(stop({ status: 1, filled: 4n * E18 }), { ...none, triggered: trig() }).kind).toBe("activated-partly-filled");
    expect(text(stop({ status: 2, filled: 10n * E18 }), { ...none, triggered: trig() }).kind).toBe("activated-filled");
    expect(text(stop({ status: 0 }), { ...none, triggered: trig() }).text).toMatch(/^Activated/);
  });

  it("activated, then cancelled by the owner in a LATER transaction", () => {
    const r = text(stop({ status: 3 }), { ...none, triggered: trig(TX_TRIGGER), cancelled: canc(TX_LATER) });
    expect(r.kind).toBe("activated-then-cancelled");
    expect(r.text).toMatch(/you cancelled/i);
  });

  it("an engine auto-cancel (cancel in the SAME transaction as the trigger) is not an owner cancellation", () => {
    const r = text(stop({ status: 3, filled: 3n * E18 }), { ...none, triggered: trig(TX_TRIGGER), cancelled: canc(TX_TRIGGER) });
    expect(r.kind).toBe("engine-cancelled-at-activation");
    expect(r.text).toMatch(/engine/i);
    expect(r.text).not.toMatch(/you cancelled/i);
  });

  it("activated, then cancelled, with the cancel record missing: neutral, still no owner claim", () => {
    const r = text(stop({ status: 3 }), { ...none, triggered: trig() });
    expect(r.kind).toBe("activated-cancelled-unknown-actor");
    expect(r.text).not.toMatch(/you cancelled|engine/i);
  });

  it("INCOMPLETE history (read failed or not loaded yet): cancelled and non-pending stops get neutral wording, never 'Activated'", () => {
    for (const history of [undefined, UNREAD_HISTORY]) {
      for (const status of [0, 1, 2, 3]) {
        const r = text(stop({ status }), history);
        expect(r.kind).toBe(status === 3 ? "cancelled-unknown" : "history-unread");
        expect(r.text).not.toMatch(/^Activated|activated:|now an ordinary order/i);
        expect(r.text).toMatch(/could not be read|not been read yet|not read/i);
      }
    }
  });

  it("a non-pending, non-cancelled stop with a COMPLETE history that has no trigger record is flagged as inconsistent, not as activated", () => {
    const r = text(stop({ status: 1, filled: E18 }), none);
    expect(r.kind).toBe("history-inconsistent");
    expect(r.text).not.toMatch(/^Activated/);
  });

  it("property: no status/history combination without a StopOrderTriggered record ever says 'activated'", () => {
    for (const status of [0, 1, 2, 3]) {
      for (const history of [undefined, UNREAD_HISTORY, none]) {
        expect(text(stop({ status }), history).text).not.toMatch(/^Activated|activated:/i);
      }
    }
  });
});

describe("historyIds: which orders need a history read (bounded, and nothing for pending stops)", () => {
  it("lists only stop orders that are no longer pending, capped at the given limit, newest first", () => {
    const rows = [
      stop({ id: 1n, status: 4 }), // pending: never needs history
      stop({ id: 2n, status: 3 }),
      { ...stop({ id: 9n, status: 0 }), triggerPrice: 0n }, // an ordinary limit order
      stop({ id: 4n, status: 1 }),
      stop({ id: 5n, status: 2 }),
    ];
    expect(historyIds(rows, 50)).toEqual([2n, 4n, 5n]);
    expect(historyIds(rows, 2)).toEqual([4n, 5n]);
    expect(historyIds([stop({ status: 4 })], 50)).toEqual([]);
  });
});

/** A fake JSON-RPC client that records requests. */
const topic = (name: "StopOrderTriggered" | "OrderCancelled") => {
  // lazily computed through viem so the test pins the real event signatures
  const item = orderBookAbi.find((e) => e.type === "event" && e.name === name)!;
  return item as unknown as { inputs: readonly unknown[] };
};

describe("readStopHistory: ONE bounded, topic-filtered request, and it fails closed", () => {
  it("sends exactly one eth_getLogs with both event topics, the order ids as topic 1 and a bounded block range", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const h = await readStopHistory({ request } as never, MARKET, [3n, 4n], 123n);
    expect(h.status).toBe("ok");
    expect(request).toHaveBeenCalledTimes(1);
    const arg = request.mock.calls[0]![0];
    expect(arg.method).toBe("eth_getLogs");
    const p = arg.params[0];
    expect(p.address).toBe(MARKET);
    expect(p.fromBlock).toBe("0x7b");
    expect(p.toBlock).toBe("latest");
    expect(p.topics[0]).toHaveLength(2); // StopOrderTriggered | OrderCancelled
    expect(p.topics[1]).toEqual([`0x${"0".repeat(63)}3`, `0x${"0".repeat(63)}4`]);
    expect((topic("StopOrderTriggered").inputs[0] as unknown as { indexed: boolean }).indexed).toBe(true);
    expect((topic("OrderCancelled").inputs[0] as unknown as { indexed: boolean }).indexed).toBe(true);
  });

  it("makes NO request when there is nothing to look up", async () => {
    const request = vi.fn();
    const h = await readStopHistory({ request } as never, MARKET, [], 1n);
    expect(request).not.toHaveBeenCalled();
    expect(h).toEqual({ status: "ok", triggered: {}, cancelled: {} });
  });

  it("an RPC failure gives an unavailable history, not an exception", async () => {
    const request = vi.fn().mockRejectedValue(new Error("boom"));
    const h = await readStopHistory({ request } as never, MARKET, [3n], 1n);
    expect(h).toEqual(UNREAD_HISTORY);
    expect(request).toHaveBeenCalledTimes(1); // no hidden retry loop
  });

  it("a malformed response (not an array, or a log that cannot be decoded) is unavailable, never a guess", async () => {
    expect((await readStopHistory({ request: vi.fn().mockResolvedValue({ nope: 1 }) } as never, MARKET, [3n], 1n)).status).toBe("unavailable");
    const junk = [{ topics: ["0x" + "1".repeat(64), `0x${"0".repeat(63)}3`], data: "0x", transactionHash: TX_TRIGGER }];
    expect((await readStopHistory({ request: vi.fn().mockResolvedValue(junk) } as never, MARKET, [3n], 1n)).status).toBe("unavailable");
  });

  it("ids beyond the limit are refused (the caller bounds the list), so the topic list can never grow without bound", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const h = await readStopHistory({ request } as never, MARKET, Array.from({ length: 101 }, (_, i) => BigInt(i + 1)), 1n);
    expect(h.status).toBe("unavailable");
    expect(request).not.toHaveBeenCalled();
  });
});
