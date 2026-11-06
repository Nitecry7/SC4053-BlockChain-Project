import { describe, expect, it } from "vitest";
import { DEFAULT_RPC_URL, resolveRpcUrl, resolveWalletConnectProjectId } from "./config";

describe("resolveRpcUrl", () => {
  it("defaults to local Anvil when unset or blank", () => {
    expect(resolveRpcUrl(undefined)).toBe(DEFAULT_RPC_URL);
    expect(resolveRpcUrl("  ")).toBe(DEFAULT_RPC_URL);
  });
  it("accepts http and https", () => {
    expect(resolveRpcUrl("http://127.0.0.1:8546")).toBe("http://127.0.0.1:8546");
    expect(resolveRpcUrl("https://rpc.example.test")).toBe("https://rpc.example.test");
  });
  it("rejects other schemes and garbage", () => {
    expect(() => resolveRpcUrl("file:///etc/passwd")).toThrow(/http or https/);
    expect(() => resolveRpcUrl("ws://127.0.0.1:8545")).toThrow(/http or https/);
    expect(() => resolveRpcUrl("not a url")).toThrow(/not a valid URL/);
  });
});

describe("resolveWalletConnectProjectId", () => {
  it("treats unset, blank and RainbowKit's placeholder as not configured", () => {
    expect(resolveWalletConnectProjectId(undefined)).toBe("");
    expect(resolveWalletConnectProjectId("")).toBe("");
    expect(resolveWalletConnectProjectId("YOUR_PROJECT_ID")).toBe("");
  });
  it("accepts a 32-character hex id", () => {
    const id = "0123456789abcdef0123456789abcdef";
    expect(resolveWalletConnectProjectId(` ${id} `)).toBe(id);
  });
  it("rejects anything else instead of passing it through", () => {
    expect(() => resolveWalletConnectProjectId("abc")).toThrow(/32-character/);
  });
});
