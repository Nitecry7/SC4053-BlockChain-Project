import { parseEventLogs, type Address, type Hex } from "viem";
import { demoTokenAbi, marketFactoryAbi, orderBookAbi, tokenFactoryAbi } from "./contracts/abis";
import type { Side } from "./order-input";

type RawLog = { address: Address; topics: readonly Hex[]; data: Hex; logIndex?: number | null };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export type DecodedTrade = {
  makerOrderId: bigint;
  takerOrderId: bigint;
  maker: Address;
  taker: Address;
  /** The maker's price (execution is always at the maker's price). */
  price: bigint;
  baseAmount: bigint;
  quoteAmount: bigint;
};

type OrderBookEvent =
  | { eventName: "OrderPlaced"; args: { orderId: bigint; trader: Address; side: number; price: bigint; amount: bigint } }
  | { eventName: "Trade"; args: DecodedTrade }
  | { eventName: string; args?: unknown };

type TokenEvent =
  | { eventName: "Transfer"; args: { from: Address; to: Address; value: bigint } }
  | { eventName: "Approval"; args: { owner: Address; spender: Address; value: bigint } }
  | { eventName: string; args?: unknown };

/** Decodes only logs emitted BY the given address, so another contract cannot spoof an order event. */
function decodeFrom<E>(abi: typeof orderBookAbi | typeof demoTokenAbi | typeof tokenFactoryAbi | typeof marketFactoryAbi, logs: readonly RawLog[], emitter: Address): E[] {
  const own = logs.filter((l) => same(l.address, emitter));
  return parseEventLogs({ abi, logs: own as never }) as unknown as E[];
}

export type OrderReceipt = {
  orderId: bigint;
  side: Side;
  price: bigint;
  amount: bigint;
  /** Trades in this transaction where the new order was the taker, in log order. */
  trades: DecodedTrade[];
  filledBase: bigint;
  /** Quote exchanged across those trades at the makers' prices. */
  tradedQuote: bigint;
  /** Collateral the order book pulled from the user (`Transfer(user -> market)` of the collateral token). */
  escrowPulled: bigint;
  /** Buy: quote returned to the user during matching (price improvement). 0 for a sell. */
  refundQuote: bigint;
  /** Base tokens that moved from the market to the user (a buy's fills). */
  baseReceived: bigint;
  /** Quote tokens the user received as the seller (a sell's fills). */
  quoteReceived: bigint;
  /** The user was both maker and taker in at least one fill. */
  selfTrade: boolean;
};

export type OrderReceiptResult = { ok: true; receipt: OrderReceipt } | { ok: false; reason: "no-order-placed" | "ambiguous-order-placed" };

/**
 * Reads what a `placeLimitOrder` transaction actually did from its logs: the order id from `OrderPlaced`, the fills
 * from `Trade`, and the token movements from the tokens' own `Transfer` events. The simulated return value is never
 * used for the id. Logs are accepted only from the market and the two tokens of the pair.
 */
export function decodeOrderReceipt(input: {
  logs: readonly RawLog[];
  market: Address;
  baseToken: Address;
  quoteToken: Address;
  user: Address;
}): OrderReceiptResult {
  const { logs, market, baseToken, quoteToken, user } = input;
  const marketEvents = decodeFrom<OrderBookEvent>(orderBookAbi, logs, market);

  const placed = marketEvents.filter(
    (e): e is Extract<OrderBookEvent, { eventName: "OrderPlaced" }> =>
      e.eventName === "OrderPlaced" && e.args !== undefined && same((e.args as { trader: Address }).trader, user),
  );
  if (placed.length === 0) return { ok: false, reason: "no-order-placed" };
  if (placed.length > 1) return { ok: false, reason: "ambiguous-order-placed" };
  const order = placed[0]!.args;
  const side: Side = order.side === 0 ? "buy" : "sell";

  const trades = marketEvents
    .filter((e): e is Extract<OrderBookEvent, { eventName: "Trade" }> => e.eventName === "Trade")
    .map((e) => e.args)
    .filter((t) => t.takerOrderId === order.orderId);

  const transfers = (token: Address) =>
    decodeFrom<TokenEvent>(demoTokenAbi, logs, token)
      .filter((e): e is Extract<TokenEvent, { eventName: "Transfer" }> => e.eventName === "Transfer")
      .map((e) => e.args);
  const baseTransfers = transfers(baseToken);
  const quoteTransfers = transfers(quoteToken);

  const sum = (xs: readonly { value: bigint }[]) => xs.reduce((a, t) => a + t.value, 0n);
  const toUser = (xs: ReturnType<typeof transfers>) => xs.filter((t) => same(t.from, market) && same(t.to, user));
  const fromUser = (xs: ReturnType<typeof transfers>) => xs.filter((t) => same(t.from, user) && same(t.to, market));

  const selfFills = trades.filter((t) => same(t.maker, user) && same(t.taker, user));
  const selfTrade = selfFills.length > 0;
  const tradedQuote = trades.reduce((a, t) => a + t.quoteAmount, 0n);
  const filledBase = trades.reduce((a, t) => a + t.baseAmount, 0n);

  // When the user trades against their own resting order, the payment to "the seller" lands back with the user and
  // must not be counted as a refund.
  const selfPaidAsSeller = side === "buy" ? selfFills.reduce((a, t) => a + t.quoteAmount, 0n) : 0n;
  const quoteBack = sum(toUser(quoteTransfers));

  return {
    ok: true,
    receipt: {
      orderId: order.orderId,
      side,
      price: order.price,
      amount: order.amount,
      trades,
      filledBase,
      tradedQuote,
      escrowPulled: sum(fromUser(side === "buy" ? quoteTransfers : baseTransfers)),
      refundQuote: side === "buy" ? quoteBack - selfPaidAsSeller : 0n,
      baseReceived: sum(toUser(baseTransfers)),
      quoteReceived: side === "sell" ? quoteBack : 0n,
      selfTrade,
    },
  };
}

export type ReconcileProblem = string;

/**
 * Cross-checks the decoded logs against `getOrder` read at the receipt block. These identities hold in the engine
 * (SPEC rule A6), so a mismatch means a decoding or accounting bug, never a rounding artefact.
 */
export function reconcileOrder(
  receipt: OrderReceipt,
  order: { id: bigint; amount: bigint; filled: bigint; lockedQuote: bigint },
): ReconcileProblem[] {
  const problems: ReconcileProblem[] = [];
  if (order.id !== receipt.orderId) problems.push("The order read from the chain has a different id than the OrderPlaced event.");
  if (order.amount !== receipt.amount) problems.push("The order's amount differs from the OrderPlaced event.");
  if (order.filled !== receipt.filledBase) problems.push("The order's filled amount differs from the sum of its Trade events.");
  if (receipt.side === "buy") {
    // escrow pulled = quote paid out in fills + quote refunded + quote still locked for the resting remainder
    if (receipt.escrowPulled !== receipt.tradedQuote + receipt.refundQuote + order.lockedQuote) {
      problems.push("Escrow does not equal traded quote + refund + locked quote.");
    }
  } else {
    if (receipt.escrowPulled !== receipt.amount) problems.push("Escrowed base differs from the order amount.");
    if (order.lockedQuote !== 0n) problems.push("A sell order should hold no quote collateral.");
  }
  return problems;
}

export type CancelReceipt = {
  orderId: bigint;
  trader: Address;
  /** Refund reported by `OrderCancelled`. */
  refundBase: bigint;
  refundQuote: bigint;
  /** Tokens that actually moved from the market to the trader in this transaction (the tokens' own `Transfer` events). */
  transferredBase: bigint;
  transferredQuote: bigint;
};

export type CancelReceiptResult = { ok: true; receipt: CancelReceipt } | { ok: false; reason: "no-order-cancelled" | "ambiguous-order-cancelled" };

/**
 * Reads what a `cancelOrder` transaction actually did: the `OrderCancelled` event for the requested order, emitted by
 * this market for this trader, and the tokens' `Transfer(market -> trader)` events. Anything else (another order's
 * cancellation, another market, another trader) is not accepted, so a replaced transaction cannot be reported as ours.
 */
export function decodeCancelReceipt(input: {
  logs: readonly RawLog[];
  market: Address;
  baseToken: Address;
  quoteToken: Address;
  user: Address;
  orderId: bigint;
}): CancelReceiptResult {
  const { logs, market, baseToken, quoteToken, user, orderId } = input;
  const cancelled = decodeFrom<{ eventName: string; args?: { orderId: bigint; trader: Address; refundBase: bigint; refundQuote: bigint } }>(orderBookAbi, logs, market).filter(
    (e) => e.eventName === "OrderCancelled" && e.args !== undefined && e.args.orderId === orderId && same(e.args.trader, user),
  );
  if (cancelled.length === 0) return { ok: false, reason: "no-order-cancelled" };
  if (cancelled.length > 1) return { ok: false, reason: "ambiguous-order-cancelled" };
  const a = cancelled[0]!.args!;
  const moved = (token: Address) =>
    decodeFrom<TokenEvent>(demoTokenAbi, logs, token)
      .filter((e): e is Extract<TokenEvent, { eventName: "Transfer" }> => e.eventName === "Transfer")
      .map((e) => e.args)
      .filter((t) => same(t.from, market) && same(t.to, user))
      .reduce((sum, t) => sum + t.value, 0n);
  return {
    ok: true,
    receipt: { orderId, trader: a.trader, refundBase: a.refundBase, refundQuote: a.refundQuote, transferredBase: moved(baseToken), transferredQuote: moved(quoteToken) },
  };
}

export type TxEvent =
  | { kind: "OrderPlaced"; market: Address; orderId: bigint; trader: Address; side: Side; price: bigint; amount: bigint }
  | ({ kind: "Trade"; market: Address } & DecodedTrade)
  | { kind: "OrderCancelled"; market: Address; orderId: bigint; trader: Address; refundBase: bigint; refundQuote: bigint }
  | { kind: "Transfer"; token: Address; from: Address; to: Address; value: bigint }
  | { kind: "Approval"; token: Address; owner: Address; spender: Address; value: bigint };

/**
 * Decodes every recognised event in a receipt for the transaction page. Only logs emitted by the registered markets
 * and tokens are decoded; anything else is counted as `unrecognised` and never presented as a trade.
 */
export function decodeTxEvents(input: { logs: readonly (RawLog & { logIndex?: number })[]; markets: readonly Address[]; tokens: readonly Address[] }) {
  const events: { logIndex: number; event: TxEvent }[] = [];
  let recognisedLogs = 0;

  for (const market of input.markets) {
    const own = input.logs.filter((l) => same(l.address, market));
    const decoded = parseEventLogs({ abi: orderBookAbi, logs: own as never }) as unknown as (OrderBookEvent & { logIndex?: number })[];
    for (const e of decoded) {
      if (e.eventName === "OrderPlaced" && e.args) {
        const a = e.args as { orderId: bigint; trader: Address; side: number; price: bigint; amount: bigint };
        events.push({ logIndex: e.logIndex ?? 0, event: { kind: "OrderPlaced", market, orderId: a.orderId, trader: a.trader, side: a.side === 0 ? "buy" : "sell", price: a.price, amount: a.amount } });
        recognisedLogs++;
      } else if (e.eventName === "Trade" && e.args) {
        events.push({ logIndex: e.logIndex ?? 0, event: { kind: "Trade", market, ...(e.args as DecodedTrade) } });
        recognisedLogs++;
      } else if (e.eventName === "OrderCancelled" && e.args) {
        const a = e.args as { orderId: bigint; trader: Address; refundBase: bigint; refundQuote: bigint };
        events.push({ logIndex: e.logIndex ?? 0, event: { kind: "OrderCancelled", market, ...a } });
        recognisedLogs++;
      }
    }
  }
  for (const token of input.tokens) {
    const own = input.logs.filter((l) => same(l.address, token));
    const decoded = parseEventLogs({ abi: demoTokenAbi, logs: own as never }) as unknown as (TokenEvent & { logIndex?: number })[];
    for (const e of decoded) {
      if (e.eventName === "Transfer" && e.args) {
        const a = e.args as { from: Address; to: Address; value: bigint };
        events.push({ logIndex: e.logIndex ?? 0, event: { kind: "Transfer", token, from: a.from, to: a.to, value: a.value } });
        recognisedLogs++;
      } else if (e.eventName === "Approval" && e.args) {
        const a = e.args as { owner: Address; spender: Address; value: bigint };
        events.push({ logIndex: e.logIndex ?? 0, event: { kind: "Approval", token, owner: a.owner, spender: a.spender, value: a.value } });
        recognisedLogs++;
      }
    }
  }
  events.sort((a, b) => a.logIndex - b.logIndex);
  return { events: events.map((e) => e.event), unrecognised: Math.max(input.logs.length - recognisedLogs, 0) };
}

export type TokenCreatedEvent = { token: Address; creator: Address; name: string; symbol: string; initialSupply: bigint };
export type MarketCreatedEvent = { market: Address; base: Address; quote: Address; creator: Address };
export type CreatedEventResult<E> = { ok: true; event: E } | { ok: false; reason: "none" | "multiple" };

/**
 * Reads the `TokenCreated` event of a `createToken` transaction. Only logs emitted BY the TokenFactory are decoded, and
 * only an event whose `creator` is the sending account counts. Zero or more than one is refused: the new token's
 * address is never guessed and never taken from the simulation.
 */
export function decodeTokenCreated(input: { logs: readonly RawLog[]; factory: Address; creator: Address }): CreatedEventResult<TokenCreatedEvent> {
  const events = decodeFrom<{ eventName: string; args?: TokenCreatedEvent }>(tokenFactoryAbi, input.logs, input.factory).filter(
    (e): e is { eventName: "TokenCreated"; args: TokenCreatedEvent } => e.eventName === "TokenCreated" && e.args !== undefined && same(e.args.creator, input.creator),
  );
  if (events.length === 0) return { ok: false, reason: "none" };
  if (events.length > 1) return { ok: false, reason: "multiple" };
  return { ok: true, event: events[0]!.args };
}

/** The same for `MarketCreated` from the MarketFactory. */
export function decodeMarketCreated(input: { logs: readonly RawLog[]; factory: Address; creator: Address }): CreatedEventResult<MarketCreatedEvent> {
  const events = decodeFrom<{ eventName: string; args?: MarketCreatedEvent }>(marketFactoryAbi, input.logs, input.factory).filter(
    (e): e is { eventName: "MarketCreated"; args: MarketCreatedEvent } => e.eventName === "MarketCreated" && e.args !== undefined && same(e.args.creator, input.creator),
  );
  if (events.length === 0) return { ok: false, reason: "none" };
  if (events.length > 1) return { ok: false, reason: "multiple" };
  return { ok: true, event: events[0]!.args };
}
