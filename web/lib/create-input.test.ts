import { describe, expect, it } from "vitest";
import { NAME_MAX_CHARS, SYMBOL_MAX_CHARS, validateTokenInput, wholeTokens, type TokenInput } from "./create-input";

const E18 = 10n ** 18n;
const MAX = 10n ** 27n; // TokenFactory.MAX_SUPPLY
const LOT = 10n ** 9n; // OrderBook.LOT_SIZE

const base = (over: Partial<TokenInput> = {}): TokenInput => ({ name: "Demo Coin", symbol: "DMO", supplyText: "1000000", maxSupply: MAX, lotSize: LOT, ...over });
const errs = (over: Partial<TokenInput>) => {
  const r = validateTokenInput(base(over));
  if (r.ok) throw new Error("expected a validation error");
  return r.errors;
};

describe("validateTokenInput: the contract's own rules", () => {
  it("converts a human supply to exact raw units (18 decimals)", () => {
    const r = validateTokenInput(base());
    expect(r).toEqual({ ok: true, token: { name: "Demo Coin", symbol: "DMO", supply: 1_000_000n * E18, decimals: 18, lotDust: 0n } });
  });

  it("accepts exactly MAX_SUPPLY (1,000,000,000 tokens) and rejects one raw unit more", () => {
    expect(validateTokenInput(base({ supplyText: "1000000000" })).ok).toBe(true);
    expect(errs({ supplyText: "1000000000.000000000000000001" }).supply?.code).toBe("above-max");
    expect(errs({ supplyText: "1000000001" }).supply?.code).toBe("above-max");
  });

  it("accepts the smallest non-zero supply, one raw unit, and flags it as untradable dust", () => {
    const r = validateTokenInput(base({ supplyText: "0.000000000000000001" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.token.supply).toBe(1n);
      expect(r.token.lotDust).toBe(1n);
    }
  });

  it("a supply that is a whole number of lots has no dust; one that is not, has", () => {
    const whole = validateTokenInput(base({ supplyText: "1.000000001" }));
    const dusty = validateTokenInput(base({ supplyText: "1.0000000015" }));
    expect(whole.ok && whole.token.lotDust).toBe(0n);
    expect(dusty.ok && dusty.token.lotDust).toBe(5n * 10n ** 8n);
  });

  it("reads the cap from the chain, not from a constant", () => {
    expect(errs({ supplyText: "11", maxSupply: 10n * E18 }).supply?.code).toBe("above-max");
    expect(validateTokenInput(base({ supplyText: "10", maxSupply: 10n * E18 })).ok).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["abc", "malformed"],
    ["-1", "malformed"],
    ["1e3", "malformed"],
    ["1,000", "malformed"],
    [" 1", "malformed"],
    ["1.", "malformed"],
    ["0.0000000000000000001", "too-many-decimals"],
    ["0", "zero"],
    ["0.0", "zero"],
  ])("rejects supply text %j as %s", (text, code) => {
    expect(errs({ supplyText: text }).supply?.code).toBe(code);
  });

  it("rejects a supply above uint256 as too large or above the cap, never as a number", () => {
    const huge = "9".repeat(80);
    const e = errs({ supplyText: huge }).supply?.code;
    expect(["too-large", "above-max"]).toContain(e);
  });
});

describe("validateTokenInput: name and symbol (UI guard rails, stricter than the contract)", () => {
  it("rejects empty, whitespace-only and edge-space text with distinct codes", () => {
    expect(errs({ name: "" }).name?.code).toBe("empty");
    expect(errs({ symbol: "" }).symbol?.code).toBe("empty");
    expect(errs({ name: "   " }).name?.code).toBe("whitespace-only");
    expect(errs({ symbol: " X" }).symbol?.code).toBe("edge-space");
    expect(errs({ name: "Demo " }).name?.code).toBe("edge-space");
  });

  it("allows single interior spaces and non-ASCII letters", () => {
    expect(validateTokenInput(base({ name: "Singapore Dollar X", symbol: "SGDx" })).ok).toBe(true);
    expect(validateTokenInput(base({ name: "Ünïcode Cöin", symbol: "ÜNI" })).ok).toBe(true);
  });

  it("enforces the length caps by characters, accepting exactly the cap", () => {
    expect(validateTokenInput(base({ name: "N".repeat(NAME_MAX_CHARS), symbol: "S".repeat(SYMBOL_MAX_CHARS) })).ok).toBe(true);
    expect(errs({ name: "N".repeat(NAME_MAX_CHARS + 1) }).name?.code).toBe("too-long");
    expect(errs({ symbol: "S".repeat(SYMBOL_MAX_CHARS + 1) }).symbol?.code).toBe("too-long");
  });

  it.each([
    ["control character", "Demo\u0007Coin"],
    ["newline", "Demo\nCoin"],
    ["right-to-left override", "Demo‮nioC"],
    ["bidi isolate", "Demo⁦Coin"],
    ["zero-width space", "Demo​Coin"],
    ["byte order mark", "﻿Demo"],
    ["soft hyphen", "Demo­Coin"],
    ["no-break space inside", "Demo Coin"],
    ["hangul filler", "Demoㅤ"],
    ["braille blank", "Demo⠀"],
    ["line separator", "Demo Coin"],
    ["tag character", "Demo\u{E0041}"],
    ["lone surrogate", "A\uD800B"],
  ])("rejects a %s", (_label, text) => {
    expect(errs({ name: text }).name?.code).toMatch(/bad-character|edge-space/);
  });

  it("reports every problem at once", () => {
    const e = errs({ name: "", symbol: "S".repeat(30), supplyText: "x" });
    expect([e.name?.code, e.symbol?.code, e.supply?.code]).toEqual(["empty", "too-long", "malformed"]);
  });

  it("does not trim or alter what it accepts", () => {
    const r = validateTokenInput(base({ name: "A  B", symbol: "a-b" }));
    expect(r.ok && [r.token.name, r.token.symbol]).toEqual(["A  B", "a-b"]);
  });
});

describe("wholeTokens", () => {
  it("states MAX_SUPPLY as one billion tokens", () => {
    expect(wholeTokens(MAX)).toBe(1_000_000_000n);
  });
});
