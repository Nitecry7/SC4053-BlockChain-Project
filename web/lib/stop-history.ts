import { decodeEventLog, pad, toEventSelector, toHex, type Address, type Hex, type PublicClient } from "viem";
import { orderBookAbi } from "@/lib/contracts/abis";
import type { OrderSnapshot } from "./order-status";
import { stopState, stopStateText } from "./stop-orders";
import { formatExact } from "./units";

/**
 * What a stop-limit order did, told only from evidence.
 *
 * `getOrder` cannot say whether an order that is no longer `PendingTrigger` ever activated: a stop cancelled by its owner
 * while pending and a stop that was activated and then cancelled both read `Cancelled`. The engine does emit the answer:
 * `StopOrderTriggered(orderId, lastTradePrice)` is emitted exactly when a pending stop activates (before any fill or
 * auto-cancel), and the engine's own auto-cancel emits `OrderCancelled` in the SAME transaction as that trigger event.
 * So "activated" is claimed only from a `StopOrderTriggered` record; when the history could not be read the wording is
 * neutral and never says "activated".
 */
export type StopHistory = {
  /** `ok`: the log read succeeded for these ids. `unavailable`: it failed or was malformed, so no absence may be inferred. */
  status: "ok" | "unavailable";
  /** Keyed by the order id as a decimal string. */
  triggered: Record<string, { tx: Hex; lastTradePrice: bigint }>;
  cancelled: Record<string, { tx: Hex }>;
};

export const UNREAD_HISTORY: StopHistory = { status: "unavailable", triggered: {}, cancelled: {} };

export type StopKind =
  | "pending-unread"
  | "pending-no-price"
  | "pending-waiting"
  | "pending-eligible"
  | "activated-resting"
  | "activated-partly-filled"
  | "activated-filled"
  | "cancelled-before-activation"
  | "activated-then-cancelled"
  | "engine-cancelled-at-activation"
  | "activated-cancelled-unknown-actor"
  | "cancelled-unknown"
  | "history-unread"
  | "history-inconsistent";

export type StopClass = { kind: StopKind; text: string };

/** The most stop orders whose history is read in one request (the list itself is capped by `MY_ORDERS_LIMIT`). */
export const HISTORY_ID_LIMIT = 100;

/** Orders that need a history read: stop orders that are no longer pending. A pending stop cannot have activated. */
export function historyIds(orders: ReadonlyArray<Pick<OrderSnapshot, "id" | "triggerPrice" | "status">>, limit: number): bigint[] {
  return orders.filter((o) => o.triggerPrice !== 0n && o.status !== 4).map((o) => o.id).slice(-limit);
}

const selector = (name: "StopOrderTriggered" | "OrderCancelled") => {
  const item = orderBookAbi.find((e) => e.type === "event" && e.name === name);
  if (!item) throw new Error(`event ${name} missing from the ABI`);
  return toEventSelector(item as never);
};

/**
 * One `eth_getLogs` request for both events, filtered on the indexed `orderId` (topic 1) and bounded to the market and to
 * `[fromBlock, latest]`; `fromBlock` is the earliest placement block of the listed stops, not the chain's start. It never
 * throws: any failure or a response it cannot decode returns `UNREAD_HISTORY`, because an unread history must not be
 * mistaken for an empty one. It does not retry.
 */
export async function readStopHistory(client: Pick<PublicClient, "request">, market: Address, ids: readonly bigint[], fromBlock: bigint): Promise<StopHistory> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { status: "ok", triggered: {}, cancelled: {} };
  if (unique.length > HISTORY_ID_LIMIT) return UNREAD_HISTORY;
  try {
    const logs = (await (client.request as (a: unknown) => Promise<unknown>)({
      method: "eth_getLogs",
      params: [
        {
          address: market,
          fromBlock: toHex(fromBlock),
          toBlock: "latest",
          topics: [[selector("StopOrderTriggered"), selector("OrderCancelled")], unique.map((id) => pad(toHex(id), { size: 32 }))],
        },
      ],
    })) as unknown;
    if (!Array.isArray(logs)) return UNREAD_HISTORY;
    const out: StopHistory = { status: "ok", triggered: {}, cancelled: {} };
    for (const raw of logs as Array<{ topics: Hex[]; data: Hex; transactionHash: Hex }>) {
      const d = decodeEventLog({ abi: orderBookAbi, data: raw.data, topics: raw.topics as [Hex, ...Hex[]] });
      if (d.eventName === "StopOrderTriggered") {
        out.triggered[d.args.orderId.toString()] = { tx: raw.transactionHash, lastTradePrice: d.args.lastTradePrice };
      } else if (d.eventName === "OrderCancelled") {
        out.cancelled[d.args.orderId.toString()] = { tx: raw.transactionHash };
      } else {
        return UNREAD_HISTORY;
      }
    }
    return out;
  } catch {
    return UNREAD_HISTORY;
  }
}

/** The wording and kind for one stop order, from its on-chain snapshot, the market's last trade and the (maybe unread) history. */
export function classifyStop(input: {
  order: OrderSnapshot;
  snapshot: { lastTradePrice: bigint; hasTradePrice: boolean } | undefined;
  history: StopHistory | undefined;
}): StopClass {
  const { order, snapshot, history } = input;
  if (order.status === 4) {
    if (!snapshot) return { kind: "pending-unread", text: "Reading the market…" };
    const st = stopState(order.side, order.triggerPrice, snapshot.lastTradePrice, snapshot.hasTradePrice);
    const kind = st.kind === "eligible" ? "pending-eligible" : st.kind === "waiting" ? "pending-waiting" : "pending-no-price";
    return { kind, text: stopStateText(st, order.side, formatExact(order.triggerPrice)) };
  }

  const key = order.id.toString();
  const readable = history !== undefined && history.status === "ok";
  const trig = readable ? history.triggered[key] : undefined;
  const cancel = readable ? history.cancelled[key] : undefined;
  const cancelled = order.status === 3;

  if (!readable) {
    return cancelled
      ? { kind: "cancelled-unknown", text: "Cancelled. Whether it had activated first could not be read, so no claim is made." }
      : { kind: "history-unread", text: "Its activation record has not been read yet, so no claim is made about when it activated." };
  }

  if (!trig) {
    return cancelled
      ? { kind: "cancelled-before-activation", text: "You cancelled it before it activated. It never triggered, and its escrow was refunded." }
      : { kind: "history-inconsistent", text: "No activation record was found for this order, although it is no longer pending. Check the transaction history." };
  }

  if (cancelled) {
    if (!cancel) return { kind: "activated-cancelled-unknown-actor", text: "It activated, and it is now cancelled. The cancellation record could not be matched, so who cancelled it is not stated." };
    return cancel.tx.toLowerCase() === trig.tx.toLowerCase()
      ? { kind: "engine-cancelled-at-activation", text: "It activated and the engine cancelled and refunded the rest in the same transaction, because it could not rest on the order book. You did not cancel it." }
      : { kind: "activated-then-cancelled", text: "It activated, then you cancelled the unfilled remainder." };
  }
  if (order.status === 2) return { kind: "activated-filled", text: "Activated, then filled." };
  if (order.status === 1) return { kind: "activated-partly-filled", text: "Activated, then partly filled. The rest rests on the order book at its limit price." };
  return { kind: "activated-resting", text: "Activated: it is now an ordinary order resting at its limit price." };
}
