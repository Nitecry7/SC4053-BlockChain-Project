import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { marketHref, parseMarketParam, resolveMarket } from "./market-select";

const SEED = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const DTT = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as Address;
const OTHER = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9" as Address;
const markets = [{ address: SEED }, { address: DTT }];

describe("parseMarketParam", () => {
  it("accepts checksummed and lower-case addresses", () => {
    expect(parseMarketParam(DTT)).toBe(DTT);
    expect(parseMarketParam(DTT.toLowerCase())).toBe(DTT.toLowerCase());
  });
  it("rejects missing, empty, malformed, zero and bad-checksum values", () => {
    expect(parseMarketParam(null)).toBeUndefined();
    expect(parseMarketParam(undefined)).toBeUndefined();
    expect(parseMarketParam("")).toBeUndefined();
    expect(parseMarketParam("DTT")).toBeUndefined();
    expect(parseMarketParam("0x123")).toBeUndefined();
    expect(parseMarketParam("0x0000000000000000000000000000000000000000")).toBeUndefined();
    const bad = DTT.slice(0, 5) + DTT.slice(5, 6).toUpperCase() + DTT.slice(6).replace(/[a-f]/g, (c) => c.toUpperCase());
    if (bad !== DTT) expect(parseMarketParam(bad)).toBeUndefined();
  });
});

describe("resolveMarket", () => {
  const base = { primary: SEED, markets, onChain: undefined as boolean | undefined, onChainFailed: false };
  it("uses the primary market when nothing is requested", () => {
    expect(resolveMarket({ ...base, requested: null })).toEqual({ choice: SEED, status: "default" });
  });
  it("selects a market on the first page without an on-chain check", () => {
    expect(resolveMarket({ ...base, requested: DTT.toLowerCase() })).toEqual({ choice: DTT, status: "selected" });
  });
  it("keeps the canonical registry spelling of the address", () => {
    expect(resolveMarket({ ...base, requested: DTT.toLowerCase() }).choice).toBe(DTT);
  });
  it("accepts an off-page market once the chain confirms it", () => {
    expect(resolveMarket({ ...base, requested: OTHER, onChain: true })).toEqual({ choice: OTHER, status: "selected" });
  });
  it("falls back to the primary and says why for a malformed request", () => {
    expect(resolveMarket({ ...base, requested: "DTT" })).toEqual({ choice: SEED, status: "invalid-format" });
    expect(resolveMarket({ ...base, requested: "0x0000000000000000000000000000000000000000" })).toEqual({ choice: SEED, status: "invalid-format" });
  });
  it("falls back for an address the chain says is not a market", () => {
    expect(resolveMarket({ ...base, requested: OTHER, onChain: false })).toEqual({ choice: SEED, status: "not-registered" });
  });
  it("claims nothing while the check is running", () => {
    expect(resolveMarket({ ...base, requested: OTHER, onChain: undefined })).toEqual({ choice: SEED, status: "checking" });
  });
  it("reports a failed check separately from a refusal", () => {
    expect(resolveMarket({ ...base, requested: OTHER, onChainFailed: true })).toEqual({ choice: SEED, status: "check-failed" });
  });
  it("falls back to the first listed market when the primary is not listed", () => {
    expect(resolveMarket({ ...base, primary: OTHER, requested: null })).toEqual({ choice: SEED, status: "default" });
  });
  it("has no choice while the registry is unknown or empty", () => {
    expect(resolveMarket({ ...base, markets: undefined, requested: null }).choice).toBeUndefined();
    expect(resolveMarket({ ...base, markets: [], requested: null }).choice).toBeUndefined();
  });
});

describe("marketHref", () => {
  it("keeps the path clean for the primary market and carries any other", () => {
    expect(marketHref("/", SEED, SEED)).toBe("/");
    expect(marketHref("/trade", SEED.toLowerCase() as Address, SEED)).toBe("/trade");
    expect(marketHref("/", DTT, SEED)).toBe(`/?market=${DTT}`);
    expect(marketHref("/trade", undefined, SEED)).toBe("/trade");
  });
});
