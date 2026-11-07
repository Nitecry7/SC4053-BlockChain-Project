import { describe, expect, it } from "vitest";
import { classifyDeployment, getNetworkStatus } from "./network-status";

const SUPPORTED = [31337] as const;

describe("getNetworkStatus", () => {
  it("is disconnected without a wallet or chain", () => {
    expect(getNetworkStatus({ status: "disconnected", chainId: undefined, supportedChainIds: SUPPORTED })).toEqual({ kind: "disconnected" });
    expect(getNetworkStatus({ status: "connected", chainId: undefined, supportedChainIds: SUPPORTED })).toEqual({ kind: "disconnected" });
  });
  it("reports connecting while the wallet reconnects", () => {
    expect(getNetworkStatus({ status: "reconnecting", chainId: 31337, supportedChainIds: SUPPORTED }).kind).toBe("connecting");
    expect(getNetworkStatus({ status: "connecting", chainId: undefined, supportedChainIds: SUPPORTED }).kind).toBe("connecting");
  });
  it("flags a wrong network with the expected chain", () => {
    expect(getNetworkStatus({ status: "connected", chainId: 1, supportedChainIds: SUPPORTED })).toEqual({
      kind: "wrong-network",
      chainId: 1,
      expectedChainId: 31337,
    });
  });
  it("is ready on a supported chain", () => {
    expect(getNetworkStatus({ status: "connected", chainId: 31337, supportedChainIds: SUPPORTED })).toEqual({ kind: "ready", chainId: 31337 });
  });
  it("throws when nothing is supported (a configuration bug)", () => {
    expect(() => getNetworkStatus({ status: "connected", chainId: 1, supportedChainIds: [] })).toThrow();
  });
});

describe("classifyDeployment", () => {
  const base = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";
  const quote = "0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968";
  const ok = {
    loading: false,
    failed: false,
    checks: [
      { name: "TokenFactory", address: "0x1", code: "0x6080" },
      { name: "Market", address: "0x2", code: "0x6080" },
    ],
    marketBase: base.toLowerCase(),
    marketQuote: quote,
    expectedBase: base,
    expectedQuote: quote,
  };

  it("is ok when every contract has code and the market trades the exported tokens (case-insensitive)", () => {
    expect(classifyDeployment(ok)).toEqual({ kind: "ok" });
  });
  it("reports an unreachable RPC before anything else", () => {
    expect(classifyDeployment({ ...ok, failed: true, loading: true })).toEqual({ kind: "unreachable" });
  });
  it("is checking while loading or before the market reads arrive", () => {
    expect(classifyDeployment({ ...ok, loading: true }).kind).toBe("checking");
    expect(classifyDeployment({ ...ok, marketBase: undefined }).kind).toBe("checking");
  });
  it("lists every contract without code (a fresh or restarted chain)", () => {
    const fresh = { ...ok, checks: ok.checks.map((c) => ({ ...c, code: "0x" })) };
    expect(classifyDeployment(fresh)).toEqual({ kind: "missing", missing: ["TokenFactory", "Market"] });
    const partial = { ...ok, checks: [ok.checks[0]!, { ...ok.checks[1]!, code: undefined }] };
    expect(classifyDeployment(partial)).toEqual({ kind: "missing", missing: ["Market"] });
  });
  it("never calls an empty check list ok", () => {
    expect(classifyDeployment({ ...ok, checks: [] }).kind).toBe("checking");
  });
  it("blames the contract, not the RPC, when the market's reads revert", () => {
    const d = classifyDeployment({ ...ok, marketReadFailed: true, marketBase: undefined, marketQuote: undefined });
    expect(d.kind).toBe("mismatch");
  });
  it("reports missing code before any mismatch, and waits for both token reads", () => {
    const fresh = { ...ok, checks: ok.checks.map((c) => ({ ...c, code: "0x" })), marketQuote: base };
    expect(classifyDeployment(fresh).kind).toBe("missing");
    expect(classifyDeployment({ ...ok, marketQuote: undefined }).kind).toBe("checking");
  });
  it("detects a market that trades other tokens", () => {
    expect(classifyDeployment({ ...ok, marketQuote: base }).kind).toBe("mismatch");
  });
});

describe("classifyDeployment: rpcOffline (P2-8A.2)", () => {
  const ok = {
    loading: false,
    failed: false,
    checks: [{ name: "TokenFactory", address: "0x1", code: "0x60" }],
    marketBase: "0xa",
    marketQuote: "0xb",
    expectedBase: "0xa",
    expectedQuote: "0xb",
  };
  it("an offline or unverified RPC is unreachable even if every cached read says ok", () => {
    expect(classifyDeployment({ ...ok })).toEqual({ kind: "ok" });
    expect(classifyDeployment({ ...ok, rpcOffline: true })).toEqual({ kind: "unreachable" });
    expect(classifyDeployment({ ...ok, rpcOffline: false })).toEqual({ kind: "ok" });
  });
});
