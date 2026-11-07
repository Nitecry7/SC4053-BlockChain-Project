import { formatUnits, maxUint256, parseUnits } from "viem";

/** Both tokens of every market have 18 decimals (the OrderBook constructor enforces it). */
export const TOKEN_DECIMALS = 18;
/** Prices are quote base units per whole base token, scaled by 1e18 (CONTRACT_INTERFACE.md, "Units"). */
export const PRICE_SCALE = 10n ** 18n;

export type AmountErrorCode = "empty" | "malformed" | "too-many-decimals" | "too-large";

export class AmountInputError extends Error {
  readonly code: AmountErrorCode;
  constructor(code: AmountErrorCode, message: string) {
    super(message);
    this.name = "AmountInputError";
    this.code = code;
  }
}

// Digits, optionally one dot followed by at least one digit. No sign, exponent, separator, whitespace or bare dot.
const DECIMAL_INPUT = /^\d+(\.\d+)?$/;

/**
 * Parses a user-typed decimal string into base units, exactly. Rejects instead of guessing: no trimming, no rounding,
 * no scientific notation, no thousands separators, no negatives.
 */
export function parseTokenAmount(input: string, decimals: number = TOKEN_DECIMALS): bigint {
  if (input.length === 0) throw new AmountInputError("empty", "Enter an amount.");
  if (!DECIMAL_INPUT.test(input)) {
    throw new AmountInputError("malformed", "Use digits and an optional decimal point, for example 12.5.");
  }
  const fraction = input.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new AmountInputError("too-many-decimals", `Use at most ${decimals} decimal places.`);
  }
  const value = parseUnits(input, decimals);
  if (value > maxUint256) throw new AmountInputError("too-large", "That amount is too large.");
  return value;
}

/** A price in the engine's unit: quote per whole base token, scaled by PRICE_SCALE. */
export function parsePrice(input: string): bigint {
  return parseTokenAmount(input, TOKEN_DECIMALS);
}

export type AmountParts = {
  /** Integer part with thousands separators, e.g. "1,000,000". */
  integer: string;
  /** The first `visible` fractional digits, always padded to that length. */
  fraction: string;
  /** The remaining fractional digits (exact, never rounded). Shown dimmed by the UI. */
  tail: string;
};

/**
 * Splits an exact base-unit amount for display without losing precision: nothing is rounded, the tail is only dimmed.
 * Negative values are not part of this app (balances, supplies and prices are unsigned).
 */
export function splitAmount(value: bigint, decimals: number = TOKEN_DECIMALS, visible = 4): AmountParts {
  if (value < 0n) throw new RangeError("splitAmount expects an unsigned value");
  const [rawInteger = "0", rawFraction = ""] = formatUnits(value, decimals).split(".");
  const fraction = rawFraction.padEnd(decimals, "0");
  const shown = Math.min(Math.max(visible, 0), decimals);
  return {
    integer: groupThousands(rawInteger),
    fraction: fraction.slice(0, shown),
    tail: fraction.slice(shown),
  };
}

/** Compact display string: exact up to `visible` fractional digits, truncated (never rounded up) beyond. */
export function formatTokenAmount(value: bigint, decimals: number = TOKEN_DECIMALS, visible = 4): string {
  const { integer, fraction } = splitAmount(value, decimals, visible);
  return fraction.length > 0 ? `${integer}.${fraction}` : integer;
}

/** The full exact decimal value with no grouping and no trailing zeros, e.g. "10000" or "0.000000001". */
export function formatExact(value: bigint, decimals: number = TOKEN_DECIMALS): string {
  return formatUnits(value, decimals);
}

export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** `amount % LOT_SIZE == 0` (the engine's InvalidLotSize rule), with the lot size read from the contract. */
export function isLotAligned(amount: bigint, lotSize: bigint): boolean {
  return lotSize > 0n && amount % lotSize === 0n;
}

/** `price % TICK_SIZE == 0` (the engine's InvalidTickSize rule), with the tick size read from the contract. */
export function isTickAligned(price: bigint, tickSize: bigint): boolean {
  return tickSize > 0n && price % tickSize === 0n;
}

function assertUint256(amount: bigint, price: bigint) {
  if (amount < 0n || price < 0n || amount > maxUint256 || price > maxUint256) {
    throw new RangeError("amount and price must be uint256 values");
  }
}

/** The engine's `Math.mulDiv` reverts when the result does not fit in uint256; so do these mirrors. */
function assertFits(result: bigint): bigint {
  if (result > maxUint256) throw new RangeError("result exceeds uint256 (the contract would revert)");
  return result;
}

/** Mirrors OrderBook.requiredQuote: buy escrow, ceil(amount * price / PRICE_SCALE). */
export function requiredQuote(amount: bigint, price: bigint): bigint {
  assertUint256(amount, price);
  const product = amount * price;
  return assertFits(product / PRICE_SCALE + (product % PRICE_SCALE === 0n ? 0n : 1n));
}

/** Mirrors the engine's fill cost: floor(amount * price / PRICE_SCALE), paid to the seller. */
export function quoteCost(amount: bigint, price: bigint): bigint {
  assertUint256(amount, price);
  return assertFits((amount * price) / PRICE_SCALE);
}
