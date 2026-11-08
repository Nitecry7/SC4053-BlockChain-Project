"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { Address } from "viem";
import { Panel } from "@/components/dashboard/panel";
import { StatusBanners } from "@/components/dashboard/status-banners";
import { DEPLOYMENT } from "@/components/dashboard/use-dashboard";
import { AddressChip } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { FactoryFacts } from "@/components/registry/factory-facts";
import { PageHeader } from "@/components/registry/page-header";
import { useCreateConstants, useTokenDetails, useTokenRegistry } from "@/hooks/use-dex-data";
import { useTokenCreateFlow } from "@/hooks/use-create-flow";
import { NAME_MAX_CHARS, SYMBOL_MAX_CHARS, validateTokenInput, wholeTokens } from "@/lib/create-input";
import { displayText } from "@/lib/safe-text";
import { FlowNotices } from "./flow-notices";
import { TextField } from "./field";
import { SubmitButton } from "./submit-button";
import { TokenResult } from "./token-result";
import { useCreateContext } from "./use-create-context";

const BUSY_LABEL: Record<string, string> = {
  simulating: "Checking with the contract…",
  "order-wallet": "Waiting for MetaMask…",
  "order-confirming": "Confirming on-chain…",
  reconciling: "Reading the result…",
};

/**
 * Issue a new fixed-supply ERC-20 through `TokenFactory.createToken`. The form validates against the contract's rules
 * (and this app's stricter guard rails), asks for a deliberate review, simulates, asks MetaMask once, then waits for the
 * receipt and verifies the new token on-chain. No approval is needed: only the transaction and its gas.
 */
export function TokenForm() {
  const ctx = useCreateContext();
  const factory = DEPLOYMENT.tokenFactory as Address;
  const constants = useCreateConstants(ctx.live);
  const flow = useTokenCreateFlow(factory);
  const registry = useTokenRegistry(ctx.live);
  const list = (registry.tokens ?? []) as readonly Address[];
  const existing = useTokenDetails(list, ctx.live && list.length > 0);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supplyText, setSupplyText] = useState("");
  const [reviewing, setReviewing] = useState(false);

  // A different account or network ends the review: what it showed belonged to the previous context.
  const ctxKey = `${flow.ctx.account}:${flow.ctx.chainId}`.toLowerCase();
  const [seenCtxKey, setSeenCtxKey] = useState(ctxKey);
  if (seenCtxKey !== ctxKey) {
    setSeenCtxKey(ctxKey);
    setReviewing(false);
  }

  const { state } = flow;
  const phase = state.phase;
  const validation = constants.data ? validateTokenInput({ name, symbol, supplyText, maxSupply: constants.data.maxSupply, lotSize: constants.data.lotSize }) : undefined;
  const token = validation?.ok ? validation.token : undefined;
  const errors = validation && !validation.ok ? validation.errors : {};
  const show = (text: string, e?: { message: string }) => (text !== "" ? e?.message : undefined);

  const sameSymbol = token ? (existing.data ?? []).filter((t) => t.symbol.toLowerCase() === displayText(token.symbol, 32).toLowerCase()) : [];
  const locked = flow.busy || reviewing;

  const edit = (apply: () => void) => {
    apply();
    setReviewing(false);
    if (phase === "failed") flow.reset();
  };

  let label = reviewing ? "Create token" : "Review token";
  let onClick = () => {
    if (!reviewing) setReviewing(true);
    else if (token) flow.create(token);
  };
  let disabled = !token || !constants.data;
  if (!constants.data && ctx.live) label = "Reading factory limits…";
  if (phase === "stale") {
    label = "Dismiss";
    onClick = flow.reset;
    disabled = false;
  } else if (phase === "failed") {
    label = "Try again";
    onClick = flow.reset;
    disabled = false;
  } else if (!token && constants.data) {
    label = name === "" && symbol === "" && supplyText === "" ? "Enter a name, symbol and supply" : "Fix the highlighted fields";
  }

  const done = phase === "done" && state.result;

  return (
    <>
      <PageHeader title="Create Token" meta={registry.total !== undefined ? `${registry.total.toString()} issued so far` : undefined}>
        Issue a new ERC-20 with a fixed supply through the on-chain TokenFactory. The whole supply goes to your wallet, and nothing can ever change it.
      </PageHeader>
      <StatusBanners state={ctx} />
      <div>
        <Panel id="create-token" title={done ? "Your New Token" : "Token Details"} className="min-w-0">
          {done ? (
            <div className="space-y-3">
              <TokenResult outcome={state.result!} creator={flow.ctx.account} />
              <button
                type="button"
                onClick={() => {
                  flow.reset();
                  setReviewing(false);
                  setName("");
                  setSymbol("");
                  setSupplyText("");
                }}
                className="h-11 w-full rounded-xl border border-white/20 bg-white/[0.04] text-[0.8125rem] font-semibold text-white hover:bg-white/[0.08]"
              >
                Create another token
              </button>
            </div>
          ) : (
            <>
              <fieldset disabled={locked || !ctx.live} className="min-w-0 space-y-2">
                <legend className="sr-only">Token details</legend>
                <TextField
                  id="token-name"
                  label="Name"
                  value={name}
                  onChange={(v) => edit(() => setName(v))}
                  placeholder="Demo Coin"
                  error={show(name, errors.name)}
                  hint={`Up to ${NAME_MAX_CHARS} characters. Shown in wallets and lists.`}
                />
                <TextField
                  id="token-symbol"
                  label="Symbol"
                  value={symbol}
                  onChange={(v) => edit(() => setSymbol(v))}
                  placeholder="DMO"
                  error={show(symbol, errors.symbol)}
                  hint={`Up to ${SYMBOL_MAX_CHARS} characters. Not unique: other tokens can use the same symbol.`}
                />
                <TextField
                  id="token-supply"
                  label="Total supply"
                  value={supplyText}
                  onChange={(v) => edit(() => setSupplyText(v))}
                  placeholder="1000000"
                  inputMode="decimal"
                  error={show(supplyText, errors.supply)}
                  hint={
                    constants.data
                      ? `Whole tokens, with up to 18 decimal places. At most ${wholeTokens(constants.data.maxSupply).toLocaleString("en-US")} tokens. Decimals are fixed at 18.`
                      : "Reading the factory's supply limit from the chain…"
                  }
                />
              </fieldset>

              {reviewing && token && (
                <div className="mt-3 space-y-2 rounded-[0.875rem] border border-lilac/30 bg-[#161d36]/70 px-3.5 py-3 text-[0.75rem]" role="group" aria-labelledby="token-review-title" data-testid="review">
                  <p id="token-review-title" className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
                    <ShieldCheck className="size-4 text-lilac" aria-hidden /> Review before you sign
                  </p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="text-right font-medium">{token.name}</dd>
                    <dt className="text-muted-foreground">Symbol</dt>
                    <dd className="text-right font-medium">{token.symbol}</dd>
                    <dt className="text-muted-foreground">Decimals</dt>
                    <dd className="text-right font-medium">18 (fixed)</dd>
                    <dt className="text-muted-foreground">Total supply</dt>
                    <dd className="tabular text-right font-medium">
                      <Amount value={token.supply} visible={4} showTail={false} symbol={token.symbol} />
                    </dd>
                    <dt className="text-muted-foreground">Sent to the contract as raw units</dt>
                    <dd className="tabular text-right font-mono text-[0.6875rem]">{token.supply.toString()}</dd>
                    <dt className="text-muted-foreground">Minted to</dt>
                    <dd className="text-right">
                      <AddressChip address={flow.ctx.account} copy={false} className="text-[0.6875rem]" />
                    </dd>
                    <dt className="text-muted-foreground">Issued through</dt>
                    <dd className="text-right">
                      <AddressChip address={factory} copy={false} className="text-[0.6875rem]" />
                    </dd>
                  </dl>
                  <p className="text-[#c3cce0]">
                    All {token.symbol} is minted to your wallet. The token has no owner and no minting or burning, so the supply can never change. Creating it costs only
                    gas: no approval is needed.
                  </p>
                  {token.lotDust > 0n && (
                    <p className="text-warn">
                      This supply is not a whole number of lots (1e-9 tokens). Up to {token.lotDust.toString()} raw units can never be sold on a market, because orders must be
                      a whole number of lots.
                    </p>
                  )}
                  {sameSymbol.length > 0 && (
                    <p className="flex gap-1.5 text-warn" role="status">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        A token with the symbol {displayText(token.symbol, 32)} already exists ({sameSymbol.map((t) => `${t.address.slice(0, 6)}…${t.address.slice(-4)}`).join(", ")}).
                        Symbols are not unique; the contract address is what identifies a token.
                      </span>
                    </p>
                  )}
                  <button type="button" disabled={flow.busy} onClick={() => setReviewing(false)} className="text-[0.75rem] text-lilac hover:text-white disabled:opacity-50">
                    Edit token
                  </button>
                </div>
              )}

              <SubmitButton
                ctx={ctx}
                label={label}
                onClick={onClick}
                disabled={disabled}
                busy={flow.busy}
                busyLabel={BUSY_LABEL[phase]}
              />
              <FlowNotices kind="token" state={state} reset={flow.reset} dismissAbandoned={flow.dismissAbandoned} />
            </>
          )}
        </Panel>

        <FactoryFacts
          title="What You Are Issuing"
          address={factory}
          facts={[
            { term: "Fixed supply", detail: "The whole supply is minted once, to your wallet. There is no owner, no minting, no burning and no fees." },
            { term: "18 decimals", detail: "Always 18, as the order book requires. Enter the supply in whole tokens." },
            { term: "No approval needed", detail: "Issuing is one transaction; you pay only gas. Approvals come later, when a token is traded." },
            { term: "Names are not unique", detail: "Anyone can issue a token with the same name or symbol. Identify a token by its contract address." },
          ]}
        />
      </div>
    </>
  );
}
