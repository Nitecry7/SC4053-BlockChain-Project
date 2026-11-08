import type { Address, Hex, PublicClient } from "viem";
import { orderBookAbi } from "./contracts/abis";
import { crossedBook, validateMatchCount, type BestOrder } from "./crossed-book";
import { describeTxError } from "./errors";
import type { FlowContext, FlowEvent, FlowFailure } from "./order-flow";
import { ERROR_DEFINITIONS, viemDeps, waitBounded, type ContractCall, type PairInfo, type RunnerDeps } from "./order-runner";
import type { OrderSnapshot } from "./order-status";
import { decodeMatchReceipt, type DecodedTrade } from "./receipt";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** One order the transaction touched: what it was before, what the trades say it gained, and what it is now. */
export type MatchOrderEffect = {
  orderId: bigint;
  /** Base filled across this transaction's `Trade` events (as maker or taker). */
  tradedBase: bigint;
  before: OrderSnapshot;
  after: OrderSnapshot;
};

/** What a confirmed `matchOrders` produced, from the receipt's `Trade` events and `getOrder`, never from the simulation. */
export type MatchOutcome = {
  hash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  /** The count that was sent (the engine's per-transaction limit). */
  requested: bigint;
  /** What the pre-send simulation returned: an estimate, shown beside the real count. */
  simulatedFills: bigint;
  fills: DecodedTrade[];
  totalBase: bigint;
  totalQuote: bigint;
  /** What the market actually paid out, per token (the tokens' `Transfer` events). */
  baseOut: bigint;
  quoteOut: bigint;
  /** `quoteOut - totalQuote`: price improvement returned to buyers in the same transaction. */
  quoteReturned: bigint;
  effects: MatchOrderEffect[];
  /** Best bid and ask now, and whether they still cross (another click may be needed). */
  best: { bid: BestOrder; ask: BestOrder };
  stillCrossed: boolean;
  /** Zero fills: nothing crossed when the transaction was mined. */
  noop: boolean;
  /** Non-empty means the logs and the chain disagree: shown to the user instead of a plain success. */
  problems: string[];
};

export type MatchParams = {
  ctx: FlowContext;
  pair: PairInfo;
  /** The market's `MAX_MATCHES_PER_TX`, as the snapshot read it. */
  limit: bigint;
  attempt: number;
  windowMs?: number;
  maxWindows?: number;
};

export type MatchDeps = Pick<RunnerDeps, "write" | "waitForReceipt" | "readOrder"> &
  Partial<Pick<RunnerDeps, "readTransaction" | "readChainAnchor" | "inspectChain">> & {
    /** Simulates `matchOrders(count)` and returns its result (the number of fills), from the connected account. */
    simulateMatches: (market: Address, count: bigint, account: Address, blockNumber?: bigint) => Promise<bigint>;
    /** `getBestBid` and `getBestAsk` at the latest block, or at the given one. */
    readBestPrices: (market: Address, blockNumber?: bigint) => Promise<{ bid: BestOrder; ask: BestOrder }>;
    /** Optional gas estimate for the same call; absent means none is shown. */
    estimateGas?: (market: Address, count: bigint, account: Address) => Promise<bigint>;
  };

/** Real chain operations for the match flow: the shared ones, plus the three that need `matchOrders` or the best prices. */
export function matchDeps(publicClient: PublicClient, write: Parameters<typeof viemDeps>[1]): MatchDeps {
  const base = viemDeps(publicClient, write);
  const abi = [...orderBookAbi, ...ERROR_DEFINITIONS];
  return {
    write: base.write,
    waitForReceipt: base.waitForReceipt,
    readOrder: base.readOrder,
    readTransaction: base.readTransaction,
    readChainAnchor: base.readChainAnchor,
    inspectChain: base.inspectChain,
    simulateMatches: async (market, count, account, blockNumber) => {
      const { result } = await publicClient.simulateContract({
        address: market,
        abi,
        functionName: "matchOrders",
        args: [count],
        account,
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      } as never);
      return result as bigint;
    },
    readBestPrices: async (market, blockNumber) => {
      const opt = blockNumber !== undefined ? { blockNumber } : {};
      const [bid, ask] = await Promise.all([
        publicClient.readContract({ address: market, abi: orderBookAbi, functionName: "getBestBid", ...opt }) as Promise<readonly [bigint, bigint]>,
        publicClient.readContract({ address: market, abi: orderBookAbi, functionName: "getBestAsk", ...opt }) as Promise<readonly [bigint, bigint]>,
      ]);
      return { bid: { id: bid[0], price: bid[1] }, ask: { id: ask[0], price: ask[1] } };
    },
    estimateGas: (market, count, account) =>
      publicClient.estimateContractGas({ address: market, abi: orderBookAbi, functionName: "matchOrders", args: [count], account } as never),
  };
}

/**
 * A failure in the wording of a matching transaction. `describeTxError` words replaced, cancelled and reset transactions
 * for an order being placed ("nothing was ordered", "place the order again"), which would be wrong here.
 */
function matchFailure(error: unknown, hash: Hex | undefined): FlowFailure {
  const described = describeTxError(error);
  let { title, detail } = described;
  if (described.kind === "cancelled") {
    title = "The match request was itself cancelled";
    detail = "Your wallet sent a different, cancelling transaction instead, so this matching did not happen. Check the book: it may still be crossed.";
  } else if (described.kind === "replaced") {
    title = "The match request was replaced";
    detail = "A different transaction from your wallet took its place and was mined, so this matching did not happen. Check that transaction and the book before trying again.";
  } else if (described.kind === "chain-reset") {
    detail = detail.replace("Check My orders and place the order again only if it is not listed.", "Check the book, and match again only if it is still crossed.");
  }
  const maybePending = hash !== undefined && !["reverted", "cancelled", "replaced", "timeout", "chain-reset"].includes(described.kind);
  const shown = (error as { replacementHash?: Hex } | undefined)?.replacementHash ?? hash;
  return {
    ...described,
    title,
    detail: maybePending ? `${detail} The transaction may still be mined: check its page, and the book, before sending another.` : detail,
    step: "order",
    hash: shown,
  };
}

const stop = (dispatch: (e: FlowEvent<MatchOutcome>) => void, attempt: number, title: string, detail: string): void =>
  dispatch({ type: "FAILED", attempt, failure: { kind: "unknown", title, detail, step: "order" } });

/**
 * Drives one `matchOrders(count)` through the lifecycle the ticket and the cancel flow use: re-read the book, simulate,
 * wallet, bounded receipt wait (speed-ups followed, replacements and chain resets detected), then verify. No token
 * approval is involved and the caller neither pays nor receives trading tokens. Nothing is sent when the book is no
 * longer crossed or the simulation says no fill would happen, so a no-op never costs gas by accident.
 *
 * Success (`RECONCILED`) needs a successful receipt; the fills reported are the market's own `Trade` events, and each
 * touched order is read with `getOrder` before and after the block. A hash, a signature or a simulation alone is never
 * success. Zero `Trade` events is reported as "nothing settled", never as fills.
 */
export async function runMatch(deps: MatchDeps, p: MatchParams, dispatch: (event: FlowEvent<MatchOutcome>) => void, isCurrent: () => boolean): Promise<void> {
  let hash: Hex | undefined;
  try {
    const checked = validateMatchCount(p.limit, p.limit);
    if (!checked.ok) return stop(dispatch, p.attempt, "Invalid match count", "The market did not report a usable per-transaction limit, so nothing was sent.");
    const count = checked.count;
    const call: ContractCall = { address: p.pair.market, abi: orderBookAbi, functionName: "matchOrders", args: [count] };

    // 1. The book as it is now, not as the screen last drew it.
    const now = await deps.readBestPrices(p.pair.market);
    if (!isCurrent()) return;
    if (!crossedBook(now.bid, now.ask).crossed) {
      return stop(dispatch, p.attempt, "The book is no longer crossed", "No buy order is at or above the best sell any more (another transaction may have settled it), so nothing was sent. The book has been re-read.");
    }

    // 2. The engine's own answer, from the connected account: an estimate until the transaction is mined.
    const simulated = await deps.simulateMatches(p.pair.market, count, p.ctx.account);
    if (!isCurrent()) return;
    if (simulated === 0n) {
      return stop(dispatch, p.attempt, "No eligible orders to settle right now", "The contract reports that a matching call would settle nothing, so no wallet request was sent and no gas was spent.");
    }
    dispatch({ type: "SIMULATION_OK", attempt: p.attempt });

    hash = await deps.write(call, p.ctx.account, p.ctx.chainId);
    dispatch({ type: "ORDER_SUBMITTED", attempt: p.attempt, hash });
    if (!isCurrent()) return;

    const receipt = await waitBounded(deps, hash, p, dispatch, isCurrent);
    if (!isCurrent()) return;
    hash = receipt.transactionHash; // a re-priced transaction mined under a new hash: later messages cite that one

    if (receipt.status !== "success") {
      let reason: unknown = new Error("The transaction reverted on-chain and the reason could not be recovered.");
      try {
        await deps.simulateMatches(p.pair.market, count, p.ctx.account, receipt.blockNumber - 1n);
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
          detail: "The transaction was mined and reverted, so nothing was matched. Only gas was spent.",
          step: "order",
          hash,
        },
      });
    }

    dispatch({ type: "ORDER_MINED", attempt: p.attempt });

    const decoded = decodeMatchReceipt({ logs: receipt.logs, market: p.pair.market, baseToken: p.pair.baseToken, quoteToken: p.pair.quoteToken });
    const ids = [...new Set(decoded.fills.flatMap((f) => [f.makerOrderId, f.takerOrderId]))];
    const [effectsRaw, best] = await Promise.all([
      Promise.all(
        ids.map(async (id) => ({
          id,
          before: await deps.readOrder(p.pair.market, id, receipt.blockNumber - 1n),
          after: await deps.readOrder(p.pair.market, id, receipt.blockNumber),
        })),
      ),
      deps.readBestPrices(p.pair.market),
    ]);
    if (!isCurrent()) return;

    const totalBase = decoded.fills.reduce((s, f) => s + f.baseAmount, 0n);
    const totalQuote = decoded.fills.reduce((s, f) => s + f.quoteAmount, 0n);
    const problems: string[] = [];
    if (BigInt(decoded.fills.length) > count) problems.push(`The receipt has more Trade events than the ${count.toString()} fills that were allowed.`);
    if (decoded.baseOut !== totalBase) problems.push("The base tokens the market paid out differ from the base amounts in the Trade events.");
    if (decoded.quoteOut < totalQuote) problems.push("The market paid out less quote token than the Trade events report.");

    const effects: MatchOrderEffect[] = effectsRaw.map(({ id, before, after }) => {
      const tradedBase = decoded.fills.reduce((s, f) => s + (f.makerOrderId === id ? f.baseAmount : 0n) + (f.takerOrderId === id ? f.baseAmount : 0n), 0n);
      if (after.filled - before.filled !== tradedBase) problems.push(`Order #${id.toString()}: the filled amount changed by a different amount than its Trade events add up to.`);
      if (after.filled > after.amount) problems.push(`Order #${id.toString()}: filled exceeds its amount.`);
      if (after.filled === after.amount && after.status !== 2) problems.push(`Order #${id.toString()}: fully filled but not marked Filled.`);
      return { orderId: id, tradedBase, before, after };
    });
    // Each trader's own receipt: a buyer that only buys must have been paid exactly the base it bought, a seller that only
    // sells exactly the quote it earned. (A trader on both sides is skipped: its transfers net across fills.)
    const roleOf = (id: bigint) => effects.find((e) => e.orderId === id)?.before;
    const bought: Record<string, bigint> = {};
    const earned: Record<string, bigint> = {};
    for (const f of decoded.fills) {
      const a = roleOf(f.makerOrderId);
      const b = roleOf(f.takerOrderId);
      if (!a || !b) continue;
      const [buyOrder, sellOrder] = a.side === 0 ? [a, b] : [b, a];
      const buyer = buyOrder.trader.toLowerCase();
      const seller = sellOrder.trader.toLowerCase();
      bought[buyer] = (bought[buyer] ?? 0n) + f.baseAmount;
      earned[seller] = (earned[seller] ?? 0n) + f.quoteAmount;
    }
    for (const [who, qty] of Object.entries(bought)) {
      if (who in earned) continue;
      if ((decoded.baseTo[who] ?? 0n) !== qty) problems.push(`Buyer ${who.slice(0, 6)}…${who.slice(-4)} received a different amount of base token than its trades add up to.`);
    }
    for (const [who, cost] of Object.entries(earned)) {
      if (who in bought) continue;
      if ((decoded.quoteTo[who] ?? 0n) !== cost) problems.push(`Seller ${who.slice(0, 6)}…${who.slice(-4)} was paid a different amount of quote token than its trades add up to.`);
    }
    for (const f of decoded.fills) {
      const maker = effects.find((e) => e.orderId === f.makerOrderId);
      if (maker && maker.before.price !== f.price) problems.push(`Trade at order #${f.makerOrderId.toString()}: the price is not the maker order's price.`);
      if (maker && !same(maker.before.trader, f.maker)) problems.push(`Trade at order #${f.makerOrderId.toString()}: the maker is not that order's trader.`);
    }

    dispatch({
      type: "RECONCILED",
      attempt: p.attempt,
      result: {
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        requested: count,
        simulatedFills: simulated,
        fills: decoded.fills,
        totalBase,
        totalQuote,
        baseOut: decoded.baseOut,
        quoteOut: decoded.quoteOut,
        quoteReturned: decoded.quoteOut > totalQuote ? decoded.quoteOut - totalQuote : 0n,
        effects,
        best,
        stillCrossed: crossedBook(best.bid, best.ask).crossed,
        noop: decoded.fills.length === 0,
        problems,
      },
    });
  } catch (e) {
    if (isCurrent()) dispatch({ type: "FAILED", attempt: p.attempt, failure: matchFailure(e, hash) });
  }
}

export type MatchPreview = { fills: bigint; gas?: bigint };

/**
 * The read-only look shown BEFORE the wallet is asked: what `matchOrders(count)` would return from this account right
 * now, and a gas estimate when the node gives one. Both are estimates about the next block, not a promise. A failed
 * gas estimate only hides the gas line; a failed simulation is an error (it would revert).
 */
export async function previewMatch(deps: Pick<MatchDeps, "simulateMatches" | "estimateGas">, market: Address, count: bigint, account: Address): Promise<MatchPreview> {
  const fills = await deps.simulateMatches(market, count, account);
  const gas = deps.estimateGas ? await deps.estimateGas(market, count, account).catch(() => undefined) : undefined;
  return gas === undefined ? { fills } : { fills, gas };
}
