import type { Abi, Address, Hex, PublicClient } from "viem";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "./contracts/abis";
import { describeTxError } from "./errors";
import { assessChain, type ChainAnchor, type ChainVerdict } from "./chain-reset";
import { decodeOrderReceipt, reconcileOrder, type OrderReceipt } from "./receipt";
import { SIDE_INDEX, type ValidOrder } from "./order-input";
import type { FlowContext, FlowEvent, FlowFailure } from "./order-flow";
import type { OrderSnapshot } from "./order-status";

/** What a successful order produced, taken from the receipt and from `getOrder`, never from the simulation. */
export type OrderOutcome = {
  hash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  decoded: OrderReceipt;
  /** `getOrder` at the receipt block (the order as the transaction left it). */
  atBlock: OrderSnapshot;
  /** `getOrder` now (it may have been filled by later trades). */
  latest: OrderSnapshot;
  /** Non-empty means the logs and the chain disagree: a decoding or accounting bug, shown to the user. */
  problems: string[];
};

export type ContractCall = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
export type ReceiptLike = { transactionHash: Hex; status: "success" | "reverted"; blockNumber: bigint; gasUsed: bigint; logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[] };

/**
 * The fields that identify a submitted transaction's nonce slot. viem needs them to detect a replacement: a node that
 * drops the original transaction no longer returns it by hash, and without these fields the replacement is never found
 * (measured on Anvil with viem 2.57.16: all three windows timed out even after the replacement was mined).
 */
export type TxFields = { from: Address; nonce: number; input: Hex; to: Address | null; value: bigint };

/** The few chain and wallet operations the lifecycle needs. Real implementations are below; tests inject fakes. */
export type RunnerDeps = {
  simulate: (call: ContractCall, account: Address, blockNumber?: bigint) => Promise<void>;
  /** Sends the transaction from the wallet. Resolves with the hash once the wallet has signed and broadcast it. */
  write: (call: ContractCall, account: Address, chainId: number) => Promise<Hex>;
  /** `onReplaced` fires when the wallet re-prices (speed up), replaces or cancels the transaction; viem still resolves with the replacement's receipt. */
  waitForReceipt: (
    hash: Hex,
    opts: { timeoutMs: number; onReplaced: (reason: "repriced" | "cancelled" | "replaced", hash: Hex) => void; replacement?: TxFields },
  ) => Promise<ReceiptLike>;
  readAllowance: (token: Address, owner: Address, spender: Address) => Promise<bigint>;
  readOrder: (market: Address, id: bigint, blockNumber?: bigint) => Promise<OrderSnapshot>;
  /** The just-submitted transaction as the node sees it (for replacement detection). Optional: absent means no replacement fields. */
  readTransaction?: (hash: Hex) => Promise<TxFields | undefined>;
  /** Identity of the chain at submission time (genesis hash and head), for the reset check. Optional. */
  readChainAnchor?: () => Promise<ChainAnchor | undefined>;
  /** After a timed-out wait: is it still the same chain, and does the node still know the transaction? Optional. */
  inspectChain?: (anchor: ChainAnchor, hash: Hex) => Promise<{ verdict: ChainVerdict; txKnown?: boolean }>;
};

export type Dispatch<R = OrderOutcome> = (event: FlowEvent<R>) => void;

export type PairInfo = { market: Address; baseToken: Address; quoteToken: Address };

export type RunParams = {
  ctx: FlowContext;
  pair: PairInfo;
  order: ValidOrder;
  attempt: number;
  /** One receipt wait window. After `maxWindows` windows the flow fails with a timeout. */
  windowMs?: number;
  maxWindows?: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_WINDOWS = 3;

export const fail = <R>(dispatch: (event: FlowEvent<R>) => void, attempt: number, step: "approve" | "order", error: unknown, hash?: Hex) => {
  const described = describeTxError(error);
  // Once a hash exists the wallet has broadcast it. Unless the chain said it reverted, was cancelled or replaced, it may
  // still be mined, so say so before the user is offered another attempt.
  const maybePending = hash !== undefined && !["reverted", "cancelled", "replaced", "timeout", "chain-reset"].includes(described.kind);
  // A replaced or cancelled transaction fails under the hash that was mined in its place.
  const shown = (error as { replacementHash?: Hex } | undefined)?.replacementHash ?? hash;
  const failure: FlowFailure = {
    ...described,
    detail: maybePending ? `${described.detail} The transaction may still be mined: check its page, and My orders, before sending another.` : described.detail,
    step,
    hash: shown,
  };
  dispatch({ type: "FAILED", attempt, failure });
};

const best = async <T>(read: (() => Promise<T>) | undefined): Promise<T | undefined> => {
  try {
    return read ? await read() : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Waits for a receipt in bounded windows. A timeout is not a failure: it marks the flow delayed and keeps waiting,
 * up to `maxWindows`. Every window waits on the same hash with the same sender/nonce fields (read once), so a
 * replacement is found in any window, not only the first. A re-priced (sped-up) transaction is followed to its new hash.
 * After a timed-out window the chain's identity is re-checked: a chain that is provably not the one the transaction was
 * sent to ends the wait; a transaction the node merely no longer lists does not (it is reported as such at the end).
 */
export async function waitBounded<R>(
  deps: Pick<RunnerDeps, "waitForReceipt"> & Partial<Pick<RunnerDeps, "readTransaction" | "readChainAnchor" | "inspectChain">>,
  hash: Hex,
  p: Pick<RunParams, "attempt" | "windowMs" | "maxWindows">,
  dispatch: (event: FlowEvent<R>) => void,
  isCurrent: () => boolean,
): Promise<ReceiptLike> {
  const windowMs = p.windowMs ?? DEFAULT_WINDOW_MS;
  const maxWindows = p.maxWindows ?? DEFAULT_MAX_WINDOWS;
  const replacement = await best(deps.readTransaction && (() => deps.readTransaction!(hash)));
  const anchor = await best(deps.readChainAnchor);
  let lastError: unknown;
  let replacedBy: { reason: "cancelled" | "replaced"; hash: Hex } | undefined;
  let txUnknown = false;
  for (let window = 0; window < maxWindows; window++) {
    try {
      const receipt = await deps.waitForReceipt(hash, {
        timeoutMs: windowMs,
        replacement,
        onReplaced: (reason, h) => {
          if (reason === "repriced") dispatch({ type: "HASH_REPLACED", attempt: p.attempt, hash: h });
          else replacedBy = { reason, hash: h };
        },
      });
      // viem resolves with the REPLACEMENT's receipt for a cancelled or replaced transaction. That is not our order.
      if (replacedBy) {
        throw Object.assign(new Error(`transaction ${replacedBy.reason}`), { name: "TransactionReplacedError", reason: replacedBy.reason, replacementHash: replacedBy.hash });
      }
      return receipt;
    } catch (e) {
      lastError = e;
      if (describeTxError(e).kind !== "timeout" || !isCurrent()) throw e;
      dispatch({ type: "DELAYED", attempt: p.attempt });
      if (anchor && deps.inspectChain) {
        const seen = await best(() => deps.inspectChain!(anchor, hash));
        if (!isCurrent()) throw e;
        if (seen?.verdict.verdict === "reset") {
          throw Object.assign(new Error("the local chain was reset"), { name: "ChainResetError", evidence: seen.verdict.evidence });
        }
        if (seen?.txKnown !== undefined) txUnknown = !seen.txKnown;
      }
    }
  }
  if (txUnknown && lastError && typeof lastError === "object") (lastError as { txUnknown?: boolean }).txUnknown = true;
  throw lastError;
}

/** Step 1 of an order that needs allowance: approve exactly the collateral for the order book (never MarketFactory). */
export async function runApproval<R = OrderOutcome>(deps: RunnerDeps, p: RunParams, dispatch: Dispatch<R>, isCurrent: () => boolean): Promise<void> {
  const token = p.order.collateralToken === "quote" ? p.pair.quoteToken : p.pair.baseToken;
  const call: ContractCall = { address: token, abi: demoTokenAbi, functionName: "approve", args: [p.pair.market, p.order.collateral] };
  let hash: Hex | undefined;
  try {
    await deps.simulate(call, p.ctx.account);
    if (!isCurrent()) return;
    hash = await deps.write(call, p.ctx.account, p.ctx.chainId);
    // Always record the hash (the wallet already sent it), then stop if the account, network or market changed.
    dispatch({ type: "APPROVAL_SUBMITTED", attempt: p.attempt, hash });
    if (!isCurrent()) return;
    const receipt = await waitBounded(deps, hash, p, dispatch, isCurrent);
    if (!isCurrent()) return;
    hash = receipt.transactionHash; // a re-priced transaction mined under a new hash: later messages cite that one
    if (receipt.status !== "success") {
      return fail(dispatch, p.attempt, "approve", Object.assign(new Error("reverted"), { name: "ContractFunctionRevertedError" }), hash);
    }
    // Re-read the allowance instead of trusting the receipt: the next step depends on what the chain now says.
    const allowance = await deps.readAllowance(token, p.ctx.account, p.pair.market);
    if (!isCurrent()) return;
    if (allowance < p.order.collateral) {
      return fail(dispatch, p.attempt, "approve", new Error("The allowance read after the approval is still below the collateral."), hash);
    }
    dispatch({ type: "APPROVAL_CONFIRMED", attempt: p.attempt, amount: allowance });
  } catch (e) {
    if (isCurrent()) fail(dispatch, p.attempt, "approve", e, hash);
  }
}

/** Step 2: simulate, sign, wait for the receipt, decode it and reconcile with `getOrder`. */
export async function runOrder(deps: RunnerDeps, p: RunParams, dispatch: Dispatch, isCurrent: () => boolean): Promise<void> {
  const call: ContractCall = {
    address: p.pair.market,
    abi: orderBookAbi,
    functionName: "placeLimitOrder",
    args: [SIDE_INDEX[p.order.side], p.order.price, p.order.amount],
  };
  let hash: Hex | undefined;
  try {
    await deps.simulate(call, p.ctx.account);
    if (!isCurrent()) return;
    dispatch({ type: "SIMULATION_OK", attempt: p.attempt });
    hash = await deps.write(call, p.ctx.account, p.ctx.chainId);
    dispatch({ type: "ORDER_SUBMITTED", attempt: p.attempt, hash });
    if (!isCurrent()) return;

    const receipt = await waitBounded(deps, hash, p, dispatch, isCurrent);
    if (!isCurrent()) return;
    hash = receipt.transactionHash; // a re-priced transaction mined under a new hash: later messages cite that one

    if (receipt.status !== "success") {
      // Best effort: replay the call just before the failing block to learn why. It may not reproduce.
      let reason: unknown = new Error("The transaction reverted on-chain and the reason could not be recovered.");
      try {
        await deps.simulate(call, p.ctx.account, receipt.blockNumber - 1n);
      } catch (e) {
        reason = e;
      }
      const described = describeTxError(reason);
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          ...described,
          kind: "reverted",
          title: `Reverted on-chain: ${described.title}`,
          detail: "The transaction was mined and reverted, so no order was placed. Only gas was spent.",
          step: "order",
          hash,
        },
      });
    }

    dispatch({ type: "ORDER_MINED", attempt: p.attempt });

    const decoded = decodeOrderReceipt({
      logs: receipt.logs,
      market: p.pair.market,
      baseToken: p.pair.baseToken,
      quoteToken: p.pair.quoteToken,
      user: p.ctx.account,
    });
    if (!decoded.ok) {
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          kind: "unknown",
          title: "Confirmed, but the order could not be verified",
          detail: "The transaction succeeded but its receipt has no OrderPlaced event from this market for your account. Open the transaction page to inspect it.",
          step: "order",
          hash,
        },
      });
    }

    // The order that was mined must be the order that was requested. A different transaction mined under the same
    // nonce (from another tab or a wallet replacement) could otherwise be reported as this order.
    const mined = decoded.receipt;
    if (mined.side !== p.order.side || mined.price !== p.order.price || mined.amount !== p.order.amount) {
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          kind: "replaced",
          title: "Confirmed, but it is not the order you requested",
          detail: "The transaction that was mined placed an order with a different side, price or amount. Check My orders before doing anything else.",
          step: "order",
          hash: receipt.transactionHash,
        },
      });
    }

    const id = decoded.receipt.orderId;
    const [atBlock, latest] = await Promise.all([deps.readOrder(p.pair.market, id, receipt.blockNumber), deps.readOrder(p.pair.market, id)]);
    if (!isCurrent()) return;
    const problems = reconcileOrder(decoded.receipt, atBlock);
    dispatch({
      type: "RECONCILED",
      attempt: p.attempt,
      result: { hash: receipt.transactionHash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed, decoded: decoded.receipt, atBlock, latest, problems },
    });
  } catch (e) {
    if (isCurrent()) fail(dispatch, p.attempt, "order", e, hash);
  }
}

/**
 * Revert reasons can come from a contract other than the one being called: the order book re-raises the tokens' own
 * errors through SafeERC20, and the market factory re-raises the order book constructor's errors. viem names a revert
 * only if its definition is in the ABI of the simulated call, so every project error definition is merged in (adds
 * names only; it never changes which function is called). Found by the real-chain test (issue p2-001) and extended in
 * P2-6 for `InvalidTokens` and `UnsupportedDecimals`.
 */
export const ERROR_DEFINITIONS = (() => {
  const seen = new Map<string, (typeof demoTokenAbi)[number]>();
  for (const item of [...demoTokenAbi, ...orderBookAbi, ...tokenFactoryAbi, ...marketFactoryAbi]) {
    if (item.type !== "error") continue;
    seen.set(`${item.name}(${item.inputs.map((i) => i.type).join(",")})`, item as (typeof demoTokenAbi)[number]);
  }
  return [...seen.values()];
})();

/** Real chain operations over a viem public client, with the wallet's `writeContract` supplied by the caller. */
export function viemDeps(
  publicClient: PublicClient,
  writeContract: (args: ContractCall & { account: Address; chainId: number }) => Promise<Hex>,
): RunnerDeps {
  return {
    simulate: async (call, account, blockNumber) => {
      await publicClient.simulateContract({
        ...call,
        abi: [...call.abi, ...ERROR_DEFINITIONS],
        account,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      } as never);
    },
    write: (call, account, chainId) => writeContract({ ...call, account, chainId }),
    waitForReceipt: (hash, { timeoutMs, onReplaced, replacement }) =>
      publicClient.waitForTransactionReceipt({
        hash,
        timeout: timeoutMs,
        ...(replacement ? { replacement } : {}),
        onReplaced: (r) => onReplaced(r.reason, r.transaction.hash),
      }) as Promise<ReceiptLike>,
    readTransaction: async (hash) => {
      const t = await publicClient.getTransaction({ hash });
      return { from: t.from, nonce: t.nonce, input: t.input, to: t.to, value: t.value };
    },
    readChainAnchor: async () => {
      const [genesis, head] = await Promise.all([publicClient.getBlock({ blockNumber: 0n }), publicClient.getBlock()]);
      return { genesisHash: genesis.hash, blockNumber: head.number, blockHash: head.hash };
    },
    inspectChain: async (anchor, hash) => {
      // Each read is independent: a failed read is "unknown", a "block not found" answer is evidence ("null").
      const read = async <T>(f: () => Promise<T>): Promise<T | undefined> => f().catch(() => undefined);
      const [genesis, head, atAnchor, known] = await Promise.all([
        read(() => publicClient.getBlock({ blockNumber: 0n })),
        read(() => publicClient.getBlock()),
        publicClient.getBlock({ blockNumber: anchor.blockNumber }).catch((e: { name?: string }) => (e?.name === "BlockNotFoundError" ? null : undefined)),
        publicClient.getTransaction({ hash }).then(
          () => true,
          (e: { name?: string }) => (e?.name === "TransactionNotFoundError" ? false : undefined),
        ),
      ]);
      const verdict = assessChain(anchor, {
        genesisHash: genesis?.hash,
        latestNumber: head?.number,
        hashAtAnchor: atAnchor === undefined ? undefined : atAnchor === null ? null : atAnchor.hash,
      });
      return { verdict, ...(known !== undefined ? { txKnown: known } : {}) };
    },
    readAllowance: (token, owner, spender) =>
      publicClient.readContract({ address: token, abi: demoTokenAbi, functionName: "allowance", args: [owner, spender] }) as Promise<bigint>,
    readOrder: async (market, id, blockNumber) =>
      (await publicClient.readContract({
        address: market,
        abi: orderBookAbi,
        functionName: "getOrder",
        args: [id],
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      })) as OrderSnapshot,
  };
}
