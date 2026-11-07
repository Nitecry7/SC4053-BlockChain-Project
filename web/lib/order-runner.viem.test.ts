import { describe, expect, it } from "vitest";
import { createPublicClient, custom, encodeErrorResult, RpcRequestError } from "viem";
import { demoTokenAbi, orderBookAbi } from "@/lib/contracts/abis";
import { describeTxError } from "./errors";
import { viemDeps } from "./order-runner";
import { ALICE, MARKET } from "./test-logs";

// Regression for a defect found by the real-chain integration test: the order book re-raises the TOKEN's custom errors
// (ERC20InsufficientAllowance, ERC20InsufficientBalance) through SafeERC20, but a simulation decoded only against the
// order book's ABI cannot name them. The RPC here is a synthetic transport that returns exactly the revert data the
// real chain returned (selector 0xfb8f41b2); the decoding is real viem.
function depsReverting(data: `0x${string}`) {
  const client = createPublicClient({
    transport: custom({
      request: async ({ method }) => {
        if (method === "eth_call" || method === "eth_estimateGas")
          throw new RpcRequestError({ body: {}, url: "synthetic", error: { code: 3, message: "execution reverted", data } });
        return "0x1";
      },
    }),
  });
  return viemDeps(client, async () => "0x");
}

const place = { address: MARKET, abi: orderBookAbi, functionName: "placeLimitOrder", args: [0, 1n, 1n] } as never;

describe("viemDeps.simulate decodes token errors re-raised by the order book", () => {
  it("names ERC20InsufficientAllowance", async () => {
    const data = encodeErrorResult({ abi: demoTokenAbi, errorName: "ERC20InsufficientAllowance", args: [MARKET, 0n, 2n * 10n ** 18n] });
    expect(data.slice(0, 10)).toBe("0xfb8f41b2"); // the selector observed on the real chain
    const err = await depsReverting(data).simulate(place, ALICE).then(() => undefined, (e: unknown) => e);
    expect(describeTxError(err)).toMatchObject({ kind: "reverted", errorName: "ERC20InsufficientAllowance" });
  });

  it("names ERC20InsufficientBalance", async () => {
    const data = encodeErrorResult({ abi: demoTokenAbi, errorName: "ERC20InsufficientBalance", args: [ALICE, 0n, 1n] });
    const err = await depsReverting(data).simulate(place, ALICE).then(() => undefined, (e: unknown) => e);
    expect(describeTxError(err)).toMatchObject({ kind: "reverted", errorName: "ERC20InsufficientBalance" });
  });

  it("still names the order book's own errors", async () => {
    const data = encodeErrorResult({ abi: orderBookAbi, errorName: "InvalidLotSize" });
    const err = await depsReverting(data).simulate(place, ALICE).then(() => undefined, (e: unknown) => e);
    expect(describeTxError(err)).toMatchObject({ kind: "reverted", errorName: "InvalidLotSize" });
  });
});
