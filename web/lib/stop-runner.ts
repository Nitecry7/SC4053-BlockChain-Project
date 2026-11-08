import type { Hex } from "viem";
import { orderBookAbi } from "./contracts/abis";
import { describeTxError } from "./errors";
import { SIDE_INDEX } from "./order-input";
import { fail, waitBounded, type ContractCall, type OrderOutcome, type RunParams, type RunnerDeps } from "./order-runner";
import type { FlowEvent } from "./order-flow";
import type { OrderSnapshot } from "./order-status";
import { decodeStopReceipt, type StopReceipt } from "./receipt";
import { requiredQuote } from "./units";

/**
 * What a confirmed `placeStopLimitOrder` produced, from the receipt and from `getOrder`, never from the simulation.
 * A stop is PENDING after placement: nothing about activation or execution is claimed here.
 */
export type StopOutcome = {
  stop: true;
  hash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
  decoded: StopReceipt;
  /** `getOrder` at the receipt block (the order as the transaction left it). */
  atBlock: OrderSnapshot;
  /** `getOrder` now. */
  latest: OrderSnapshot;
  /** Non-empty means the logs and the chain disagree: shown to the user instead of a plain success. */
  problems: string[];
};

/** What the order ticket's lifecycle can end with: a limit order's result or a stop-limit order's (pending) result. */
export type TicketOutcome = OrderOutcome | StopOutcome;

export const isStopOutcome = (r: unknown): r is StopOutcome => typeof r === "object" && r !== null && (r as { stop?: unknown }).stop === true;

/** Compares the receipt's order with `getOrder` at the receipt block. Pure; every message names what disagrees. */
export function reconcileStop(receipt: StopReceipt, atBlock: OrderSnapshot): string[] {
  const problems: string[] = [];
  if (atBlock.id !== receipt.orderId) problems.push("getOrder returned a different order id than the event.");
  if (atBlock.status !== 4) problems.push("The order does not read PendingTrigger in the block that placed it.");
  if (atBlock.trader.toLowerCase() !== receipt.trader.toLowerCase()) problems.push("The order's trader differs from the event's trader.");
  if ((atBlock.side === 0 ? "buy" : "sell") !== receipt.side) problems.push("The order's side differs from the event.");
  if (atBlock.triggerPrice !== receipt.triggerPrice) problems.push("The order's trigger price differs from the event.");
  if (atBlock.price !== receipt.limitPrice) problems.push("The order's limit price differs from the event.");
  if (atBlock.amount !== receipt.amount) problems.push("The order's amount differs from the event.");
  if (atBlock.filled !== 0n) problems.push("A pending stop order should have nothing filled.");
  if (receipt.side === "buy") {
    const want = requiredQuote(receipt.amount, receipt.limitPrice);
    if (atBlock.lockedQuote !== want) problems.push("The locked quote is not requiredQuote(amount, limit price).");
    if (receipt.escrowQuote !== want || receipt.escrowBase !== 0n) problems.push("The tokens that moved to the order book differ from the quote escrow at the LIMIT price.");
  } else {
    if (atBlock.lockedQuote !== 0n) problems.push("A sell stop should hold no quote collateral.");
    if (receipt.escrowBase !== receipt.amount || receipt.escrowQuote !== 0n) problems.push("The tokens that moved to the order book differ from the base amount of the sell stop.");
  }
  return problems;
}

/** Step 2 of a stop-limit order (the approval is the shared `runApproval`): simulate, sign, wait, decode, reconcile. */
export async function runStopOrder(deps: RunnerDeps, p: RunParams, dispatch: (event: FlowEvent<StopOutcome>) => void, isCurrent: () => boolean): Promise<void> {
  const order = p.order;
  const call: ContractCall = {
    address: p.pair.market,
    abi: orderBookAbi,
    functionName: "placeStopLimitOrder",
    args: [SIDE_INDEX[order.side], order.triggerPrice ?? 0n, order.price, order.amount],
  };
  let hash: Hex | undefined;
  try {
    if (order.kind !== "stop" || order.triggerPrice === undefined) throw new Error("runStopOrder needs a stop-limit order with a trigger price.");
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
          detail: "The transaction was mined and reverted, so no stop order was placed. Only gas was spent.",
          step: "order",
          hash,
        },
      });
    }

    dispatch({ type: "ORDER_MINED", attempt: p.attempt });

    const decoded = decodeStopReceipt({ logs: receipt.logs, market: p.pair.market, baseToken: p.pair.baseToken, quoteToken: p.pair.quoteToken, user: p.ctx.account });
    if (!decoded.ok) {
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          kind: "unknown",
          title: "Confirmed, but the stop order could not be verified",
          detail: "The transaction succeeded but its receipt has no StopOrderPlaced event from this market for your account. Open the transaction page to inspect it.",
          step: "order",
          hash,
        },
      });
    }

    // The order that was mined must be the order that was requested (a different transaction under the same nonce must not be reported as this one).
    const mined = decoded.receipt;
    if (mined.side !== order.side || mined.triggerPrice !== order.triggerPrice || mined.limitPrice !== order.price || mined.amount !== order.amount) {
      return dispatch({
        type: "FAILED",
        attempt: p.attempt,
        failure: {
          kind: "replaced",
          title: "Confirmed, but it is not the stop order you requested",
          detail: "The transaction that was mined placed a stop order with a different side, trigger price, limit price or amount. Check My orders before doing anything else.",
          step: "order",
          hash: receipt.transactionHash,
        },
      });
    }

    const [atBlock, latest] = await Promise.all([deps.readOrder(p.pair.market, mined.orderId, receipt.blockNumber), deps.readOrder(p.pair.market, mined.orderId)]);
    if (!isCurrent()) return;
    dispatch({
      type: "RECONCILED",
      attempt: p.attempt,
      result: { stop: true, hash: receipt.transactionHash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed, decoded: mined, atBlock, latest, problems: reconcileStop(mined, atBlock) },
    });
  } catch (e) {
    if (isCurrent()) fail(dispatch, p.attempt, "order", e, hash);
  }
}
