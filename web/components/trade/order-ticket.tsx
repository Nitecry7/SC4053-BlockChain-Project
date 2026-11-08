"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowDownUp, CircleAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useSwitchChain } from "wagmi";
import { AddressChip } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { TokenMark } from "@/components/data/token-mark";
import { Panel } from "@/components/dashboard/panel";
import type { DashboardState } from "@/components/dashboard/use-dashboard";
import { WalletOutcome, WalletWaiting } from "@/components/wallet/wallet-pending-notice";
import { useAllowance } from "@/hooks/use-dex-data";
import { useOrderFlow } from "@/hooks/use-order-flow";
import { anvil } from "@/lib/chains";
import { describeError } from "@/lib/errors";
import { validateOrderInput, type Side } from "@/lib/order-input";
import { stopHints, stopState, stopStateText, validateStopInput } from "@/lib/stop-orders";
import { isStopOutcome } from "@/lib/stop-runner";
import { TICKET_BOOK_DEPTH, allowanceStep, estimateExecution } from "@/lib/order-plan";
import { formatExact, quoteCost } from "@/lib/units";
import { cn } from "@/lib/utils";
import { OrderResult } from "./order-result";
import { StopResult } from "./stop-result";
import { TxStatus } from "./tx-status";

function Field({
  id,
  label,
  value,
  onChange,
  symbol,
  hint,
  error,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  symbol: string;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("glass-inset relative rounded-[0.875rem] px-3.5 py-3", error && "border-sell/50")}>
      <label htmlFor={id} className="text-[0.6875rem] text-[#c3cce0]">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.0"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className="tabular min-w-0 flex-1 bg-transparent text-[1.375rem] font-semibold text-foreground outline-none placeholder:text-[#6f7899] disabled:cursor-not-allowed disabled:text-[#b2b9d0]"
        />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#151d2f]/80 py-1 pr-2.5 pl-1 text-[0.75rem] font-semibold">
          <TokenMark symbol={symbol} size="sm" /> {symbol}
        </span>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[0.6875rem] text-sell">
          {error}
        </p>
      ) : (
        hint && (
          <div id={`${id}-hint`} className="mt-1 text-[0.6875rem] text-subtle">
            {hint}
          </div>
        )
      )}
    </div>
  );
}

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular text-right", strong && "font-semibold")}>{children}</dd>
    </>
  );
}

const BUSY_LABEL = {
  "approve-wallet": "Waiting for MetaMask…",
  "approve-confirming": "Confirming approval…",
  simulating: "Checking with the contract…",
  "order-wallet": "Waiting for MetaMask…",
  "order-confirming": "Confirming on-chain…",
  reconciling: "Reading the result…",
} as const;

/**
 * The limit-order ticket (this exchange is an order book, not an AMM; there are no swaps or market orders). Every
 * number is exact bigint arithmetic against the contract's own lot size, tick size and `requiredQuote` rule. The flow:
 * validate, review, approve exactly the collateral if the allowance is short, then place. Each wallet request is a
 * separate, explicit click, and nothing is called a success until the receipt has been read.
 */
export function OrderTicket({ state, action }: { state: DashboardState; action?: ReactNode }) {
  const { pair, account, network, live, ready, balances, marketAddress } = state;
  const snap = state.market.data;
  const { base, quote } = pair;

  const [mode, setMode] = useState<"limit" | "stop">("limit");
  const [triggerText, setTriggerText] = useState("");
  const [side, setSide] = useState<Side>("buy");
  const [priceText, setPriceText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const flowPair = useMemo(() => ({ market: marketAddress, baseToken: base.address, quoteToken: quote.address }), [marketAddress, base.address, quote.address]);
  const ZERO = "0x0000000000000000000000000000000000000000";
  const pairKnown = base.address !== ZERO && quote.address !== ZERO;
  const settling = state.deployment.settling;
  const flow = useOrderFlow(live && !settling && pairKnown ? flowPair : undefined);
  const { openConnectModal } = useConnectModal();
  const sw = useSwitchChain();
  const phase = flow.state.phase;

  // A different account, network or market ends the review step: the allowance and approval it showed belong to the
  // previous context. (The typed price and amount are kept; they are the visitor's own draft, not account data.)
  const ctxKey = `${flow.ctx.account}:${flow.ctx.chainId}:${flow.ctx.market}`.toLowerCase();
  const [seenCtxKey, setSeenCtxKey] = useState(ctxKey);
  if (seenCtxKey !== ctxKey) {
    setSeenCtxKey(ctxKey);
    setReviewing(false);
  }

  const wallet = ready && balances.data ? { base: balances.data[0]!, quote: balances.data[1]! } : undefined;
  const validation = snap
    ? mode === "stop"
      ? validateStopInput({ side, triggerText, priceText, amountText, lotSize: snap.lotSize, tickSize: snap.tickSize, balances: wallet })
      : validateOrderInput({ side, priceText, amountText, lotSize: snap.lotSize, tickSize: snap.tickSize, balances: wallet })
    : undefined;
  const order = validation?.ok ? validation.order : undefined;
  const errors: { price?: { message: string }; amount?: { message: string }; balance?: { message: string }; trigger?: { message: string } } = validation && !validation.ok ? validation.errors : {};
  const showErr = (text: string, e?: { message: string }) => (text !== "" ? e?.message : undefined);

  const collateralToken = order?.collateralToken === "quote" ? quote : base;
  const allowance = useAllowance(order ? collateralToken.address : undefined, ready ? account.address : undefined, marketAddress);
  const step = order ? allowanceStep(order.collateral, allowance.data) : "unknown";

  // At most `maxMatches` iterations of bigint arithmetic: cheap enough to compute on every render.
  let estimate: ReturnType<typeof estimateExecution> | undefined;
  if (mode === "limit" && order && snap) {
    try {
      estimate = estimateExecution({
        side: order.side,
        price: order.price,
        amount: order.amount,
        book: order.side === "buy" ? snap.asks : snap.bids,
        maxMatches: Number(snap.maxMatchesPerTx),
        snapshotDepth: TICKET_BOOK_DEPTH,
      });
    } catch {
      estimate = undefined; // an overflow the contract would also reject; validation already refused such orders
    }
  }

  const unverified = state.tokens.data?.filter((t) => !t.issuedByFactory).map((t) => t.symbol) ?? [];
  // If a token's name, symbol or supply cannot be read, the "not from TokenFactory" check cannot run: do not trade it.
  const tokensFailed = state.tokens.isError;
  const tokensReady = state.tokens.data !== undefined;
  const locked = flow.busy || reviewing;

  const edit = (apply: () => void) => {
    apply();
    setReviewing(false);
    if (phase === "failed") flow.reset();
  };

  // The one primary button, chosen from wallet, network, market, validation, allowance and lifecycle state.
  let cta: { label: string; onClick?: () => void; disabled?: boolean };
  if (state.deployment.status.kind === "unreachable") cta = { label: "Node unreachable", disabled: true };
  else if (settling) cta = { label: "Verifying chain…", disabled: true };
  else if (!live) cta = { label: "Market unavailable", disabled: true };
  else if (network.kind === "disconnected") cta = { label: "Connect wallet", onClick: () => openConnectModal?.() };
  else if (network.kind === "connecting") cta = { label: "Waiting for wallet…", disabled: true };
  else if (network.kind === "wrong-network")
    cta = { label: sw.isPending ? "Waiting for wallet…" : "Switch to Anvil", onClick: () => sw.switchChain({ chainId: anvil.id }), disabled: sw.isPending };
  else if (!snap) cta = { label: "Reading market…", disabled: true };
  else if (tokensFailed) cta = { label: "Token details unreadable", disabled: true };
  else if (!tokensReady) cta = { label: "Reading token details…", disabled: true };
  else if (flow.busy) cta = { label: BUSY_LABEL[phase as keyof typeof BUSY_LABEL] ?? "Working…", disabled: true };
  else if (phase === "stale") cta = { label: "Dismiss", onClick: flow.reset };
  else if (phase === "failed") cta = { label: "Try again", onClick: flow.reset };
  else if (!order) cta = { label: priceText === "" && amountText === "" && triggerText === "" ? (mode === "stop" ? "Enter a trigger, a limit and an amount" : "Enter a price and amount") : "Fix the highlighted fields", disabled: true };
  else if (!reviewing) cta = { label: mode === "stop" ? "Review stop-limit order" : "Review order", onClick: () => setReviewing(true) };
  else if (step === "unknown") cta = { label: "Checking allowance…", disabled: true };
  else if (step === "approval-required")
    cta = { label: `Approve ${formatExact(order.collateral)} ${collateralToken.symbol}`, onClick: () => flow.startApproval(order) };
  else cta = { label: mode === "stop" ? `Place ${side} stop-limit order` : `Place ${side} order`, onClick: () => flow.startOrder(order) };

  const done = phase === "done" && flow.state.result;
  const approvalKind = phase === "approve-wallet" || phase === "approve-confirming" || (phase === "failed" && flow.state.failure?.step === "approve");
  const bestAsk = snap && snap.bestAsk.id !== 0n ? snap.bestAsk.price : undefined;
  const bestBid = snap && snap.bestBid.id !== 0n ? snap.bestBid.price : undefined;

  return (
    <Panel id="order" title={mode === "stop" ? "Stop-limit order" : "Limit order"} action={action}>
      {done ? (
        <div className="space-y-3">
          {isStopOutcome(flow.state.result) ? <StopResult outcome={flow.state.result} state={state} /> : <OrderResult outcome={flow.state.result!} state={state} />}
          <button
            type="button"
            onClick={() => {
              flow.reset();
              setReviewing(false);
              setAmountText("");
              setPriceText("");
              setTriggerText("");
            }}
            className="h-11 w-full rounded-xl border border-white/20 bg-white/[0.04] text-[0.8125rem] font-semibold text-white hover:bg-white/[0.08]"
          >
            Place another order
          </button>
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Order type" className="mb-2 flex gap-1 rounded-[0.875rem] border border-white/[0.1] bg-[#10162a]/60 p-1">
            {(["limit", "stop"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                data-testid={`mode-${m}`}
                disabled={locked}
                onClick={() => edit(() => setMode(m))}
                className={cn(
                  "flex-1 rounded-[0.625rem] border border-transparent py-1.5 text-[0.75rem] font-medium text-[#c5cce3] transition-colors disabled:cursor-not-allowed",
                  mode === m && "glass-active text-white",
                )}
              >
                {m === "limit" ? "Limit" : "Stop-limit"}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Order side" className="mb-3 flex gap-1 rounded-[0.875rem] border border-white/[0.1] bg-[#10162a]/60 p-1">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={side === s}
                disabled={locked}
                onClick={() => edit(() => setSide(s))}
                className={cn(
                  "flex-1 rounded-[0.625rem] border border-transparent py-2 text-[0.8125rem] font-medium text-[#c5cce3] transition-colors disabled:cursor-not-allowed",
                  side === s && "glass-active text-white",
                )}
              >
                {s === "buy" ? `Buy ${base.symbol}` : `Sell ${base.symbol}`}
              </button>
            ))}
          </div>

          <fieldset disabled={locked || !live || settling} className="min-w-0 space-y-2">
            <legend className="sr-only">Order details</legend>
            {mode === "stop" && (
              <>
                <Field
                  id="order-trigger"
                  label="Trigger price"
                  value={triggerText}
                  onChange={(v) => edit(() => setTriggerText(v))}
                  symbol={quote.symbol}
                  error={showErr(triggerText, errors.trigger)}
                  hint={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>
                        {side === "sell" ? "Becomes eligible when the last trade is at or below this" : "Becomes eligible when the last trade is at or above this"}
                      </span>
                      <span data-testid="last-trade-hint">
                        {snap?.hasTradePrice ? (
                          <>
                            Last trade <Amount value={snap.lastTradePrice} visible={4} showTail={false} />
                          </>
                        ) : (
                          "No trade yet: stops cannot trigger until the first trade"
                        )}
                      </span>
                    </span>
                  }
                />
                <p className="px-1 text-[0.6875rem] text-subtle" data-testid="stop-explainer">
                  The <strong className="font-medium text-[#c3cce0]">trigger price</strong> is the market condition that makes the pending order eligible. The{" "}
                  <strong className="font-medium text-[#c3cce0]">limit price</strong> is the price boundary at which it may trade once it is activated. The order waits, with its collateral escrowed, outside the order book.
                </p>
              </>
            )}
            <Field
              id="order-price"
              label="Limit price"
              value={priceText}
              onChange={(v) => edit(() => setPriceText(v))}
              symbol={quote.symbol}
              error={showErr(priceText, errors.price)}
              hint={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span>
                    {quote.symbol} per {base.symbol}
                  </span>
                  {bestAsk !== undefined && (
                    <button type="button" className="text-lilac hover:text-white" onClick={() => edit(() => setPriceText(formatExact(bestAsk)))}>
                      Best ask <Amount value={bestAsk} visible={4} showTail={false} />
                    </button>
                  )}
                  {bestBid !== undefined && (
                    <button type="button" className="text-lilac hover:text-white" onClick={() => edit(() => setPriceText(formatExact(bestBid)))}>
                      Best bid <Amount value={bestBid} visible={4} showTail={false} />
                    </button>
                  )}
                </span>
              }
            />
            <div className="relative -my-1 flex justify-center">
              <span className="z-10 grid size-8 place-items-center rounded-[0.625rem] border border-white/20 bg-[#1c2440] text-muted-foreground" aria-hidden>
                <ArrowDownUp className="size-4" />
              </span>
            </div>
            <Field
              id="order-amount"
              label="Amount"
              value={amountText}
              onChange={(v) => edit(() => setAmountText(v))}
              symbol={base.symbol}
              error={showErr(amountText, errors.amount)}
              hint={side === "buy" ? `Escrows ${quote.symbol} at your limit; refunds any price improvement` : `Escrows the ${base.symbol} you sell`}
            />
          </fieldset>

          {errors.balance && priceText !== "" && amountText !== "" && (
            <p role="alert" className="mt-2 flex items-center gap-1.5 text-[0.75rem] text-sell">
              <CircleAlert className="size-4 shrink-0" aria-hidden /> {errors.balance.message}
            </p>
          )}

          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.6875rem]">
            <Row label={`Wallet ${base.symbol}`}>{wallet ? <Amount value={wallet.base} visible={4} showTail={false} /> : "—"}</Row>
            <Row label={`Wallet ${quote.symbol}`}>{wallet ? <Amount value={wallet.quote} visible={4} showTail={false} /> : "—"}</Row>
            <Row label="Lot size">{snap ? <Amount value={snap.lotSize} visible={9} showTail={false} symbol={base.symbol} /> : "—"}</Row>
            <Row label="Tick size">{snap ? <Amount value={snap.tickSize} visible={9} showTail={false} symbol={quote.symbol} /> : "—"}</Row>
          </dl>

          {order && (
            <dl className="glass-inset mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-[0.875rem] px-3.5 py-3 text-[0.75rem]" aria-label="Order summary">
              {order.kind === "stop" && order.triggerPrice !== undefined && (
                <Row label="Trigger price">
                  <Amount value={order.triggerPrice} visible={4} showTail={false} symbol={quote.symbol} />
                </Row>
              )}
              <Row label={order.kind === "stop" ? `Escrowed now, at the limit price (${collateralToken.symbol})` : `Escrowed collateral (${collateralToken.symbol})`} strong>
                <Amount value={order.collateral} visible={4} showTail={false} symbol={collateralToken.symbol} />
              </Row>
              <Row label={order.side === "buy" ? "Most you can pay" : "You receive if filled at your limit"}>
                <Amount value={order.side === "buy" ? order.collateral : quoteCost(order.amount, order.price)} visible={4} showTail={false} symbol={quote.symbol} />
              </Row>
              {wallet && (
                <Row label={`Wallet ${collateralToken.symbol} after escrow`}>
                  <Amount value={(order.collateralToken === "quote" ? wallet.quote : wallet.base) - order.collateral} visible={4} showTail={false} />
                </Row>
              )}
              <Row label="Order book allowance">
                {allowance.data !== undefined ? <Amount value={allowance.data} visible={4} showTail={false} symbol={collateralToken.symbol} /> : "—"}
              </Row>
              {estimate && (
                <>
                  <dt className="col-span-2 mt-1 border-t border-white/[0.08] pt-2 text-[0.6875rem] font-medium text-[#c3cce0]">Estimate against the current book</dt>
                  <Row label="Fills right away">
                    {estimate.fills.length > 0 ? (
                      <>
                        <Amount value={estimate.filledBase} visible={4} showTail={false} symbol={base.symbol} /> in {estimate.fills.length}
                      </>
                    ) : (
                      "None: rests on the book"
                    )}
                  </Row>
                  {estimate.fills.length > 0 && (
                    <Row label={order.side === "buy" ? "Paid at maker prices" : "Received at maker prices"}>
                      <Amount value={estimate.tradedQuote} visible={4} showTail={false} symbol={quote.symbol} />
                    </Row>
                  )}
                  {order.side === "buy" && estimate.refundQuote > 0n && (
                    <Row label="Refund for price improvement">
                      <Amount value={estimate.refundQuote} visible={4} showTail={false} symbol={quote.symbol} />
                    </Row>
                  )}
                  {estimate.remainingBase > 0n && (
                    <Row label="Rests on the book">
                      <Amount value={estimate.remainingBase} visible={4} showTail={false} symbol={base.symbol} />
                    </Row>
                  )}
                  <dd className="col-span-2 text-[0.6875rem] text-muted-foreground">
                    An estimate from the book as read now. The contract decides when the transaction is mined, at the makers&rsquo; prices.
                  </dd>
                  {estimate.crossedRemainder && (
                    <dd className="col-span-2 text-[0.6875rem] text-warn">
                      The engine matches at most {snap?.maxMatchesPerTx.toString()} orders per transaction. The rest would be placed on the book and could stay
                      crossed; nothing matches it in the background, but anyone can settle it afterwards with Match orders.
                    </dd>
                  )}
                  {estimate.bookSnapshotExhausted && (
                    <dd className="col-span-2 text-[0.6875rem] text-warn">More orders may cross beyond the part of the book read here.</dd>
                  )}
                </>
              )}
            </dl>
          )}

          {mode === "stop" && order && order.triggerPrice !== undefined && snap && (
            <ul className="mt-2 space-y-1 text-[0.6875rem] text-warn" data-testid="stop-hints" aria-label="Stop-limit notes">
              {stopHints({ side: order.side, triggerPrice: order.triggerPrice, limitPrice: order.price, lastTradePrice: snap.lastTradePrice, hasTradePrice: snap.hasTradePrice }).map((h) => (
                <li key={h.code}>{h.text}</li>
              ))}
            </ul>
          )}

          {reviewing && order && (
            <div className="mt-3 space-y-2 rounded-[0.875rem] border border-lilac/30 bg-[#161d36]/70 px-3.5 py-3 text-[0.75rem]" role="group" aria-labelledby="order-review-title" data-testid="review">
              <p id="order-review-title" className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
                <ShieldCheck className="size-4 text-lilac" aria-hidden /> Review before you sign
              </p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                <Row label="Market">
                  {base.symbol} / {quote.symbol}
                </Row>
                <Row label="Side">{order.side === "buy" ? `Buy ${base.symbol}` : `Sell ${base.symbol}`}</Row>
                {order.kind === "stop" && order.triggerPrice !== undefined && (
                  <Row label="Trigger price">
                    <Amount value={order.triggerPrice} visible={4} showTail={false} symbol={quote.symbol} />
                  </Row>
                )}
                <Row label="Limit price">
                  <Amount value={order.price} visible={4} showTail={false} symbol={quote.symbol} />
                </Row>
                <Row label="Amount">
                  <Amount value={order.amount} visible={4} showTail={false} symbol={base.symbol} />
                </Row>
                <Row label="Market contract">
                  <AddressChip address={marketAddress} copy={false} className="text-[0.6875rem]" />
                </Row>
                <Row label={`${collateralToken.symbol} token contract`}>
                  <AddressChip address={collateralToken.address} copy={false} className="text-[0.6875rem]" />
                </Row>
              </dl>
              {order.kind === "stop" && order.triggerPrice !== undefined && snap && (
                <p className="text-[#c3cce0]" data-testid="stop-review-state">
                  This is a <strong>stop-limit</strong> order. It is escrowed now, at the limit price, and stays <strong>pending</strong> (not on the order book, not tradable) until it is activated.{" "}
                  {stopStateText(stopState(order.side, order.triggerPrice, snap.lastTradePrice, snap.hasTradePrice), order.side, formatExact(order.triggerPrice))}{" "}
                  Activation is a separate transaction (Trigger stops) that anyone can send, and activation is not a guaranteed fill.
                </p>
              )}
              <p className="text-[0.6875rem] text-subtle">Symbols are chosen by whoever issues a token. The contract address is what identifies it.</p>
              {step === "approval-required" ? (
                <p className="text-[#c3cce0]">
                  Step 1 of 2: approve exactly <strong>{formatExact(order.collateral)} {collateralToken.symbol}</strong> for the order book{" "}
                  <AddressChip address={marketAddress} copy={false} className="text-[0.6875rem]" />. It lets the order book move that amount into escrow when you
                  place this order, and nothing more. Step 2 is a separate wallet request to place the order.
                </p>
              ) : step === "sufficient" ? (
                <p className="text-[#c3cce0]">
                  The order book is already approved for this collateral, so only the order itself needs your signature.
                </p>
              ) : (
                <p className="text-muted-foreground">Reading your allowance…</p>
              )}
              {unverified.length > 0 && (
                <p className="text-warn">
                  {unverified.join(" and ")} {unverified.length > 1 ? "were" : "was"} not issued by this app&rsquo;s TokenFactory. Its behaviour is unverified.
                </p>
              )}
              <button type="button" disabled={flow.busy} onClick={() => setReviewing(false)} className="text-[0.75rem] text-lilac hover:text-white disabled:opacity-50">
                Edit order
              </button>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {tokensFailed && (
              <p role="alert" className="flex gap-2 rounded-[0.75rem] border border-warn/35 bg-warn/[0.08] px-3 py-2 text-[0.75rem] text-[#e8dcb0]">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>This market&rsquo;s token details could not be read (a token may be non-standard or malicious), so the app cannot check where they came from. Trading it is disabled here.</span>
              </p>
            )}
            {flow.state.abandoned && (
              <WalletOutcome
                kind="order"
                error={{
                  kind: "unknown",
                  title: "A request you retried may still complete",
                  detail: flow.state.abandoned.hash
                    ? `The earlier ${flow.state.abandoned.step === "approve" ? "approval" : "order"} was signed after you pressed Try again (transaction ${flow.state.abandoned.hash}). Check My orders and the transaction page before sending another.`
                    : "If you approve the earlier request in your wallet it will still go through. Reject it there, or check My orders before sending another.",
                }}
                retryLabel="Dismiss"
                onRetry={flow.dismissAbandoned}
              />
            )}
            {flow.state.phase === "simulating" && <p className="text-[0.75rem] text-muted-foreground" role="status">Checking the order against the contract before your wallet is asked…</p>}
            {(phase === "approve-wallet" || phase === "order-wallet") && <WalletWaiting kind={phase === "approve-wallet" ? "approve" : "order"} onRetry={flow.reset} />}
            {(flow.busy || phase === "failed") && <TxStatus state={flow.state} kind={approvalKind ? "approval" : "order"} />}
            {phase === "failed" && flow.state.failure && (
              <WalletOutcome kind={flow.state.failure.step === "approve" ? "approve" : "order"} error={flow.state.failure} onRetry={flow.reset} />
            )}
            {phase === "stale" && (
              <WalletOutcome
                kind="order"
                error={{
                  kind: "unknown",
                  title: "Your account, network or market changed",
                  detail: `The earlier request was dropped here and its result is not applied to this view. A transaction may still have been sent from the previous account${flow.state.orderHash ? ` (${flow.state.orderHash})` : ""}: check My Orders for it.`,
                }}
                retryLabel="Dismiss"
                onRetry={flow.reset}
              />
            )}
            {sw.isPending && <WalletWaiting kind="switch" onRetry={() => sw.reset()} />}
            {sw.isError && !sw.isPending && sw.error && <WalletOutcome kind="switch" error={describeError(sw.error)} onRetry={() => sw.reset()} />}
            {phase === "idle" && reviewing && flow.state.approvalHash && step === "sufficient" && allowance.data !== undefined && (
              <WalletOutcome kind="approve" success={`The order book can move ${formatExact(allowance.data)} ${collateralToken.symbol} for you. Place the order when ready.`} />
            )}
          </div>

          <button
            type="button"
            disabled={cta.disabled}
            onClick={cta.onClick}
            className="mt-3 h-11 w-full rounded-xl border border-[rgb(208_199_255/0.3)] bg-[linear-gradient(100deg,rgb(111_92_232/0.9),rgb(118_96_228/0.9)_49%,rgb(120_98_220/0.9))] text-[0.8125rem] font-semibold text-white shadow-[inset_0_1px_5px_rgb(255_255_255/0.2),0_10px_24px_-12px_rgb(124_92_242/0.8)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-[linear-gradient(100deg,rgb(101_86_204/0.4),rgb(162_139_248/0.4)_49%,rgb(120_98_220/0.4))] disabled:text-white/70 disabled:shadow-none disabled:hover:brightness-100"
          >
            {cta.label}
          </button>
          <p className="mt-2 text-center text-[0.6875rem] text-muted-foreground">
            {mode === "stop"
              ? "Limit and stop-limit orders only. The trigger uses this market's own last trade price, not an outside price feed. A stop is not a guarantee of execution or of price."
              : "Limit orders only. Your tokens stay in your wallet until an order escrows them, and every fill settles on-chain at the maker\u2019s price."}
          </p>
        </>
      )}
    </Panel>
  );
}
