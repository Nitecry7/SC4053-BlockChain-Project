import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { buildHoldings, holdingsKey, mergeTokenAddresses } from "./holdings";

const a = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const b = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as Address;
const c = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9" as Address;
const detail = (address: Address, symbol: string, issuedByFactory = true) => ({ address, name: `${symbol} token`, symbol, decimals: 18, issuedByFactory });

describe("mergeTokenAddresses", () => {
  it("dedupes by address ignoring case and keeps first-seen order", () => {
    expect(mergeTokenAddresses([a, b], [b.toLowerCase() as Address, c], [a.toLowerCase() as Address])).toEqual([a, b, c]);
  });
  it("copes with empty and undefined lists", () => {
    expect(mergeTokenAddresses(undefined, [], [a])).toEqual([a]);
    expect(mergeTokenAddresses()).toEqual([]);
  });
});

describe("buildHoldings", () => {
  const addresses = [a, b, c];
  const details = [detail(a, "NTU"), detail(b, "DTT"), detail(c, "EXT", false)];
  it("hides zero balances by default and labels provenance", () => {
    const rows = buildHoldings({ addresses, balances: [5n, 0n, 7n], details, includeZero: false });
    expect(rows.map((r) => r.symbol)).toEqual(["EXT", "NTU"]);
    expect(rows.find((r) => r.symbol === "EXT")?.provenance).toBe("external");
    expect(rows.find((r) => r.symbol === "NTU")?.provenance).toBe("issued");
  });
  it("includes zero balances when asked and sorts by symbol then address", () => {
    const rows = buildHoldings({ addresses, balances: [5n, 0n, 7n], details, includeZero: true });
    expect(rows.map((r) => r.symbol)).toEqual(["DTT", "EXT", "NTU"]);
  });
  it("never sums balances across tokens", () => {
    const rows = buildHoldings({ addresses, balances: [5n, 2n, 7n], details, includeZero: false });
    expect(rows.map((r) => r.balance).sort()).toEqual([2n, 5n, 7n]);
    expect(rows).toHaveLength(3);
  });
  it("keeps an unread balance undefined instead of showing zero", () => {
    const rows = buildHoldings({ addresses, balances: undefined, details, includeZero: true });
    expect(rows.every((r) => r.balance === undefined)).toBe(true);
    expect(buildHoldings({ addresses, balances: undefined, details, includeZero: false })).toEqual([]);
  });
  it("tolerates missing details (token shown by address) and length mismatch", () => {
    const rows = buildHoldings({ addresses, balances: [1n, 1n], details: undefined, includeZero: false });
    expect(rows.map((r) => r.address)).toEqual([a, b].sort((x, y) => x.localeCompare(y)));
    expect(rows[0]!.symbol).toBeUndefined();
    expect(buildHoldings({ addresses, balances: [1n], details, includeZero: false })).toHaveLength(1);
  });
  it("matches details by address, not by position", () => {
    const rows = buildHoldings({ addresses: [a, b], balances: [1n, 1n], details: [detail(b, "DTT"), detail(a, "NTU")], includeZero: false });
    expect(rows.find((r) => r.address === a)?.symbol).toBe("NTU");
  });
});

describe("holdingsKey", () => {
  it("never shares a key between accounts or chains, and ignores address case", () => {
    expect(holdingsKey(a, 31337)).not.toBe(holdingsKey(b, 31337));
    expect(holdingsKey(a, 31337)).not.toBe(holdingsKey(a, 1));
    expect(holdingsKey(a, 31337)).toBe(holdingsKey(a.toLowerCase() as Address, 31337));
    expect(holdingsKey(undefined, 31337)).not.toBe(holdingsKey(a, 31337));
  });
});
