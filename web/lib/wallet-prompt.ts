import type { DescribedError } from "./errors";

/** The kinds of request that open a prompt in the user's wallet. */
export type WalletRequestKind = "connect" | "approve" | "order" | "switch";

/** After this long without an answer, the notice adds recovery steps. */
export const ESCALATION_MS = 20_000;

/**
 * The guidance shown while a wallet request is pending. A web page cannot know whether the extension popup is visible
 * (or open at all), so this only says where to look; it never claims to have detected anything.
 */
export const WALLET_WAIT_MESSAGE =
  "Waiting for MetaMask confirmation. Check the MetaMask icon in your browser toolbar. If no popup appears, open your browser's Extensions menu and look for a pending request.";

const TITLES: Record<WalletRequestKind, string> = {
  connect: "Connect request sent to your wallet",
  approve: "Token approval request sent to your wallet",
  order: "Order signature request sent to your wallet",
  switch: "Network switch request sent to your wallet",
};

const SUCCESS_TITLES: Record<WalletRequestKind, string> = {
  connect: "Wallet connected",
  approve: "Approval confirmed on-chain",
  order: "Order confirmed on-chain",
  switch: "Switched to Anvil",
};

/** Steps for a request that has been pending a while. */
export const RECOVERY_STEPS: readonly string[] = [
  "Open MetaMask from your browser's Extensions menu and look for a pending request.",
  "If you dismissed the popup, the request may still be open inside MetaMask. Reject it there first.",
  "Then press Try again here to start over.",
];

export type PromptCopy =
  | { state: "waiting"; title: string; body: string; recovery: readonly string[]; escalated: boolean }
  | { state: "rejected"; title: string; body: string }
  | { state: "error"; title: string; body: string }
  | { state: "success"; title: string; body: string };

export function isEscalated(elapsedMs: number): boolean {
  return elapsedMs >= ESCALATION_MS;
}

/** The notice text for a pending request, with recovery steps once it has been waiting for `ESCALATION_MS`. */
export function waitingCopy(kind: WalletRequestKind, elapsedMs: number): PromptCopy {
  const escalated = isEscalated(elapsedMs);
  return {
    state: "waiting",
    title: TITLES[kind],
    body: WALLET_WAIT_MESSAGE,
    recovery: escalated ? RECOVERY_STEPS : [],
    escalated,
  };
}

export function successCopy(kind: WalletRequestKind, detail?: string): PromptCopy {
  return { state: "success", title: SUCCESS_TITLES[kind], body: detail ?? "" };
}

/** Distinct states for a dismissed request and for a failed one. `error` is what `describeError` produced. */
export function failureCopy(kind: WalletRequestKind, error: DescribedError): PromptCopy {
  if (error.kind === "rejected") {
    const what: Record<WalletRequestKind, string> = {
      connect: "connection",
      approve: "approval",
      order: "order",
      switch: "network switch",
    };
    return {
      state: "rejected",
      title: `You rejected the ${what[kind]} request`,
      body: "Nothing was sent. Press Try again when you are ready; MetaMask will ask once more.",
    };
  }
  return { state: "error", title: error.title, body: error.detail };
}
