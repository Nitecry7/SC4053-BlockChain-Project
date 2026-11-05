"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, ChevronDown, Wallet } from "lucide-react";
import { AccountAvatar } from "@/components/data/account-avatar";
import { shortAddress } from "@/components/data/address-chip";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex h-10 items-center gap-2.5 rounded-full px-3 text-[0.8125rem] font-semibold whitespace-nowrap transition-[background,box-shadow] duration-150";

/** The header wallet control. RainbowKit owns the modals; this only renders the three states in the design system. */
export function ConnectControl({ className }: { className?: string }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) {
          return <span className={cn(chip, "w-36 animate-pulse bg-white/6", className)} aria-hidden="true" />;
        }
        if (!account || !chain) {
          return (
            <button type="button" onClick={openConnectModal} className={cn(chip, "glass-active pl-3.5 text-white", className)}>
              <Wallet className="size-4" aria-hidden />
              <span className="hidden sm:inline">Connect wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className={cn(chip, "border border-warn/40 bg-warn/12 text-warn hover:bg-warn/18", className)}
            >
              <AlertTriangle className="size-4" aria-hidden />
              Wrong network
            </button>
          );
        }
        return (
          <button
            type="button"
            onClick={openAccountModal}
            className={cn(chip, "border border-white/16 bg-[#1a2034]/85 pl-1.5 hover:bg-[#222a44]", className)}
            aria-label={`Wallet ${account.address}, open account menu`}
          >
            <AccountAvatar address={account.address} />
            <span className="font-mono text-[0.8125rem]">{shortAddress(account.address)}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
