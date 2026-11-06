import { describe, expect, it } from "vitest";
import { canList, classifyPair, pairMessage, parseAddressInput, type ExistingMarket, type TokenProbe } from "./create-plan";

const A = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be" as const; // NTU
const B = "0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968" as const; // SGDx
const MKT = "0xCafac3dD18aC6c6e92c921884f9E4176737C052c" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ok = (issuedByFactory = true, decimals = 18): TokenProbe => ({ status: "ok", decimals, issuedByFactory });
const existing = (base: string, quote: string): ExistingMarket => ({ market: MKT, base: base as never, quote: quote as never });

describe("parseAddressInput", () => {
  it("accepts a checksummed and a lower-case address", () => {
    expect(parseAddressInput(A)).toEqual({ ok: true, address: A });
    expect(parseAddressInput(A.toLowerCase()).ok).toBe(true);
  });
  it("refuses empty, malformed, wrong-checksum and zero", () => {
    expect(parseAddressInput("")).toMatchObject({ ok: false, code: "empty" });
    expect(parseAddressInput("0x123")).toMatchObject({ ok: false, code: "malformed" });
    expect(parseAddressInput("not an address")).toMatchObject({ ok: false, code: "malformed" });
    // flip the case of one letter in a checksummed address: the checksum no longer matches
    const bad = A.replace("a16E", "A16E");
    expect(parseAddressInput(bad)).toMatchObject({ ok: false, code: "malformed" });
    expect(parseAddressInput(ZERO)).toMatchObject({ ok: false, code: "zero" });
  });
});

describe("classifyPair", () => {
  const ready = { base: A, quote: B, baseProbe: ok(), quoteProbe: ok(), existing: null } as const;

  it("is ready for two distinct 18-decimal TokenFactory tokens with no market", () => {
    expect(classifyPair(ready)).toEqual({ kind: "ready", unverified: [] });
  });

  it("is incomplete until both sides are chosen", () => {
    expect(classifyPair({ ...ready, base: undefined })).toEqual({ kind: "incomplete" });
    expect(classifyPair({ ...ready, quote: undefined })).toEqual({ kind: "incomplete" });
  });

  it("reports the zero address and a repeated token before reading anything", () => {
    expect(classifyPair({ ...ready, base: ZERO, baseProbe: undefined })).toEqual({ kind: "zero-address", side: "base" });
    expect(classifyPair({ ...ready, quote: ZERO, quoteProbe: undefined })).toEqual({ kind: "zero-address", side: "quote" });
    expect(classifyPair({ ...ready, quote: A.toLowerCase() as never })).toEqual({ kind: "same-token" });
  });

  it("waits for the reads, then reports an address that is not a token", () => {
    expect(classifyPair({ ...ready, baseProbe: undefined })).toEqual({ kind: "probing" });
    expect(classifyPair({ ...ready, quoteProbe: { status: "loading" } })).toEqual({ kind: "probing" });
    expect(classifyPair({ ...ready, baseProbe: { status: "not-a-token" } })).toEqual({ kind: "not-a-token", side: "base" });
    expect(classifyPair({ ...ready, quoteProbe: { status: "not-a-token" } })).toEqual({ kind: "not-a-token", side: "quote" });
  });

  it("refuses a token whose decimals are not 18, naming the side and the value", () => {
    expect(classifyPair({ ...ready, quoteProbe: ok(true, 6) })).toEqual({ kind: "wrong-decimals", side: "quote", decimals: 6 });
    expect(classifyPair({ ...ready, baseProbe: ok(true, 8) })).toEqual({ kind: "wrong-decimals", side: "base", decimals: 8 });
    expect(classifyPair({ ...ready, baseProbe: ok(true, 19) })).toMatchObject({ kind: "wrong-decimals", decimals: 19 });
  });

  it("detects an existing market in the same orientation", () => {
    expect(classifyPair({ ...ready, existing: existing(A, B) })).toEqual({ kind: "exists", market: MKT, orientation: "same", existingBase: A, existingQuote: B });
  });

  it("detects the REVERSED pair as a duplicate and reports the existing orientation", () => {
    const s = classifyPair({ ...ready, base: B, quote: A, existing: existing(A, B) });
    expect(s).toEqual({ kind: "exists", market: MKT, orientation: "reversed", existingBase: A, existingQuote: B });
    expect(canList(s)).toBe(false);
  });

  it("compares addresses case-insensitively", () => {
    expect(classifyPair({ ...ready, existing: existing(A.toLowerCase(), B.toLowerCase()) })).toMatchObject({ kind: "exists", orientation: "same" });
  });

  it("does not offer a listing while the duplicate lookup is still loading", () => {
    const s = classifyPair({ ...ready, existing: undefined });
    expect(s).toEqual({ kind: "checking-duplicate" });
    expect(canList(s)).toBe(false);
  });

  it("allows an external token but marks which side is not from TokenFactory", () => {
    expect(classifyPair({ ...ready, baseProbe: ok(false) })).toEqual({ kind: "ready", unverified: ["base"] });
    expect(classifyPair({ ...ready, baseProbe: ok(false), quoteProbe: ok(false) })).toEqual({ kind: "ready", unverified: ["base", "quote"] });
  });

  it("a token that cannot be read blocks before the duplicate lookup matters", () => {
    expect(classifyPair({ ...ready, baseProbe: { status: "not-a-token" }, existing: existing(A, B) })).toEqual({ kind: "not-a-token", side: "base" });
  });

  it("only the ready state allows a transaction", () => {
    const states = [
      classifyPair({ ...ready, base: undefined }),
      classifyPair({ ...ready, existing: existing(A, B) }),
      classifyPair({ ...ready, quoteProbe: ok(true, 6) }),
      classifyPair(ready),
    ];
    expect(states.map(canList)).toEqual([false, false, false, true]);
  });
});

describe("pairMessage", () => {
  it("explains every blocking state and says nothing when ready", () => {
    expect(pairMessage({ kind: "ready", unverified: [] })).toBeUndefined();
    expect(pairMessage({ kind: "wrong-decimals", side: "quote", decimals: 6 })).toMatch(/6 decimals.*18-decimal/);
    expect(pairMessage({ kind: "exists", market: MKT, orientation: "reversed", existingBase: A, existingQuote: B })).toMatch(/opposite orientation/);
    expect(pairMessage({ kind: "exists", market: MKT, orientation: "same", existingBase: A, existingQuote: B })).toMatch(/already listed in this orientation/);
    expect(pairMessage({ kind: "not-a-token", side: "base" })).toMatch(/does not answer like an ERC-20/);
    expect(pairMessage({ kind: "same-token" })).toMatch(/different/);
  });
});
