import type { Hex } from "viem";
import { orderBookAbi } from "./contracts/abis";
import { describeTxError } from "./errors";
import type { FlowContext, FlowEvent, FlowFailure } from "./order-flow";
import { waitBounded, type ContractCall, type PairInfo, type RunnerDeps } from "./order-runner";
import { expectedRefund, isCancellableStatus, type OrderSnapshot } from "./order-status";
import { decodeCancelReceipt } from "./receipt";

/** What a confirmed cancellation produced, taken from the receipt and from `getOrder`, never from the simulation. */
export type CancelOutcome = {
  hash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  orderId: bigint;
  side: "buy" | "sell";
  /** The order as `getOrder` reported it in the block before the cancellation. */
  before: OrderSnapshot;
  /** The order in the block that cancelled it. */
  after: OrderSnapshot;
  /** The order now. */
  latest: OrderSnapshot;
  /** The refund the order should have produced, worked out from `before` (SPEC A7). */
  expected: { token: "base" | "quote"; amount: bigint };
  /** The refund `OrderCancelled` reports. */
  refundBase: bigint;
  refundQuote: bigint;
  /** Tokens that actually moved from the market to the trader (the tokens' own `Transfer` events). */
  transferredBase: bigint;
  transferredQuote: bigint;
  /** Non-empty means the logs and the chain disagree: shown to the user instead of a plain success. */
  problems: string[];
};

export type CancelParams = {
  ctx: FlowContext;
  pair: PairInfo;
  orderId: bigint;
  attempt: number;
  windowMs?: number;
  maxWindows?: number;
};

export type CancelDeps = Pick<RunnerDeps, "simulate" | "write" | "waitForReceipt" | "readOrder"> &
  Partial<Pick<RunnerDeps, "readTransaction" | "readChainAnchor" | "inspectChain">>;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A failure in the wording of a cancellation. `describeTxError` words replaced, cancelled and reset transactions for an
 * order being placed ("nothing was ordered", "place the order again"), which would be wrong here.
 */
function cancelFailure(error: unknown, hash: Hex | undefined): FlowFailure {
  const described = describeTxError(error);
  let { title, detail } = described;
  if (described.kind === "cancelled") {
    title = "The cancel request was itself cancelled";
    detail = "Your wallet sent a different, cancelling transaction instead, so this cancellation did not happen. The order may still be open: check My orders.";
  } else if (described.kind === "replaced") {
    title = "The cancel request was replaced";
    detail = "A different transaction from your wallet took its place and was mined, so this cancellation did not happen. Check My orders and that transaction before trying again.";
  } else if (described.kind === "chain-reset") {
    detail = detail.replace("Check My orders and place the order again only if it is not listed.", "Check My orders and cancel again only if the order is still listed.");
  }
  // Once a hash exists the wallet has broadcast it. Unless the chain said otherwise, it may still be mined.
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

/**
 * Drives one `cancelOrder(orderId)` through the lifecycle the ticket uses, with the P2-5 reducer events: simulate,
 * wallet, bounded receipt wait (speed-ups followed, replacements and chain resets detected), then verify. No token
 * approval is involved. Success (`RECONCILED`) needs a successful receipt, an `OrderCancelled` event for this order,
 * market and trader, and `getOrder` at the receipt block reading Cancelled. A hash, a simulation or an event alone is
 * never success. The refund is checked against the order as it was in the block before (so a fill that happened
 * after the row was drawn does not produce a false alarm) and against the tokens' own `Transfer` events.
 */
export async function runCancel(deps: CancelDeps, p: CancelParams, dispatch: (event: FlowEvent<CancelOutcome>) => void, isCurrent: () => boolean): Promise<void> {
  const call: ContractCall = { address: p.pair.market, abi: orderBookAbi, functionName: "cancelOrder", args: [p.orderId] };
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
          detail: "The transaction was mined and reverted, so the order was not cancelled. Only gas was spent.",
          step: "order",
          hash,
        },
      });
    }

    dispatch({ type: "ORDER_MINED", attempt: p.attempt });

    const decoded = decodeCancelReceipt({
      logs: receipt.logs,
      market: p.pair.market,
      baseToken: p.pair.baseToken,
      quoteToken: p.pair.quoteToken,
      user: p.ctx.account,
      orderId: p.orderId,
    });
    if (!decoded.ok) {
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          kind: "unknown",
          title: "Confirmed, but the cancellation could not be verified",
          detail: `The transaction succeeded but its receipt has no OrderCancelled event for order #${p.orderId} from this market for your account. Open the transaction page to inspect it, and check My orders.`,
          step: "order",
          hash,
        },
      });
    }

    const [before, after, latest] = await Promise.all([
      deps.readOrder(p.pair.market, p.orderId, receipt.blockNumber - 1n),
      deps.readOrder(p.pair.market, p.orderId, receipt.blockNumber),
      deps.readOrder(p.pair.market, p.orderId),
    ]);
    if (!isCurrent()) return;

    const c = decoded.receipt;
    const problems: string[] = [];
    if (!isCancellableStatus(before.status)) problems.push("The order was not open, partly filled or pending in the block before the cancellation.");
    if (!same(before.trader, p.ctx.account)) problems.push("The order belonged to a different account in the block before the cancellation.");
    if (after.status !== 3) problems.push("The order does not read Cancelled in the block that cancelled it.");
    if (after.lockedQuote !== 0n) problems.push("The cancelled order still shows locked quote.");
    const expected = expectedRefund(before) ?? { token: before.side === 0 ? ("quote" as const) : ("base" as const), amount: 0n };
    const wantBase = expected.token === "base" ? expected.amount : 0n;
    const wantQuote = expected.token === "quote" ? expected.amount : 0n;
    if (c.refundBase !== wantBase || c.refundQuote !== wantQuote) problems.push("The refund in the OrderCancelled event differs from the order's unfilled amount or locked quote.");
    if (c.transferredBase !== c.refundBase || c.transferredQuote !== c.refundQuote) problems.push("The tokens that moved to you differ from the refund in the OrderCancelled event.");

    dispatch({
      type: "RECONCILED",
      attempt: p.attempt,
      result: {
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        orderId: p.orderId,
        side: before.side === 0 ? "buy" : "sell",
        before,
        after,
        latest,
        expected,
        refundBase: c.refundBase,
        refundQuote: c.refundQuote,
        transferredBase: c.transferredBase,
        transferredQuote: c.transferredQuote,
        problems,
      },
    });
  } catch (e) {
    if (isCurrent()) dispatch({ type: "FAILED", attempt: p.attempt, failure: cancelFailure(e, hash) });
  }
}

