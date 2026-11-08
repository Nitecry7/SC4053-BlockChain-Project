import { describe, expect, it } from "vitest";
import { createPublicClient, custom, encodeErrorResult, RpcRequestError } from "viem";
import { orderBookAbi, demoTokenAbi } from "@/lib/contracts/abis";
import { describeTxError } from "./errors";

const MARKET = "0xCafac3dD18aC6c6e92c921884f9E4176737C052c" as const;
const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

/** A viem client whose RPC always reverts with the given encoded error: a synthetic transport, real viem decoding. */
async function simulateWithRevert(data: `0x${string}`) {
  const client = createPublicClient({
    transport: custom({
      request: async ({ method }) => {
        if (method === "eth_call" || method === "eth_estimateGas")
          throw new RpcRequestError({ body: {}, url: "synthetic", error: { code: 3, message: "execution reverted", data } });
        return "0x1";
      },
    }),
  });
  try {
    await client.simulateContract({ address: MARKET, abi: orderBookAbi, functionName: "placeLimitOrder", args: [0, 1n, 1n], account: ACCOUNT });
  } catch (e) {
    return e;
  }
  throw new Error("expected the simulation to revert");
}

describe("describeTxError: contract reverts decoded through real viem errors (synthetic RPC)", () => {
  it.each(["ZeroAmount", "ZeroPrice", "InvalidLotSize", "InvalidTickSize", "BookTooDeep", "ReentrancyGuardReentrantCall"] as const)(
    "names %s",
    async (errorName) => {
      const e = await simulateWithRevert(encodeErrorResult({ abi: orderBookAbi, errorName }));
      const d = describeTxError(e);
      expect(d.kind).toBe("reverted");
      expect(d.errorName).toBe(errorName);
      expect(d.title.length).toBeGreaterThan(5);
    },
  );

  it("names SafeERC20FailedOperation with its token argument", async () => {
    const e = await simulateWithRevert(encodeErrorResult({ abi: orderBookAbi, errorName: "SafeERC20FailedOperation", args: [MARKET] }));
    expect(describeTxError(e)).toMatchObject({ kind: "reverted", errorName: "SafeERC20FailedOperation" });
  });

  it("an empty revert (no engine function reverts this way any more; the decoder path is still valid) is reported as a revert without inventing a name", async () => {
    const e = await simulateWithRevert("0x");
    const d = describeTxError(e);
    expect(d.kind).toBe("reverted");
    expect(d.errorName).toBeUndefined();
  });
});

describe("describeTxError: token errors, wallet errors and lifecycle errors", () => {
  it("names ERC20InsufficientAllowance and ERC20InsufficientBalance from the token ABI", () => {
    const makeErr = (errorName: string, args: unknown[]) => {
      const data = encodeErrorResult({ abi: demoTokenAbi, errorName, args } as never);
      return Object.assign(new Error("x"), {
        name: "ContractFunctionExecutionError",
        cause: Object.assign(new Error("y"), { name: "ContractFunctionRevertedError", data: { errorName, args }, raw: data }),
      });
    };
    expect(describeTxError(makeErr("ERC20InsufficientAllowance", [MARKET, 1n, 2n])).errorName).toBe("ERC20InsufficientAllowance");
    expect(describeTxError(makeErr("ERC20InsufficientBalance", [ACCOUNT, 1n, 2n])).kind).toBe("reverted");
  });

  it("keeps user rejection as a rejection even when wrapped by a contract error", () => {
    const e = Object.assign(new Error("wrapped"), {
      name: "ContractFunctionExecutionError",
      cause: Object.assign(new Error("User rejected the request."), { name: "UserRejectedRequestError", code: 4001 }),
    });
    expect(describeTxError(e).kind).toBe("rejected");
  });

  it("recognises a wallet on the wrong chain and a disconnected wallet", () => {
    expect(describeTxError(Object.assign(new Error("m"), { name: "ConnectorChainMismatchError" })).kind).toBe("wrong-network");
    expect(describeTxError(Object.assign(new Error("m"), { name: "ChainMismatchError" })).kind).toBe("wrong-network");
    expect(describeTxError(Object.assign(new Error("m"), { name: "ConnectorNotConnectedError" })).kind).toBe("disconnected");
    expect(describeTxError(Object.assign(new Error("m"), { name: "ConnectorAccountNotFoundError" })).kind).toBe("disconnected");
  });

  it("distinguishes a cancelled transaction from a replaced one", () => {
    expect(describeTxError(Object.assign(new Error("m"), { name: "TransactionReplacedError", reason: "cancelled" })).kind).toBe("cancelled");
    expect(describeTxError(Object.assign(new Error("m"), { name: "TransactionReplacedError", reason: "replaced" })).kind).toBe("replaced");
  });

  it("treats a receipt timeout as 'not confirmed yet', never as failure", () => {
    const d = describeTxError(Object.assign(new Error("m"), { name: "WaitForTransactionReceiptTimeoutError" }));
    expect(d.kind).toBe("timeout");
    expect(d.detail).toMatch(/do not resubmit/i);
  });

  it("falls back to the generic classifier for RPC outages and unknown errors", () => {
    expect(describeTxError(Object.assign(new Error("fetch failed"), { name: "HttpRequestError" })).kind).toBe("rpc");
    expect(describeTxError(new Error("boom")).kind).toBe("unknown");
    expect(describeTxError("string error").kind).toBe("unknown");
    expect(describeTxError(undefined).kind).toBe("unknown");
  });
});

describe("describeTxError: revert text must not be mistaken for a wallet rejection (review finding 7)", () => {
  it("a contract revert whose message mentions 'user rejected' stays a revert", () => {
    const e = Object.assign(new Error("x"), {
      name: "ContractFunctionExecutionError",
      cause: Object.assign(new Error('execution reverted: "User rejected by token hook"'), {
        name: "ContractFunctionRevertedError",
        data: { errorName: "SafeERC20FailedOperation" },
        shortMessage: 'execution reverted: "user denied"',
      }),
    });
    expect(describeTxError(e).kind).toBe("reverted");
  });
});

