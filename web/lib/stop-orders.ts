import { isTickAligned, parsePrice } from "./units";
import { validateOrderInput, type FieldError, type OrderFieldErrors, type OrderInput, type Side, type ValidOrder } from "./order-input";
import { AmountInputError } from "./units";

/**
 * Stop-limit rules, taken from `OrderBook.sol` (not from exchange conventions):
 * - a BUY stop is eligible when `lastTradePrice >= triggerPrice`, a SELL stop when `lastTradePrice <= triggerPrice`
 *   (equality counts), and only once the market has a trade price at all (`hasTradePrice`);
 * - eligibility is checked only inside `triggerStopOrders`, which anyone may call: an eligible stop does NOT wait for
 *   another trade, it waits for that transaction, and it is still escrowed and unfilled until then;
 * - the escrow is taken at placement at the LIMIT price (buy: `requiredQuote(amount, limitPrice)`, sell: `amount`);
 * - the engine does not compare the trigger with the limit or with the last trade price, so those are warnings, not errors.
 */
export type StopState =
  | { kind: "no-trade-price" }
  /** The rule is true right now. The order is still pending: it needs a Trigger stops transaction, not another trade. */
  | { kind: "eligible" }
  /** The rule is false at the current last trade price: a trade at `need` (fall to or rise to) the trigger is required first. */
  | { kind: "waiting"; need: "fall" | "rise" };

/** Side as the engine reports it (0 = Buy, 1 = Sell) or as the UI names it. */
export function stopState(side: number | Side, triggerPrice: bigint, lastTradePrice: bigint, hasTradePrice: boolean): StopState {
  if (!hasTradePrice) return { kind: "no-trade-price" };
  const buy = side === 0 || side === "buy";
  if (buy) return lastTradePrice >= triggerPrice ? { kind: "eligible" } : { kind: "waiting", need: "rise" };
  return lastTradePrice <= triggerPrice ? { kind: "eligible" } : { kind: "waiting", need: "fall" };
}

/** One line of plain wording for a pending stop's state, the same text in My orders and in the review. */
export function stopStateText(state: StopState, side: number | Side, triggerPrice: string): string {
  if (state.kind === "no-trade-price") return "Waiting for price: no trade has happened on this market yet, so no stop can trigger.";
  if (state.kind === "eligible") {
    return "Eligible now: the last trade price already meets the trigger. It stays pending, with its collateral escrowed, until someone sends a Trigger stops transaction. It does not need another trade.";
  }
  return `Waiting for price: it needs the last trade price to ${state.need === "fall" ? "fall to or below" : "rise to or above"} ${triggerPrice}.`;
}

export type StopHint = { code: "no-trade-price" | "eligible-now" | "limit-beyond-trigger"; text: string };

/** Non-blocking warnings: the engine accepts every positive tick-aligned pair, so none of these stops the order. */
export function stopHints(input: { side: Side; triggerPrice: bigint; limitPrice: bigint; lastTradePrice: bigint; hasTradePrice: boolean }): StopHint[] {
  const hints: StopHint[] = [];
  const state = stopState(input.side, input.triggerPrice, input.lastTradePrice, input.hasTradePrice);
  if (state.kind === "no-trade-price") {
    hints.push({ code: "no-trade-price", text: "No trade has happened on this market yet, so no stop can trigger until the first trade." });
  } else if (state.kind === "eligible") {
    hints.push({
      code: "eligible-now",
      text: "The last trade price already meets this trigger. The order will be pending but eligible: it needs a Trigger stops transaction from anyone, not another trade.",
    });
  }
  // A sell stop-loss usually has limit <= trigger and a buy stop limit >= trigger; the engine does not require it.
  if ((input.side === "sell" && input.limitPrice > input.triggerPrice) || (input.side === "buy" && input.limitPrice < input.triggerPrice)) {
    hints.push({
      code: "limit-beyond-trigger",
      text:
        input.side === "sell"
          ? "The limit price is above the trigger. After activation it may not find a buyer until the price rises again."
          : "The limit price is below the trigger. After activation it may not find a seller until the price falls again.",
    });
  }
  return hints;
}

export type StopInput = OrderInput & {
  /** The trigger price as typed. `priceText` is the LIMIT price. */
  triggerText: string;
};

export type StopValidation = { ok: true; order: ValidOrder & { kind: "stop"; triggerPrice: bigint } } | { ok: false; errors: OrderFieldErrors };

const asFieldError = (error: unknown): FieldError => {
  if (error instanceof AmountInputError) return { code: error.code, message: error.message };
  throw error;
};

/**
 * Validates a stop-limit order exactly as the engine would: amount, limit price and trigger price all positive and
 * aligned to the lot and tick sizes; the collateral comes from the LIMIT price (never the trigger price) and must be
 * covered by the wallet balance. Reports every problem at once.
 */
export function validateStopInput(input: StopInput): StopValidation {
  const base = validateOrderInput(input);
  const errors: OrderFieldErrors = base.ok ? {} : { ...base.errors };
  let trigger: bigint | undefined;
  try {
    trigger = parsePrice(input.triggerText);
    if (trigger === 0n) {
      errors.trigger = { code: "zero", message: "The trigger price must be greater than zero." };
      trigger = undefined;
    } else if (!isTickAligned(trigger, input.tickSize)) {
      errors.trigger = { code: "not-tick-multiple", message: "The trigger price must be a multiple of the tick size." };
      trigger = undefined;
    }
  } catch (e) {
    errors.trigger = asFieldError(e);
  }
  if (!base.ok || trigger === undefined || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, order: { ...base.order, kind: "stop", triggerPrice: trigger } };
}

/** The ordering helper for My orders: is this order a stop-limit order, pending or activated? (`getOrder.triggerPrice != 0`.) */
export const isStopOrder = (o: { triggerPrice: bigint }): boolean => o.triggerPrice !== 0n;
