import type { Address, Hex, PublicClient } from "viem";
import { orderBookAbi } from "./contracts/abis";
import { crossedBook, validateMatchCount } from "./crossed-book";
import { describeTxError } from "./errors";
import { matchDeps, type MatchDeps } from "./match-runner";
import type { FlowContext, FlowEvent, FlowFailure } from "./order-flow";
import { ERROR_DEFINITIONS, viemDeps, waitBounded, type ContractCall, type PairInfo } from "./order-runner";
import type { OrderSnapshot } from "./order-status";
import { decodeTriggerReceipt, type DecodedTrade } from "./receipt";

/**
 * What happened to ONE stop order in a confirmed `triggerStopOrders` transaction. Activation and execution are
 * different things: a triggered stop becomes an ordinary order, which may then rest unfilled, fill partly or fully as a
 * taker, or be cancelled and refunded by the engine because it could not be inserted into the book.
 */
export type TriggeredStop = {
  orderId: bigint;
  /** The last trade price that made it eligible (from `StopOrderTriggered`; not the trigger price). */
  lastTradePrice: bigint;
  before: OrderSnapshot;
  after: OrderSnapshot;
  fills: DecodedTrade[];
  /** Base filled in this transaction (the stop is the taker). */
  tradedBase: bigint;
  /** What it is now, as `getOrder` reads it at the receipt block. */
  outcome: "resting" | "partly-filled" | "filled" | "auto-cancelled" | "unexpected";
  /** Refund the engine reported when it cancelled the activated remainder itself. */
  refundBase: bigint;
  refundQuote: bigint;
};

export type TriggerOutcome = {
  hash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  /** The count that was sent (`maxCount`, the engine's per-transaction limit). */
  requested: bigint;
  /** What the pre-send simulation returned: an estimate, shown beside the real count. */
  simulatedCount: bigint;
  triggered: TriggeredStop[];
  totalBase: bigint;
  totalQuote: bigint;
  /** The market's last trade price at the receipt block. */
  lastTradeAfter: bigint;
  /** Stops that would still activate if called again now (simulated), and whether the book is now crossed. */
  stillEligible: bigint;
  crossed: boolean;
  /** Zero `StopOrderTriggered` events: nothing was activated. */
  noop: boolean;
  /** Non-empty means the logs and the chain disagree: shown to the user instead of a plain success. */
  problems: string[];
};

export type TriggerParams = {
  ctx: FlowContext;
  pair: PairInfo;
  /** The market's `MAX_MATCHES_PER_TX`, as the snapshot read it (the engine's limit for `maxCount` too). */
  limit: bigint;
  attempt: number;
  windowMs?: number;
  maxWindows?: number;
};

export type TriggerDeps = MatchDeps & {
  /** Simulates `triggerStopOrders(count)` from the account and returns its result (how many stops it would activate). */
  simulateTriggers: (market: Address, count: bigint, account: Address, blockNumber?: bigint) => Promise<bigint>;
  estimateTriggerGas?: (market: Address, count: bigint, account: Address) => Promise<bigint>;
  /** `lastTradePrice` and `hasTradePrice` at the latest block, or the given one. */
  readLastTrade: (market: Address, blockNumber?: bigint) => Promise<{ price: bigint; has: boolean }>;
};

/** Real chain operations: the match deps (best prices, order reads, wallet) plus the three trigger-specific ones. */
export function triggerDeps(publicClient: PublicClient, write: Parameters<typeof viemDeps>[1]): TriggerDeps {
  const base = matchDeps(publicClient, write);
  const abi = [...orderBookAbi, ...ERROR_DEFINITIONS];
  return {
    ...base,
    simulateTriggers: async (market, count, account, blockNumber) => {
      const { result } = await publicClient.simulateContract({
        address: market,
        abi,
        functionName: "triggerStopOrders",
        args: [count],
        account,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      } as never);
      return result as bigint;
    },
    estimateTriggerGas: (market, count, account) =>
      publicClient.estimateContractGas({ address: market, abi: orderBookAbi, functionName: "triggerStopOrders", args: [count], account } as never),
    readLastTrade: async (market, blockNumber) => {
      const opt = blockNumber !== undefined ? { blockNumber } : {};
      const [price, has] = await Promise.all([
        publicClient.readContract({ address: market, abi: orderBookAbi, functionName: "lastTradePrice", ...opt }) as Promise<bigint>,
        publicClient.readContract({ address: market, abi: orderBookAbi, functionName: "hasTradePrice", ...opt }) as Promise<boolean>,
      ]);
      return { price, has };
    },
  };
}

function triggerFailure(error: unknown, hash: Hex | undefined): FlowFailure {
  const described = describeTxError(error);
  let { title, detail } = described;
  if (described.kind === "cancelled") {
    title = "The trigger request was itself cancelled";
    detail = "Your wallet sent a different, cancelling transaction instead, so no stop was triggered by this request. Check My orders: the stops may still be waiting.";
  } else if (described.kind === "replaced") {
    title = "The trigger request was replaced";
    detail = "A different transaction from your wallet took its place and was mined, so this trigger did not happen. Check that transaction and My orders before trying again.";
  } else if (described.kind === "chain-reset") {
    detail = detail.replace("Check My orders and place the order again only if it is not listed.", "Check My orders, and trigger again only if the stop is still pending.");
  }
  const maybePending = hash !== undefined && !["reverted", "cancelled", "replaced", "timeout", "chain-reset"].includes(described.kind);
  const shown = (error as { replacementHash?: Hex } | undefined)?.replacementHash ?? hash;
  return {
    ...described,
    title,
    detail: maybePending ? `${detail} The transaction may still be mined: check its page, and My orders, before sending another.` : detail,
    step: "order",
    hash: shown,
  };
}

const stop = (dispatch: (e: FlowEvent<TriggerOutcome>) => void, attempt: number, title: string, detail: string): void =>
  dispatch({ type: "FAILED", attempt, failure: { kind: "unknown", title, detail, step: "order" } });

export type TriggerPreview = { count: bigint; lastTradePrice: bigint; hasTradePrice: boolean; gas?: bigint };

/** The read-only look before the wallet is asked: how many stops `triggerStopOrders(count)` would activate now, an estimate. */
export async function previewTrigger(deps: Pick<TriggerDeps, "simulateTriggers" | "estimateTriggerGas" | "readLastTrade">, market: Address, count: bigint, account: Address): Promise<TriggerPreview> {
  const [simulated, last] = await Promise.all([deps.simulateTriggers(market, count, account), deps.readLastTrade(market)]);
  const gas = deps.estimateTriggerGas ? await deps.estimateTriggerGas(market, count, account).catch(() => undefined) : undefined;
  return gas === undefined
    ? { count: simulated, lastTradePrice: last.price, hasTradePrice: last.has }
    : { count: simulated, lastTradePrice: last.price, hasTradePrice: last.has, gas };
}

/**
 * Drives one `triggerStopOrders(count)` through the shared lifecycle: re-simulate (nothing is sent, and no gas spent,
 * if it would activate nothing), one wallet request, bounded receipt wait, then verify from the receipt's own events
 * (`StopOrderTriggered`, `Trade`, `OrderCancelled`) and from `getOrder` before and after the block. A hash, a
 * signature or a simulation is never success, and activation is never reported as execution.
 */
export async function runTrigger(deps: TriggerDeps, p: TriggerParams, dispatch: (event: FlowEvent<TriggerOutcome>) => void, isCurrent: () => boolean): Promise<void> {
  let hash: Hex | undefined;
  try {
    const checked = validateMatchCount(p.limit, p.limit);
    if (!checked.ok) return stop(dispatch, p.attempt, "Invalid trigger count", "The market did not report a usable per-transaction limit, so nothing was sent.");
    const count = checked.count;
    const call: ContractCall = { address: p.pair.market, abi: orderBookAbi, functionName: "triggerStopOrders", args: [count] };

    const simulated = await deps.simulateTriggers(p.pair.market, count, p.ctx.account);
    if (!isCurrent()) return;
    if (simulated === 0n) {
      return stop(dispatch, p.attempt, "No stop order can be triggered right now", "The contract reports that a trigger call would activate nothing (no stop is eligible at the current last trade price, or nobody has traded yet), so no wallet request was sent and no gas was spent. The list has been re-read.");
    }
    dispatch({ type: "SIMULATION_OK", attempt: p.attempt });

    hash = await deps.write(call, p.ctx.account, p.ctx.chainId);
    dispatch({ type: "ORDER_SUBMITTED", attempt: p.attempt, hash });
    if (!isCurrent()) return;

    const receipt = await waitBounded(deps, hash, p, dispatch, isCurrent);
    if (!isCurrent()) return;
    hash = receipt.transactionHash;

    if (receipt.status !== "success") {
      let reason: unknown = new Error("The transaction reverted on-chain and the reason could not be recovered.");
      try {
        await deps.simulateTriggers(p.pair.market, count, p.ctx.account, receipt.blockNumber - 1n);
      } catch (e) {
        reason = e;
      }
      const described = describeTxError(reason);
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: { ...described, kind: "reverted", title: `Reverted on-chain: ${described.title}`, detail: "The transaction was mined and reverted, so no stop was triggered. Only gas was spent.", step: "order", hash },
      });
    }

    dispatch({ type: "ORDER_MINED", attempt: p.attempt });

    const decoded = decodeTriggerReceipt({ logs: receipt.logs, market: p.pair.market, baseToken: p.pair.baseToken, quoteToken: p.pair.quoteToken });
    const ids = decoded.triggered.map((t) => t.orderId);
    const [orders, lastAfter, best, stillEligible] = await Promise.all([
      Promise.all(
        ids.map(async (id) => ({
          id,
          before: await deps.readOrder(p.pair.market, id, receipt.blockNumber - 1n),
          after: await deps.readOrder(p.pair.market, id, receipt.blockNumber),
        })),
      ),
      deps.readLastTrade(p.pair.market, receipt.blockNumber),
      deps.readBestPrices(p.pair.market),
      deps.simulateTriggers(p.pair.market, count, p.ctx.account).catch(() => 0n),
    ]);
    if (!isCurrent()) return;

    const problems: string[] = [];
    if (BigInt(decoded.triggered.length) > count) problems.push(`The receipt has more activations than the ${count.toString()} that were allowed.`);
    if (new Set(ids.map((i) => i.toString())).size !== ids.length) problems.push("The same stop order is reported as activated twice.");

    const triggered: TriggeredStop[] = orders.map(({ id, before, after }) => {
      const ev = decoded.triggered.find((t) => t.orderId === id)!;
      const fills = decoded.fills.filter((f) => f.takerOrderId === id);
      const tradedBase = fills.reduce((s, f) => s + f.baseAmount, 0n);
      const cancel = decoded.cancelled.find((c) => c.orderId === id && c.auto);
      if (before.status !== 4) problems.push(`Order #${id.toString()}: it was not PendingTrigger in the block before the transaction.`);
      if (after.filled - before.filled !== tradedBase) problems.push(`Order #${id.toString()}: its filled amount changed by a different amount than its Trade events add up to.`);
      let outcome: TriggeredStop["outcome"];
      if (after.status === 2) outcome = "filled";
      else if (after.status === 1) outcome = "partly-filled";
      else if (after.status === 0) outcome = "resting";
      else if (after.status === 3 && cancel) outcome = "auto-cancelled";
      else outcome = "unexpected";
      if (outcome === "unexpected") problems.push(`Order #${id.toString()}: it reads ${after.status === 3 ? "Cancelled without an engine cancel event after its activation" : `status ${after.status}`} after the transaction.`);
      if (outcome === "auto-cancelled") {
        const wantBase = after.side === 1 ? after.amount - after.filled : 0n;
        if (cancel!.refundBase !== wantBase) problems.push(`Order #${id.toString()}: the engine's refund of base token differs from its unfilled amount.`);
        if (after.lockedQuote !== 0n) problems.push(`Order #${id.toString()}: an auto-cancelled order still shows locked quote.`);
      }
      if (outcome === "resting" && after.filled !== 0n) problems.push(`Order #${id.toString()}: it reads Open but has a filled amount.`);
      if (outcome === "filled" && after.filled !== after.amount) problems.push(`Order #${id.toString()}: it reads Filled but its filled amount is not its amount.`);
      return { orderId: id, lastTradePrice: ev.lastTradePrice, before, after, fills, tradedBase, outcome, refundBase: cancel?.refundBase ?? 0n, refundQuote: cancel?.refundQuote ?? 0n };
    });
    for (const f of decoded.fills) {
      if (!ids.includes(f.takerOrderId)) problems.push(`A Trade in this transaction has order #${f.takerOrderId.toString()} as taker, which was not activated here.`);
    }
    for (const c of decoded.cancelled) {
      if (!c.auto) problems.push(`Order #${c.orderId.toString()} was cancelled in this transaction without being activated first.`);
    }

    const totalBase = decoded.fills.reduce((s, f) => s + f.baseAmount, 0n);
    const totalQuote = decoded.fills.reduce((s, f) => s + f.quoteAmount, 0n);
    const autoBase = triggered.reduce((s, t) => s + t.refundBase, 0n);
    const autoQuote = triggered.reduce((s, t) => s + t.refundQuote, 0n);
    if (decoded.baseOut !== totalBase + autoBase) problems.push("The base tokens the market paid out differ from the trades plus the engine's own refunds.");
    if (decoded.quoteOut < totalQuote + autoQuote) problems.push("The market paid out less quote token than the trades and the engine's own refunds add up to.");

    dispatch({
      type: "RECONCILED",
      attempt: p.attempt,
      result: {
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        requested: count,
        simulatedCount: simulated,
        triggered,
        totalBase,
        totalQuote,
        lastTradeAfter: lastAfter.price,
        stillEligible,
        crossed: crossedBook(best.bid, best.ask).crossed,
        noop: decoded.triggered.length === 0,
        problems,
      },
    });
  } catch (e) {
    if (isCurrent()) dispatch({ type: "FAILED", attempt: p.attempt, failure: triggerFailure(e, hash) });
  }
}
