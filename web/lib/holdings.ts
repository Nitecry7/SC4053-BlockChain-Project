import type { Address } from "viem";

const key = (a: string) => a.toLowerCase();

/** Every address once (case-insensitive), in first-seen order across the lists. */
export function mergeTokenAddresses(...lists: (readonly Address[] | undefined)[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const list of lists) {
    for (const a of list ?? []) {
      if (seen.has(key(a))) continue;
      seen.add(key(a));
      out.push(a);
    }
  }
  return out;
}

export type HoldingDetail = { address: Address; name?: string; symbol?: string; decimals?: number; issuedByFactory: boolean };
export type Holding = {
  address: Address;
  balance: bigint | undefined;
  symbol: string | undefined;
  name: string | undefined;
  decimals: number | undefined;
  provenance: "issued" | "external" | "unknown";
};

/**
 * One row per token: the account's balance of that token alone (balances of different tokens are never added). Zero
 * balances are left out unless `includeZero`. Details are matched by address. A balance that was not read stays
 * `undefined`, not zero. Sorted by symbol (address when the symbol is unknown), never by amount.
 */
export function buildHoldings(input: {
  addresses: readonly Address[];
  balances: readonly bigint[] | undefined;
  details: readonly HoldingDetail[] | undefined;
  includeZero: boolean;
}): Holding[] {
  const { addresses, balances, details, includeZero } = input;
  const byAddress = new Map((details ?? []).map((d) => [key(d.address), d]));
  const rows: Holding[] = [];
  addresses.forEach((address, i) => {
    const balance = balances?.[i];
    if (balance === undefined && !includeZero) return;
    if (balance === 0n && !includeZero) return;
    if (balances !== undefined && i >= balances.length) return;
    const d = byAddress.get(key(address));
    rows.push({
      address,
      balance,
      symbol: d?.symbol,
      name: d?.name,
      decimals: d?.decimals,
      provenance: d ? (d.issuedByFactory ? "issued" : "external") : "unknown",
    });
  });
  return rows.sort((x, y) => (x.symbol ?? "￿").localeCompare(y.symbol ?? "￿") || x.address.localeCompare(y.address));
}

/** A cache key that two accounts or chains can never share. */
export function holdingsKey(account: Address | undefined, chainId: number): string {
  return `${chainId}:${account ? key(account) : "none"}`;
}

/** Most tokens one wallet overview reads per refresh (registries are capped separately). */
export const MAX_HOLDING_TOKENS = 500;
