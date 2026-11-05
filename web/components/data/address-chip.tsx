"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function shortAddress(address: string, head = 6, tail = 4) {
  return address.length > head + tail + 2 ? `${address.slice(0, head)}…${address.slice(-tail)}` : address;
}

/** A shortened, copyable address. The full address is the accessible name; copying never claims anything else. */
export function AddressChip({ address, className, copy = true }: { address: string; className?: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[0.8125rem]", className)}>
      <span title={address} aria-label={address}>
        {shortAddress(address)}
      </span>
      {copy && (
        <button
          type="button"
          onClick={onCopy}
          className="inline-grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
          aria-label={copied ? "Address copied" : `Copy address ${address}`}
        >
          {copied ? <Check className="size-3.5 text-buy" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </button>
      )}
    </span>
  );
}
