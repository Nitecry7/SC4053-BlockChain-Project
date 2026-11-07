"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CircleCheck, CircleX, LoaderCircle, RotateCcw, TriangleAlert, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { failureCopy, successCopy, waitingCopy, type PromptCopy, type WalletRequestKind } from "@/lib/wallet-prompt";
import type { DescribedError } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Milliseconds since the component mounted. Ticks once a second; a page cannot know more than this. */
export function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, []);
  return elapsed;
}

const tone = {
  waiting: { ring: "border-lilac/30", icon: "text-lilac", Icon: LoaderCircle, spin: true },
  rejected: { ring: "border-warn/35", icon: "text-warn", Icon: TriangleAlert, spin: false },
  error: { ring: "border-sell/35", icon: "text-sell", Icon: CircleX, spin: false },
  success: { ring: "border-buy/35", icon: "text-buy", Icon: CircleCheck, spin: false },
} as const;

/** One notice, four distinct states. Announced politely to assistive technology. */
function Notice({ copy, onRetry, retryLabel = "Try again", className }: { copy: PromptCopy; onRetry?: () => void; retryLabel?: string; className?: string }) {
  const t = tone[copy.state];
  return (
    <div role="status" aria-live="polite" data-state={copy.state} className={cn("glass-inset flex gap-3 rounded-[0.875rem] border px-3.5 py-3", t.ring, className)}>
      <span className={cn("mt-0.5 shrink-0", t.icon)} aria-hidden>
        <t.Icon className={cn("size-5", t.spin && "animate-spin")} />
      </span>
      <div className="min-w-0 flex-1 text-[0.75rem] leading-relaxed">
        <p className="text-[0.8125rem] font-semibold text-foreground">{copy.title}</p>
        {copy.body && <p className="mt-0.5 text-[#c3cce0]">{copy.body}</p>}
        {copy.state === "waiting" && copy.recovery.length > 0 && (
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[#c3cce0]">
            {copy.recovery.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        {onRetry && (copy.state !== "waiting" || copy.escalated) && (
          <Button type="button" variant="outline" size="sm" className="mt-2.5 gap-1.5" onClick={onRetry}>
            <RotateCcw aria-hidden /> {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Shown while a wallet request is pending. It states where to look and, after 20 seconds, how to recover. It never
 * claims the popup is visible or hidden: a web page cannot tell.
 */
export function WalletWaiting({ kind, onRetry, className }: { kind: WalletRequestKind; onRetry?: () => void; className?: string }) {
  const elapsed = useElapsed();
  return <Notice copy={waitingCopy(kind, elapsed)} onRetry={onRetry} className={className} />;
}

/** A finished request: rejected in the wallet, failed with an error, or succeeded. */
export function WalletOutcome({
  kind,
  error,
  success,
  onRetry,
  retryLabel,
  className,
}: { kind: WalletRequestKind; onRetry?: () => void; retryLabel?: string; className?: string } & (
  | { error: DescribedError; success?: undefined }
  | { success: string; error?: undefined }
)) {
  const copy = error ? failureCopy(kind, error) : successCopy(kind, success);
  return <Notice copy={copy} onRetry={copy.state === "success" ? undefined : onRetry} retryLabel={retryLabel} className={className} />;
}

/**
 * The initial connection request. `connecting` (not the background `reconnecting` on page load) means the app has asked
 * the wallet to connect and is waiting for the user to answer it. RainbowKit's connect dialog covers the whole page
 * while it waits, so this notice floats above everything (a portal at the highest z-index) to stay readable. "Try
 * again" drops the local pending state and reopens the connect dialog; a request still open inside MetaMask must be
 * rejected there first (the notice says so).
 */
export function ConnectingNotice() {
  const { status } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  if (status !== "connecting" || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-[2147483647] mx-auto max-w-lg" data-testid="connect-pending">
      <div className="pointer-events-auto rounded-[0.875rem] bg-[#0e1527] shadow-[0_18px_48px_-12px_rgb(0_0_0/0.8)]">
        <WalletWaiting
          kind="connect"
          onRetry={() => {
            disconnect();
            openConnectModal?.();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

export { Wallet as WalletIcon };
