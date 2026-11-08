"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSwitchChain } from "wagmi";
import { WalletOutcome, WalletWaiting } from "@/components/wallet/wallet-pending-notice";
import { anvil } from "@/lib/chains";
import { describeError } from "@/lib/errors";
import type { CreateContext } from "./use-create-context";

const PRIMARY =
  "mt-3 h-11 w-full rounded-xl border border-[rgb(208_199_255/0.3)] bg-[linear-gradient(100deg,rgb(111_92_232/0.9),rgb(118_96_228/0.9)_49%,rgb(120_98_220/0.9))] text-[0.8125rem] font-semibold text-white shadow-[inset_0_1px_5px_rgb(255_255_255/0.2),0_10px_24px_-12px_rgb(124_92_242/0.8)] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-[linear-gradient(100deg,rgb(101_86_204/0.4),rgb(162_139_248/0.4)_49%,rgb(120_98_220/0.4))] disabled:text-white/70 disabled:shadow-none disabled:hover:brightness-100";

/**
 * The one primary button of a create form. It first deals with what stands between the visitor and a transaction
 * (no deployment, no wallet, the wrong network), then shows the form's own action. Switching network from here shows
 * the same pending-wallet guidance as everywhere else.
 */
export function SubmitButton({
  ctx,
  label,
  onClick,
  disabled,
  busy,
  busyLabel,
}: {
  ctx: CreateContext;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
}) {
  const { openConnectModal } = useConnectModal();
  const sw = useSwitchChain();
  const { live, network } = ctx;

  let action: { label: string; onClick?: () => void; disabled?: boolean };
  if (!live) action = { label: "Deployment unavailable", disabled: true };
  else if (network.kind === "disconnected") action = { label: "Connect wallet", onClick: () => openConnectModal?.() };
  else if (network.kind === "connecting") action = { label: "Waiting for wallet…", disabled: true };
  else if (network.kind === "wrong-network")
    action = { label: sw.isPending ? "Waiting for wallet…" : "Switch to Anvil", onClick: () => sw.switchChain({ chainId: anvil.id }), disabled: sw.isPending };
  else if (busy) action = { label: busyLabel ?? "Working…", disabled: true };
  else action = { label, onClick, disabled };

  return (
    <>
      <button type="button" disabled={action.disabled} onClick={action.onClick} className={PRIMARY}>
        {action.label}
      </button>
      {sw.isPending && <WalletWaiting kind="switch" className="mt-2" onRetry={() => sw.reset()} />}
      {sw.isError && !sw.isPending && sw.error && <WalletOutcome kind="switch" className="mt-2" error={describeError(sw.error)} onRetry={() => sw.reset()} />}
    </>
  );
}
