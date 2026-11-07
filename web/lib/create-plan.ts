import { isAddress, type Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000";

export type AddressParse = { ok: true; address: Address } | { ok: false; code: "empty" | "malformed" | "zero"; message: string };

/**
 * Parses a pasted token address. Lower-case and correctly checksummed addresses are accepted; a mixed-case address with
 * a wrong checksum is refused (that is how a typo in an address is caught).
 */
export function parseAddressInput(text: string): AddressParse {
  if (text.length === 0) return { ok: false, code: "empty", message: "Enter a token contract address." };
  if (!isAddress(text)) return { ok: false, code: "malformed", message: "That is not a valid address (0x followed by 40 hexadecimal digits; a mixed-case address must have a correct checksum)." };
  if (text.toLowerCase() === ZERO) return { ok: false, code: "zero", message: "The zero address is not a token." };
  return { ok: true, address: text as Address };
}

export type Side = "base" | "quote";

/** What the chain says about one candidate token. `not-a-token` means `decimals()` could not be read at all. */
export type TokenProbe =
  | { status: "loading" }
  | { status: "not-a-token" }
  | { status: "ok"; decimals: number; name?: string; symbol?: string; totalSupply?: bigint; issuedByFactory: boolean };

/** The market that `MarketFactory.getMarket(a, b)` returned (order-insensitive), read from the market itself. */
export type ExistingMarket = { market: Address; base: Address; quote: Address };

export type PairState =
  | { kind: "incomplete" }
  | { kind: "zero-address"; side: Side }
  | { kind: "same-token" }
  | { kind: "probing" }
  | { kind: "not-a-token"; side: Side }
  | { kind: "wrong-decimals"; side: Side; decimals: number }
  | { kind: "checking-duplicate" }
  /** A market for this pair, in either orientation, already exists: no transaction may be sent. */
  | { kind: "exists"; market: Address; orientation: "same" | "reversed"; existingBase: Address; existingQuote: Address }
  | { kind: "ready"; unverified: Side[] };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Decides what the List market form may do, from on-chain reads only. The order of the checks matters: the cheapest
 * and most fundamental problem is reported first, and a duplicate is reported before anything is signed (the factory
 * would revert with `MarketExists`, so a transaction expected to revert is never offered).
 *
 * `existing` is `undefined` while the duplicate lookup is loading, `null` when no market exists.
 */
export function classifyPair(input: {
  base: Address | undefined;
  quote: Address | undefined;
  baseProbe: TokenProbe | undefined;
  quoteProbe: TokenProbe | undefined;
  existing: ExistingMarket | null | undefined;
}): PairState {
  const { base, quote, baseProbe, quoteProbe, existing } = input;
  if (!base || !quote) return { kind: "incomplete" };
  if (same(base, ZERO)) return { kind: "zero-address", side: "base" };
  if (same(quote, ZERO)) return { kind: "zero-address", side: "quote" };
  if (same(base, quote)) return { kind: "same-token" };
  if (!baseProbe || !quoteProbe || baseProbe.status === "loading" || quoteProbe.status === "loading") return { kind: "probing" };
  if (baseProbe.status === "not-a-token") return { kind: "not-a-token", side: "base" };
  if (quoteProbe.status === "not-a-token") return { kind: "not-a-token", side: "quote" };
  if (baseProbe.decimals !== 18) return { kind: "wrong-decimals", side: "base", decimals: baseProbe.decimals };
  if (quoteProbe.decimals !== 18) return { kind: "wrong-decimals", side: "quote", decimals: quoteProbe.decimals };
  if (existing === undefined) return { kind: "checking-duplicate" };
  if (existing !== null) {
    return {
      kind: "exists",
      market: existing.market,
      orientation: same(existing.base, base) && same(existing.quote, quote) ? "same" : "reversed",
      existingBase: existing.base,
      existingQuote: existing.quote,
    };
  }
  const unverified: Side[] = [];
  if (!baseProbe.issuedByFactory) unverified.push("base");
  if (!quoteProbe.issuedByFactory) unverified.push("quote");
  return { kind: "ready", unverified };
}

/** True only when a transaction may be requested. */
export const canList = (state: PairState): state is Extract<PairState, { kind: "ready" }> => state.kind === "ready";

const sideName = (s: Side) => (s === "base" ? "base" : "quote");

/** One plain sentence for each blocking state, or `undefined` when nothing blocks. */
export function pairMessage(state: PairState): string | undefined {
  switch (state.kind) {
    case "incomplete":
      return "Choose a base token and a quote token.";
    case "zero-address":
      return `The ${sideName(state.side)} token address is the zero address.`;
    case "same-token":
      return "The base and quote tokens must be different.";
    case "probing":
      return "Reading the tokens from the chain…";
    case "not-a-token":
      return `The ${sideName(state.side)} address does not answer like an ERC-20 token (its decimals() cannot be read), so the order book would refuse it.`;
    case "wrong-decimals":
      return `The ${sideName(state.side)} token has ${state.decimals} decimals. The order book only accepts 18-decimal tokens.`;
    case "checking-duplicate":
      return "Checking whether this pair is already listed…";
    case "exists":
      return state.orientation === "same"
        ? "This pair is already listed in this orientation."
        : "This pair is already listed in the opposite orientation. A pair can be listed only once, in either order.";
    case "ready":
      return undefined;
  }
}
