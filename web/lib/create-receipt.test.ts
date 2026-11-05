import { describe, expect, it } from "vitest";
import { decodeMarketCreated, decodeTokenCreated } from "./receipt";
import { ALICE, BOB, EVIL, MARKET_FACTORY, NEW_MARKET, NEW_TOKEN, NTU, SGDX, TOKEN_FACTORY, dec, marketCreated, resetLogIndex, tokenCreated, transfer } from "./test-logs";

// SYNTHETIC logs built with viem's encoders; the chain-backed equivalents are in creation.integration.test.ts.

describe("decodeTokenCreated", () => {
  it("reads the new token's address and the issued fields from the factory's own event", () => {
    resetLogIndex();
    const logs = [transfer(NEW_TOKEN, "0x0000000000000000000000000000000000000000", ALICE, dec("1000000")), tokenCreated(TOKEN_FACTORY, NEW_TOKEN, ALICE, "Demo Coin", "DMO", dec("1000000"))];
    const r = decodeTokenCreated({ logs, factory: TOKEN_FACTORY, creator: ALICE });
    expect(r).toEqual({ ok: true, event: { token: NEW_TOKEN, creator: ALICE, name: "Demo Coin", symbol: "DMO", initialSupply: dec("1000000") } });
  });

  it("ignores a TokenCreated emitted by any other contract (a forged event)", () => {
    resetLogIndex();
    const logs = [tokenCreated(EVIL, NEW_TOKEN, ALICE, "Fake", "FAKE", 1n)];
    expect(decodeTokenCreated({ logs, factory: TOKEN_FACTORY, creator: ALICE })).toEqual({ ok: false, reason: "none" });
  });

  it("ignores an event created by a different account", () => {
    resetLogIndex();
    const logs = [tokenCreated(TOKEN_FACTORY, NEW_TOKEN, BOB, "Demo", "DMO", 1n)];
    expect(decodeTokenCreated({ logs, factory: TOKEN_FACTORY, creator: ALICE })).toEqual({ ok: false, reason: "none" });
  });

  it("refuses to guess when there is more than one event for the creator", () => {
    resetLogIndex();
    const logs = [tokenCreated(TOKEN_FACTORY, NEW_TOKEN, ALICE, "A", "A", 1n), tokenCreated(TOKEN_FACTORY, NTU, ALICE, "B", "B", 2n)];
    expect(decodeTokenCreated({ logs, factory: TOKEN_FACTORY, creator: ALICE })).toEqual({ ok: false, reason: "multiple" });
  });

  it("reports none for an empty receipt", () => {
    expect(decodeTokenCreated({ logs: [], factory: TOKEN_FACTORY, creator: ALICE })).toEqual({ ok: false, reason: "none" });
  });

  it("compares the creator case-insensitively", () => {
    resetLogIndex();
    const logs = [tokenCreated(TOKEN_FACTORY, NEW_TOKEN, ALICE, "Demo", "DMO", 1n)];
    expect(decodeTokenCreated({ logs, factory: TOKEN_FACTORY, creator: ALICE.toLowerCase() as typeof ALICE }).ok).toBe(true);
  });
});

describe("decodeMarketCreated", () => {
  it("reads the new market, its base and its quote from the factory's own event", () => {
    resetLogIndex();
    const logs = [marketCreated(MARKET_FACTORY, NEW_MARKET, NTU, SGDX, ALICE)];
    expect(decodeMarketCreated({ logs, factory: MARKET_FACTORY, creator: ALICE })).toEqual({ ok: true, event: { market: NEW_MARKET, base: NTU, quote: SGDX, creator: ALICE } });
  });

  it("keeps base and quote in the order the event states them (orientation)", () => {
    resetLogIndex();
    const r = decodeMarketCreated({ logs: [marketCreated(MARKET_FACTORY, NEW_MARKET, SGDX, NTU, ALICE)], factory: MARKET_FACTORY, creator: ALICE });
    expect(r.ok && [r.event.base, r.event.quote]).toEqual([SGDX, NTU]);
  });

  it("ignores forged events, other creators, and refuses duplicates", () => {
    resetLogIndex();
    expect(decodeMarketCreated({ logs: [marketCreated(EVIL, NEW_MARKET, NTU, SGDX, ALICE)], factory: MARKET_FACTORY, creator: ALICE })).toEqual({ ok: false, reason: "none" });
    resetLogIndex();
    expect(decodeMarketCreated({ logs: [marketCreated(MARKET_FACTORY, NEW_MARKET, NTU, SGDX, BOB)], factory: MARKET_FACTORY, creator: ALICE })).toEqual({ ok: false, reason: "none" });
    resetLogIndex();
    const two = [marketCreated(MARKET_FACTORY, NEW_MARKET, NTU, SGDX, ALICE), marketCreated(MARKET_FACTORY, NEW_TOKEN, SGDX, NTU, ALICE)];
    expect(decodeMarketCreated({ logs: two, factory: MARKET_FACTORY, creator: ALICE })).toEqual({ ok: false, reason: "multiple" });
  });
});
