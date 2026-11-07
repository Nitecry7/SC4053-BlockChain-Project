import { describe, expect, it } from "vitest";
import { createPublicClient, custom, encodeErrorResult, RpcRequestError, type Abi, type Address, type Hex } from "viem";
import { marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "@/lib/contracts/abis";
import { describeTxError } from "./errors";
import { viemDeps } from "./order-runner";
import { failureCopy, successCopy, waitingCopy, WALLET_WAIT_MESSAGE } from "./wallet-prompt";
import { ALICE, MARKET_FACTORY, NTU, SGDX, TOKEN_FACTORY } from "./test-logs";

// A synthetic RPC that reverts with exact revert data; the ABI decoding is real viem (see tx-errors.test.ts).
function simulateReverting(data: Hex, call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) {
  const client = createPublicClient({
    transport: custom({
      request: async ({ method }) => {
        if (method === "eth_call" || method === "eth_estimateGas") throw new RpcRequestError({ body: {}, url: "synthetic", error: { code: 3, message: "execution reverted", data } });
        return "0x1";
      },
    }),
  });
  return viemDeps(client, async () => "0x").simulate(call, ALICE).then(() => undefined, (e: unknown) => e);
}

const createToken = { address: TOKEN_FACTORY, abi: tokenFactoryAbi as Abi, functionName: "createToken", args: ["N", "S", 1n] };
const createMarket = { address: MARKET_FACTORY, abi: marketFactoryAbi as Abi, functionName: "createMarket", args: [NTU, SGDX] };

describe("createToken reverts are named", () => {
  it.each(["EmptyName", "EmptySymbol", "ZeroSupply", "SupplyTooLarge"] as const)("%s", async (errorName) => {
    const err = await simulateReverting(encodeErrorResult({ abi: tokenFactoryAbi, errorName }), createToken);
    const d = describeTxError(err);
    expect(d).toMatchObject({ kind: "reverted", errorName });
    expect(d.title.length).toBeGreaterThan(8);
  });
});

describe("createMarket reverts are named, including errors that come from the OrderBook constructor", () => {
  it("MarketExists carries the existing market's address", async () => {
    const existing = "0xCafac3dD18aC6c6e92c921884f9E4176737C052c" as const;
    const err = await simulateReverting(encodeErrorResult({ abi: marketFactoryAbi, errorName: "MarketExists", args: [existing] }), createMarket);
    expect(describeTxError(err)).toMatchObject({ kind: "reverted", errorName: "MarketExists" });
  });

  it("InvalidTokens and UnsupportedDecimals are NOT in MarketFactory's own ABI, yet are named (merged error definitions)", async () => {
    const own = (marketFactoryAbi as readonly { type: string; name?: string }[]).filter((i) => i.type === "error").map((i) => i.name);
    expect(own).not.toContain("InvalidTokens");
    expect(own).not.toContain("UnsupportedDecimals");
    const a = await simulateReverting(encodeErrorResult({ abi: orderBookAbi, errorName: "InvalidTokens" }), createMarket);
    const b = await simulateReverting(encodeErrorResult({ abi: orderBookAbi, errorName: "UnsupportedDecimals" }), createMarket);
    expect(describeTxError(a)).toMatchObject({ kind: "reverted", errorName: "InvalidTokens" });
    expect(describeTxError(b)).toMatchObject({ kind: "reverted", errorName: "UnsupportedDecimals" });
  });

  it("a revert with no data (the address is not a token) is a revert without an invented name", async () => {
    const d = describeTxError(await simulateReverting("0x", createMarket));
    expect(d.kind).toBe("reverted");
    expect(d.errorName).toBeUndefined();
  });

  it("the P2-5 order and token errors are still named", async () => {
    const e = await simulateReverting(encodeErrorResult({ abi: orderBookAbi, errorName: "InvalidLotSize" }), createMarket);
    expect(describeTxError(e)).toMatchObject({ errorName: "InvalidLotSize" });
  });
});

describe("wallet guidance for token creation and market listing", () => {
  it.each(["token", "market"] as const)("%s uses the same pending message, distinct titles and a rejection that names the request", (kind) => {
    const w = waitingCopy(kind, 0);
    expect(w.state).toBe("waiting");
    if (w.state === "waiting") expect(w.body).toBe(WALLET_WAIT_MESSAGE);
    expect(w.title).toMatch(kind === "token" ? /Token creation/ : /Market listing/);
    expect(failureCopy(kind, { kind: "rejected", title: "", detail: "" }).title).toMatch(kind === "token" ? /token creation/ : /market listing/);
    expect(successCopy(kind).title).toMatch(kind === "token" ? /Token created/ : /Market listed/);
  });
});
