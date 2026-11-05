"use client";

import type { Address } from "viem";
import { AddressChip, shortAddress } from "@/components/data/address-chip";
import { Amount } from "@/components/data/amount";
import { TokenMark } from "@/components/data/token-mark";
import type { TokenDetails } from "@/hooks/use-dex-data";
import { parseAddressInput, type TokenProbe } from "@/lib/create-plan";
import { cn } from "@/lib/utils";

/** One side of a pair as the visitor entered it: an address (from the registry list or pasted) and whether it is pasted. */
export type SlotValue = { text: string; custom: boolean };
export const EMPTY_SLOT: SlotValue = { text: "", custom: false };

const OTHER = "__other";

export function resolveSlot(slot: SlotValue): { address?: Address; error?: string } {
  if (slot.text === "") return {};
  const parsed = parseAddressInput(slot.text);
  return parsed.ok ? { address: parsed.address } : { error: parsed.message };
}

/** What the chain says about the chosen token, shown under the picker. Provenance is "issued by this app's TokenFactory", nothing more. */
function ProbeCard({ probe, address }: { probe: TokenProbe | undefined; address: Address }) {
  if (!probe || probe.status === "loading") return <p className="mt-2 text-[0.6875rem] text-muted-foreground">Reading the token from the chain…</p>;
  if (probe.status === "not-a-token")
    return (
      <p className="mt-2 text-[0.75rem] text-sell" role="alert">
        This address does not answer like an ERC-20 token: its decimals() cannot be read.
      </p>
    );
  return (
    <div className="mt-2 space-y-1 text-[0.75rem]" data-testid="token-probe">
      <div className="flex items-center gap-2">
        <TokenMark symbol={probe.symbol ?? "?"} size="sm" />
        <span className="font-semibold">{probe.symbol ?? "No symbol"}</span>
        <span className="truncate text-muted-foreground">{probe.name ?? "no name"}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.6875rem]">
        <dt className="text-muted-foreground">Address</dt>
        <dd className="text-right">
          <AddressChip address={address} copy={false} className="text-[0.6875rem]" />
        </dd>
        <dt className="text-muted-foreground">Decimals</dt>
        <dd className={cn("tabular text-right", probe.decimals !== 18 && "text-sell")}>{probe.decimals}</dd>
        {probe.totalSupply !== undefined && (
          <>
            <dt className="text-muted-foreground">Total supply</dt>
            <dd className="tabular text-right">
              <Amount value={probe.totalSupply} visible={2} showTail={false} />
            </dd>
          </>
        )}
      </dl>
      {probe.issuedByFactory ? (
        <p className="text-buy">Issued by this app&rsquo;s TokenFactory</p>
      ) : (
        <p className="text-warn" data-testid="unverified">
          Not issued by this app&rsquo;s TokenFactory. Its code is unverified: it may behave in ways this app cannot check. Anyone can list any 18-decimal token.
        </p>
      )}
    </div>
  );
}

/** A token picker for one side of a market: the TokenFactory registry, or any other contract address. */
export function TokenSlot({
  id,
  label,
  help,
  value,
  onChange,
  registry,
  disabled,
  probe,
}: {
  id: string;
  label: string;
  help: string;
  value: SlotValue;
  onChange: (value: SlotValue) => void;
  registry: readonly TokenDetails[];
  disabled?: boolean;
  probe: TokenProbe | undefined;
}) {
  const { address, error } = resolveSlot(value);
  const inRegistry = address ? registry.some((t) => t.address.toLowerCase() === address.toLowerCase()) : false;
  const selectValue = value.custom ? OTHER : value.text;

  return (
    <div className={cn("glass-inset rounded-[0.875rem] px-3.5 py-3", error && value.text !== "" && "border-sell/50")}>
      <label htmlFor={id} className="text-[0.6875rem] text-[#c3cce0]">
        {label}
      </label>
      <p className="text-[0.6875rem] text-subtle">{help}</p>
      <select
        id={id}
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === OTHER ? { text: value.custom ? value.text : "", custom: true } : { text: v, custom: false });
        }}
        className="mt-2 h-10 w-full min-w-0 rounded-full border border-white/16 bg-[#0f1528]/80 px-3.5 text-[0.8125rem] text-foreground outline-none focus-visible:border-lilac/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="" className="bg-[#10172a]">
          Choose a token…
        </option>
        {registry.map((t) => (
          <option key={t.address} value={t.address} className="bg-[#10172a]">
            {t.symbol} · {t.name} · {shortAddress(t.address)}
          </option>
        ))}
        {!value.custom && address && !inRegistry && (
          <option value={value.text} className="bg-[#10172a]">
            Token {shortAddress(value.text)}
          </option>
        )}
        <option value={OTHER} className="bg-[#10172a]">
          Other address…
        </option>
      </select>
      {value.custom && (
        <div className="mt-2">
          <label htmlFor={`${id}-address`} className="sr-only">
            {label} contract address
          </label>
          <input
            id={`${id}-address`}
            value={value.text}
            onChange={(e) => onChange({ text: e.target.value, custom: true })}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            aria-invalid={error && value.text !== "" ? true : undefined}
            aria-describedby={error && value.text !== "" ? `${id}-address-error` : undefined}
            className="h-10 w-full min-w-0 rounded-xl border border-white/16 bg-[#0f1528]/80 px-3 font-mono text-[0.8125rem] text-foreground outline-none placeholder:text-[#6f7899] focus-visible:border-lilac/50 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      )}
      {error && value.text !== "" && (
        <p id={`${id}-address-error`} className="mt-1 text-[0.6875rem] text-sell">
          {error}
        </p>
      )}
      {address && <ProbeCard probe={probe} address={address} />}
    </div>
  );
}
