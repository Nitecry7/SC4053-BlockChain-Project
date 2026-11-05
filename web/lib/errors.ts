export type ErrorKind =
  | "rejected"
  | "unsupported-chain"
  | "rpc"
  | "unknown"
  | "reverted"
  | "wrong-network"
  | "disconnected"
  | "cancelled"
  | "replaced"
  | "timeout";
/** `errorName` is set when the contract returned a custom error that the ABI decoded. */
export type DescribedError = { kind: ErrorKind; title: string; detail: string; errorName?: string };

type ErrorLike = { name?: unknown; code?: unknown; message?: unknown; shortMessage?: unknown; cause?: unknown };

/** Walks an error and its `cause` chain (viem and wagmi wrap errors), at most 10 levels deep. */
function chain(error: unknown): ErrorLike[] {
  const out: ErrorLike[] = [];
  let current: unknown = error;
  for (let i = 0; i < 10 && current && typeof current === "object"; i++) {
    out.push(current as ErrorLike);
    current = (current as ErrorLike).cause;
  }
  return out;
}

const text = (e: ErrorLike) => `${typeof e.shortMessage === "string" ? e.shortMessage : ""} ${typeof e.message === "string" ? e.message : ""}`;

/** Turns wallet and RPC failures into plain, actionable messages. Never claims a transaction happened. */
export function describeError(error: unknown): DescribedError {
  const links = chain(error);
  const has = (test: (e: ErrorLike) => boolean) => links.some(test);

  if (has((e) => e.code === 4001 || e.name === "UserRejectedRequestError" || /user rejected|user denied/i.test(text(e)))) {
    return { kind: "rejected", title: "Request rejected in your wallet", detail: "Nothing was sent. You can try again." };
  }
  if (has((e) => e.code === 4902 || /unrecognized chain|chain .* not (been )?added|unsupported chain/i.test(text(e)))) {
    return {
      kind: "unsupported-chain",
      title: "Your wallet does not know the Anvil network",
      detail: "Add it in your wallet: chain ID 31337, RPC http://127.0.0.1:8545, currency ETH.",
    };
  }
  if (
    has(
      (e) =>
        e.name === "HttpRequestError" ||
        e.name === "TimeoutError" ||
        /failed to fetch|fetch failed|econnrefused|networkerror|load failed/i.test(text(e)),
    )
  ) {
    return { kind: "rpc", title: "Cannot reach the local Anvil node", detail: "Start it with `anvil`, then reload this page." };
  }
  const first = links[0];
  const detail = first && typeof first.shortMessage === "string" ? first.shortMessage : first && typeof first.message === "string" ? first.message : "Unknown error.";
  return { kind: "unknown", title: "Something went wrong", detail };
}

/** Plain-language text for the custom errors of the order book and the ERC20 tokens (CONTRACT_INTERFACE.md, OZ 5). */
const CONTRACT_ERROR_TEXT: Record<string, { title: string; detail: string }> = {
  ZeroAmount: { title: "The amount is zero", detail: "Enter an amount greater than zero." },
  ZeroPrice: { title: "The price is zero", detail: "Enter a limit price greater than zero." },
  InvalidLotSize: { title: "The amount is not a multiple of the lot size", detail: "Use a multiple of the market's lot size." },
  InvalidTickSize: { title: "The price is not a multiple of the tick size", detail: "Use a multiple of the market's tick size." },
  BookTooDeep: {
    title: "The book is too deep for this price",
    detail: "More orders rank ahead of this one than the engine will scan (BookTooDeep). Try a price closer to the best price.",
  },
  ReentrancyGuardReentrantCall: { title: "The order book rejected a re-entrant call", detail: "Nothing was changed." },
  SafeERC20FailedOperation: {
    title: "The token transfer failed",
    detail: "Check your balance and your allowance for this token, then try again.",
  },
  ERC20InsufficientAllowance: {
    title: "Allowance is too low",
    detail: "The order book is not approved to move enough of this token. Approve the required amount first.",
  },
  ERC20InsufficientBalance: { title: "Balance is too low", detail: "Your wallet holds less of this token than the order escrows." },
};

/**
 * Like `describeError`, for the transaction lifecycle: decodes contract reverts by name (viem puts the decoded custom
 * error on `ContractFunctionRevertedError.data`), and names wallet-chain mismatches, disconnects, replaced
 * transactions and confirmation timeouts. Falls back to `describeError`. Never claims a transaction happened.
 */
export function describeTxError(error: unknown): DescribedError {
  const links = chain(error);
  const named = (n: string) => links.find((e) => e.name === n);

  for (const link of links) {
    if (link.name !== "ContractFunctionRevertedError") continue;
    const data = (link as { data?: { errorName?: unknown } }).data;
    const errorName = data && typeof data.errorName === "string" ? data.errorName : undefined;
    const known = errorName ? CONTRACT_ERROR_TEXT[errorName] : undefined;
    if (known && errorName) return { kind: "reverted", errorName, ...known };
    return {
      kind: "reverted",
      errorName,
      title: "The contract rejected this transaction",
      detail: typeof link.shortMessage === "string" ? link.shortMessage : "The call reverted.",
    };
  }

  // Only after contract reverts are ruled out: revert text can contain any words, including "user rejected".
  if (links.some((e) => e.code === 4001 || e.name === "UserRejectedRequestError" || /user rejected|user denied/i.test(text(e)))) {
    return describeError(error);
  }

  if (named("ConnectorChainMismatchError") || named("ChainMismatchError")) {
    return { kind: "wrong-network", title: "Your wallet is on a different network", detail: "Switch to Anvil (chain ID 31337) and try again." };
  }
  if (named("ConnectorNotConnectedError") || named("ConnectorAccountNotFoundError")) {
    return { kind: "disconnected", title: "Your wallet is not connected", detail: "Connect your wallet and try again." };
  }
  const replaced = named("TransactionReplacedError") as { reason?: unknown } | undefined;
  if (replaced) {
    return replaced.reason === "cancelled"
      ? { kind: "cancelled", title: "The transaction was cancelled", detail: "A cancelling transaction was mined instead. Nothing was ordered." }
      : { kind: "replaced", title: "The transaction was replaced", detail: "A different transaction was mined instead. Check My Orders before trying again." };
  }
  if (named("WaitForTransactionReceiptTimeoutError") || named("TransactionReceiptNotFoundError")) {
    return {
      kind: "timeout",
      title: "Not confirmed yet",
      detail: "The transaction may still be pending. Check its status again in a moment; do not resubmit yet.",
    };
  }
  return describeError(error);
}
