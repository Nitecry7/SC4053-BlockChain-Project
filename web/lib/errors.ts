export type ErrorKind = "rejected" | "unsupported-chain" | "rpc" | "unknown";
export type DescribedError = { kind: ErrorKind; title: string; detail: string };

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
