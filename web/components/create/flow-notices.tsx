"use client";

import { TxStatus } from "@/components/trade/tx-status";
import { WalletOutcome, WalletWaiting } from "@/components/wallet/wallet-pending-notice";
import { isBusy, type FlowState } from "@/lib/order-flow";

/**
 * The lifecycle notices shared by both create forms, identical in behaviour to the ticket's: the checking line, the
 * pending-wallet guidance, the step list with the transaction hash, the failure and rejection states, a flow dropped
 * because the account or network changed, and a request that was abandoned with "Try again" but may still complete.
 */
export function FlowNotices({
  kind,
  state,
  reset,
  dismissAbandoned,
}: {
  kind: "token" | "market";
  state: FlowState;
  reset: () => void;
  dismissAbandoned: () => void;
}) {
  const { phase } = state;
  return (
    <div className="mt-3 space-y-2">
      {state.abandoned && (
        <WalletOutcome
          kind={kind}
          error={{
            kind: "unknown",
            title: "A request you retried may still complete",
            detail: state.abandoned.hash
              ? `The earlier request was signed after you pressed Try again (transaction ${state.abandoned.hash}). Check the Tokens and Markets pages, and the transaction page, before sending another.`
              : "If you approve the earlier request in your wallet it will still go through. Reject it there, or check the Tokens and Markets pages before sending another.",
          }}
          retryLabel="Dismiss"
          onRetry={dismissAbandoned}
        />
      )}
      {phase === "simulating" && (
        <p className="text-[0.75rem] text-muted-foreground" role="status">
          Checking with the contract before your wallet is asked…
        </p>
      )}
      {phase === "order-wallet" && <WalletWaiting kind={kind} onRetry={reset} />}
      {(isBusy(phase) || phase === "failed") && <TxStatus state={state} kind="order" />}
      {phase === "failed" && state.failure && <WalletOutcome kind={kind} error={state.failure} onRetry={reset} />}
      {phase === "stale" && (
        <WalletOutcome
          kind={kind}
          error={{
            kind: "unknown",
            title: "Your account or network changed",
            detail: `The earlier request was dropped here and its result is not applied to this view. A transaction may still have been sent from the previous account${state.orderHash ? ` (${state.orderHash})` : ""}: check the Tokens and Markets pages for it.`,
          }}
          retryLabel="Dismiss"
          onRetry={reset}
        />
      )}
    </div>
  );
}
