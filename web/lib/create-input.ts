import { AmountInputError, TOKEN_DECIMALS, parseTokenAmount } from "./units";

/**
 * Limits applied by this UI only. TokenFactory itself accepts any non-empty name and symbol of any length; these
 * guard rails keep invisible, misleading or oversized strings out of the registry, and are stricter than the contract.
 */
export const NAME_MAX_CHARS = 64;
export const SYMBOL_MAX_CHARS = 16;

export type CreateFieldErrorCode =
  | "empty"
  | "whitespace-only"
  | "edge-space"
  | "too-long"
  | "bad-character"
  | "malformed"
  | "too-many-decimals"
  | "too-large"
  | "zero"
  | "above-max";

export type CreateFieldError = { code: CreateFieldErrorCode; message: string };
export type TokenFieldErrors = { name?: CreateFieldError; symbol?: CreateFieldError; supply?: CreateFieldError };

/** What `TokenFactory.createToken` will be called with. `supply` is in RAW units (18 decimals), as the contract expects. */
export type ValidToken = { name: string; symbol: string; supply: bigint; decimals: typeof TOKEN_DECIMALS; lotDust: bigint };
export type TokenValidation = { ok: true; token: ValidToken } | { ok: false; errors: TokenFieldErrors };

export type TokenInput = {
  name: string;
  symbol: string;
  supplyText: string;
  /** `TokenFactory.MAX_SUPPLY()`, read from the chain (raw units). */
  maxSupply: bigint;
  /** `OrderBook.LOT_SIZE()`, read from the market (raw units). Used only to flag untradable dust. */
  lotSize: bigint;
};

// Control, format (zero-width, bidirectional, soft hyphen, tag), surrogate, line/paragraph separator and non-ASCII space characters, plus the
// fillers that render blank: all invisible or order-changing text. Only the ordinary space is allowed.
const BAD_CHARS = /(?! )[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Zs}ㅤᅠ⠀͏]/u;

function checkText(text: string, max: number, label: string): CreateFieldError | undefined {
  if (text.length === 0) return { code: "empty", message: `Enter a ${label}.` };
  if (text.trim().length === 0) return { code: "whitespace-only", message: `The ${label} cannot be only spaces.` };
  if (text !== text.trim()) return { code: "edge-space", message: `Remove the space at the start or end of the ${label}.` };
  if (BAD_CHARS.test(text)) return { code: "bad-character", message: `The ${label} contains an invisible or control character.` };
  if ([...text].length > max) return { code: "too-long", message: `Use at most ${max} characters for the ${label}.` };
  return undefined;
}

/** Whole tokens that fit under the contract's cap, for messages: `1e27` raw at 18 decimals is 1,000,000,000 tokens. */
export const wholeTokens = (raw: bigint) => raw / 10n ** BigInt(TOKEN_DECIMALS);

/**
 * Validates the Create token form against the contract's real rules (non-empty name and symbol, supply above zero and
 * at most `MAX_SUPPLY`) plus this UI's guard rails. The supply is parsed from a decimal string with bigint only: no
 * floating point, no rounding, no sign, exponent or separator.
 */
export function validateTokenInput(input: TokenInput): TokenValidation {
  const errors: TokenFieldErrors = {};
  const nameError = checkText(input.name, NAME_MAX_CHARS, "token name");
  if (nameError) errors.name = nameError;
  const symbolError = checkText(input.symbol, SYMBOL_MAX_CHARS, "token symbol");
  if (symbolError) errors.symbol = symbolError;

  let supply: bigint | undefined;
  try {
    supply = parseTokenAmount(input.supplyText, TOKEN_DECIMALS);
    if (supply === 0n) {
      errors.supply = { code: "zero", message: "The supply must be greater than zero." };
    } else if (supply > input.maxSupply) {
      errors.supply = { code: "above-max", message: `The supply cannot exceed ${wholeTokens(input.maxSupply).toLocaleString("en-US")} tokens.` };
    }
  } catch (e) {
    if (!(e instanceof AmountInputError)) throw e;
    errors.supply = { code: e.code === "empty" ? "empty" : e.code, message: e.message };
  }

  if (errors.name || errors.symbol || errors.supply || supply === undefined) return { ok: false, errors };
  const lotDust = input.lotSize > 0n ? supply % input.lotSize : 0n;
  return { ok: true, token: { name: input.name, symbol: input.symbol, supply, decimals: TOKEN_DECIMALS, lotDust } };
}
