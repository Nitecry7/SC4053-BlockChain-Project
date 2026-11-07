import { isAddress, type Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A `?market=` value as an address, or undefined. A mixed-case value with a wrong checksum is refused. Symbols are never identities. */
export function parseMarketParam(raw: string | null | undefined): Address | undefined {
  if (!raw || !isAddress(raw) || raw.toLowerCase() === ZERO) return undefined;
  return raw as Address;
}

export type MarketStatus = "default" | "selected" | "invalid-format" | "not-registered" | "checking" | "check-failed";

/**
 * Which market a page shows. `requested` is the raw `?market=` value. A request is accepted if it is on the loaded
 * registry page, or MarketFactory.isMarket said so (`onChain`). Anything else falls back to the primary market (or the
 * first listed one) with a status that says why. While the on-chain check runs nothing is claimed.
 */
export function resolveMarket(input: {
  requested: string | null | undefined;
  primary: Address;
  markets: readonly { address: Address }[] | undefined;
  onChain: boolean | undefined;
  onChainFailed: boolean;
}): { choice: Address | undefined; status: MarketStatus } {
  const { requested, primary, markets, onChain, onChainFailed } = input;
  const fallback = markets?.find((m) => same(m.address, primary))?.address ?? markets?.[0]?.address;
  if (!requested) return { choice: fallback, status: "default" };
  const address = parseMarketParam(requested);
  if (!address) return { choice: fallback, status: "invalid-format" };
  const listed = markets?.find((m) => same(m.address, address));
  if (listed) return { choice: listed.address, status: "selected" };
  if (onChain === true) return { choice: address, status: "selected" };
  if (onChain === false) return { choice: fallback, status: "not-registered" };
  return { choice: fallback, status: onChainFailed ? "check-failed" : "checking" };
}

/** A same-site link that keeps the selected market. The primary market needs no parameter. */
export function marketHref(path: string, market: Address | undefined, primary: Address): string {
  if (!market || same(market, primary)) return path;
  return `${path}?market=${market}`;
}
