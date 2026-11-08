import { describe, expect, it } from "vitest";
import { describeError } from "./errors";

describe("describeError", () => {
  it("recognises a wallet rejection by code, name or message, including when wrapped", () => {
    expect(describeError({ code: 4001, message: "x" }).kind).toBe("rejected");
    expect(describeError({ name: "UserRejectedRequestError" }).kind).toBe("rejected");
    expect(describeError({ message: "MetaMask Tx Signature: User denied transaction signature." }).kind).toBe("rejected");
    expect(describeError({ name: "ContractFunctionExecutionError", cause: { cause: { code: 4001 } } }).kind).toBe("rejected");
  });
  it("recognises an unknown chain (4902) with the details to add it", () => {
    const d = describeError({ cause: { code: 4902, message: "Unrecognized chain ID" } });
    expect(d.kind).toBe("unsupported-chain");
    expect(d.detail).toMatch(/31337/);
  });
  it("recognises an unreachable RPC", () => {
    expect(describeError({ name: "HttpRequestError", message: "HTTP request failed." }).kind).toBe("rpc");
    expect(describeError(new TypeError("Failed to fetch")).kind).toBe("rpc");
    expect(describeError({ cause: { message: "connect ECONNREFUSED 127.0.0.1:8545" } }).kind).toBe("rpc");
  });
  it("falls back to the short message, then the message, without inventing anything", () => {
    expect(describeError({ shortMessage: "Execution reverted." })).toEqual({ kind: "unknown", title: "Something went wrong", detail: "Execution reverted." });
    expect(describeError(new Error("boom")).detail).toBe("boom");
    expect(describeError(undefined).detail).toBe("Unknown error.");
    expect(describeError("plain string").kind).toBe("unknown");
  });
  it("stops on a self-referencing cause chain", () => {
    const loop: { message: string; cause?: unknown } = { message: "loop" };
    loop.cause = loop;
    expect(describeError(loop).kind).toBe("unknown");
  });
});

describe("describeTxError: InvalidMaxCount (P2-8B.3)", () => {
  it("is named and explained instead of shown as raw revert data", async () => {
    const { describeTxError } = await import("./errors");
    const e = Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName: "InvalidMaxCount" } }) });
    const d = describeTxError(e);
    expect(d).toMatchObject({ kind: "reverted", errorName: "InvalidMaxCount", title: "Invalid match count" });
    expect(d.detail).toMatch(/MAX_MATCHES_PER_TX/);
  });
});

describe("describeTxError: BookTooDeep covers stops too (P2-8B.4)", () => {
  it("mentions both a limit order and a stop-limit order, in plain words", async () => {
    const { describeTxError } = await import("./errors");
    const e = Object.assign(new Error("x"), { name: "ContractFunctionExecutionError", cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName: "BookTooDeep" } }) });
    const d = describeTxError(e);
    expect(d).toMatchObject({ kind: "reverted", errorName: "BookTooDeep" });
    expect(d.detail).toMatch(/stop-limit order/);
    expect(d.detail).toMatch(/limit order/);
  });
});
