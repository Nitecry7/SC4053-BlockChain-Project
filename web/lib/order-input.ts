import { maxUint256 } from "viem";
import { AmountInputError, isLotAligned, isTickAligned, parsePrice, parseTokenAmount, requiredQuote } from "./units";

/** The engine's `Side` enum: Buy = 0, Sell = 1 (CONTRACT_INTERFACE.md). */
export type Side = "buy" | "sell";
export const SIDE_INDEX: Record<Side, 0 | 1> = { buy: 0, sell: 1 };

export type FieldErrorCode =
  | "empty"
  | "malformed"
  | "too-many-decimals"
  | "too-large"
  | "zero"
  | "not-lot-multiple"
  | "not-tick-multiple"
  | "insufficient-balance";

export type FieldError = { code: FieldErrorCode; message: string };
export type OrderFieldErrors = { price?: FieldError; amount?: FieldError; balance?: FieldError; trigger?: FieldError };

/** A fully validated order, in the engine's units. `collateral` is what the order book will pull into escrow. */
export type ValidOrder = {
  side: Side;
  price: bigint;
  amount: bigint;
  /** Buy: the quote token. Sell: the base token. */
  collateralToken: "base" | "quote";
  /** Buy: `requiredQuote(amount, price)`. Sell: `amount`. */
  collateral: bigint;
  /** Appended (P2-8B.4): "stop" for a stop-limit order, whose `price` is the LIMIT price. Absent means a plain limit order. */
  kind?: "limit" | "stop";
  /** Appended (P2-8B.4): the stop's trigger price. Only present for `kind: "stop"`. Never used for the escrow. */
  triggerPrice?: bigint;
};

export type OrderValidation = { ok: true; order: ValidOrder } | { ok: false; errors: OrderFieldErrors };

export type OrderInput = {
  side: Side;
  priceText: string;
  amountText: string;
  /** Read from the contract (`LOT_SIZE`, `TICK_SIZE`), never assumed. */
  lotSize: bigint;
  tickSize: bigint;
  /** Wallet balances of the connected account. Omit when unknown (not connected): the balance check is then skipped. */
  balances?: { base: bigint; quote: bigint };
};

const asFieldError = (error: unknown): FieldError => {
  if (error instanceof AmountInputError) return { code: error.code, message: error.message };
  throw error;
};

/**
 * Validates what the user typed against the contract's own rules, before anything is simulated or signed.
 * Reports every problem at once. Never trims, rounds or guesses (see `parseTokenAmount`).
 */
export function validateOrderInput(input: OrderInput): OrderValidation {
  const errors: OrderFieldErrors = {};
  let price: bigint | undefined;
  let amount: bigint | undefined;

  try {
    price = parsePrice(input.priceText);
    if (price === 0n) {
      errors.price = { code: "zero", message: "The limit price must be greater than zero." };
    } else if (!isTickAligned(price, input.tickSize)) {
      errors.price = { code: "not-tick-multiple", message: "The price must be a multiple of the tick size." };
    }
  } catch (e) {
    errors.price = asFieldError(e);
  }

  try {
    amount = parseTokenAmount(input.amountText);
    if (amount === 0n) {
      errors.amount = { code: "zero", message: "The amount must be greater than zero." };
    } else if (!isLotAligned(amount, input.lotSize)) {
      errors.amount = { code: "not-lot-multiple", message: "The amount must be a multiple of the lot size." };
    }
  } catch (e) {
    errors.amount = asFieldError(e);
  }

  if (errors.price || errors.amount || price === undefined || amount === undefined) return { ok: false, errors };

  let collateral: bigint;
  try {
    collateral = input.side === "buy" ? requiredQuote(amount, price) : amount;
  } catch {
    // The engine's mulDiv would revert on overflow; refuse before the wallet is ever asked.
    return { ok: false, errors: { amount: { code: "too-large", message: "Amount times price is too large." } } };
  }
  if (collateral > maxUint256) return { ok: false, errors: { amount: { code: "too-large", message: "That amount is too large." } } };

  const collateralToken = input.side === "buy" ? "quote" : "base";
  const available = input.balances?.[collateralToken];
  if (available !== undefined && collateral > available) {
    return {
      ok: false,
      errors: { balance: { code: "insufficient-balance", message: "Your wallet balance is below the collateral this order escrows." } },
    };
  }
  return { ok: true, order: { side: input.side, price, amount, collateralToken, collateral } };
}
