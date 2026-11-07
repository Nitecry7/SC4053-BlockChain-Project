"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { AddressChip, shortAddress } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { TokenMark } from "@/components/data/token-mark";
import type { TokenOutcome } from "@/lib/create-runner";
import { displayText } from "@/lib/safe-text";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </>
  );
}

/**
 * What a confirmed `createToken` produced, read back from the chain (never from the simulation): the address comes from
 * the factory's own `TokenCreated` event, and the name, symbol, decimals, supply and your balance from the token itself.
 */
export function TokenResult({ outcome, creator }: { outcome: TokenOutcome; creator: string }) {
  const symbol = displayText(outcome.symbol, 32);
  return (
    <div className="space-y-3" data-testid="token-result">
      <div className="flex items-start gap-2.5 rounded-[0.875rem] border border-buy/30 bg-buy/[0.07] px-3.5 py-3">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-buy" aria-hidden />
        <div className="min-w-0 text-[0.75rem] leading-relaxed">
          <p className="text-[0.8125rem] font-semibold">
            Token created: <span data-testid="token-created-symbol">{symbol}</span>
          </p>
          <p className="text-[#c3cce0]">
            Confirmed in block {outcome.blockNumber.toString()}. The address comes from TokenFactory&rsquo;s own event and every property below was read back from the
            token and the registry, not from the simulation.
          </p>
        </div>
      </div>

      <div className="glass-inset flex items-center gap-3 rounded-[0.875rem] px-3.5 py-3">
        <TokenMark symbol={symbol} size="lg" />
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold">{displayText(outcome.name, 100)}</p>
          <p className="text-[0.75rem] text-muted-foreground">{symbol}</p>
        </div>
      </div>

      <dl className="glass-inset grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[0.875rem] px-3.5 py-3 text-[0.75rem]">
        <Row label="Contract address">
          <span data-testid="token-address">
            <AddressChip address={outcome.token} />
          </span>
        </Row>
        <Row label="Decimals">{outcome.decimals}</Row>
        <Row label="Total supply">
          <Amount value={outcome.totalSupply} visible={4} showTail={false} symbol={symbol} />
        </Row>
        <Row label="Your balance">
          <Amount value={outcome.creatorBalanceNow} visible={4} showTail={false} symbol={symbol} />
        </Row>
        <Row label="Issued by TokenFactory">Yes (registry position {outcome.registryIndex.toString()} of {outcome.registryCount.toString()})</Row>
        <Row label="Creator">{shortAddress(creator)}</Row>
      </dl>

      <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
        The contract address is the token&rsquo;s identity. Names and symbols are not unique: anyone can issue another token with the same ones. The whole supply
        is fixed and was minted to your wallet; there is no owner and no way to mint more.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/list-market?base=${outcome.token}`}
          className="inline-flex h-10 items-center rounded-xl border border-[rgb(208_199_255/0.3)] bg-[linear-gradient(100deg,rgb(111_92_232/0.9),rgb(118_96_228/0.9)_49%,rgb(120_98_220/0.9))] px-4 text-[0.8125rem] font-semibold text-white hover:brightness-110"
        >
          List a market for this token
        </Link>
        <Link href="/tokens" className="inline-flex h-10 items-center rounded-xl border border-white/20 bg-white/[0.04] px-4 text-[0.8125rem] font-semibold text-white hover:bg-white/[0.08]">
          View on Tokens
        </Link>
        <Link href={`/tx/${outcome.hash}`} className="inline-flex h-10 items-center px-2 font-mono text-[0.75rem] text-lilac hover:text-white" title={outcome.hash}>
          {shortAddress(outcome.hash, 10, 6)}
        </Link>
      </div>
    </div>
  );
}
