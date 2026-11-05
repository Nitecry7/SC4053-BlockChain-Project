"use client";

import { Diamond, Wallet } from "lucide-react";
import { useBlockNumber } from "wagmi";
import { AccountAvatar } from "@/components/data/account-avatar";
import { AddressChip } from "@/components/data/address-chip";
import { ConnectControl } from "@/components/wallet/connect-control";
import { anvil } from "@/lib/chains";
import { cn } from "@/lib/utils";
import type { DashboardState } from "./use-dashboard";

function HeroWave() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 top-0 h-[11rem] w-full opacity-45 lg:opacity-100" viewBox="0 0 1320 170" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="hero-glow" cx="50%" cy="20%" r="60%">
          <stop offset="0" stopColor="#7482ea" stopOpacity=".85" />
          <stop offset="1" stopColor="#6378df" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-stroke" x1="0" y1="0" x2="1" y2=".8">
          <stop offset="0" stopColor="#5c79bd" stopOpacity="0" />
          <stop offset=".55" stopColor="#9ab4ff" stopOpacity=".95" />
          <stop offset="1" stopColor="#8a6bff" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d81dd" stopOpacity=".32" />
          <stop offset="1" stopColor="#7c6fe4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="690" cy="20" rx="320" ry="150" fill="url(#hero-glow)" />
      <path d="M300 104C470 176 505-38 650 58S826 196 948 82s214-52 400-6v110H300Z" fill="url(#hero-fill)" />
      <path d="M300 104C470 176 505-38 650 58S826 196 948 82s214-52 400-6" fill="none" stroke="url(#hero-stroke)" strokeWidth="2.4" style={{ filter: "drop-shadow(0 0 6px rgb(140 160 255 / 0.65))" }} />
      <path d="M360 128C520 186 560 10 690 84S860 186 990 104s200-40 360-10" fill="none" stroke="url(#hero-stroke)" strokeWidth="1" opacity=".45" />
    </svg>
  );
}

const dot = { ok: "bg-buy shadow-[0_0_0_3px_rgb(30_54_84)]", warn: "bg-warn shadow-[0_0_0_3px_rgb(70_56_24)]", bad: "bg-sell shadow-[0_0_0_3px_rgb(80_30_48)]" };

export function Hero({ state }: { state: DashboardState }) {
  const block = useBlockNumber({ chainId: anvil.id, watch: true });
  const { account, network, deployment } = state;
  const rpcDown = deployment.status.kind === "unreachable";
  const tone = rpcDown ? "bad" : network.kind === "wrong-network" || deployment.status.kind !== "ok" ? "warn" : "ok";
  const networkNote = rpcDown
    ? "Node unreachable"
    : deployment.status.kind === "missing" || deployment.status.kind === "mismatch"
      ? "No deployment on this chain"
      : block.data !== undefined
        ? `Chain ID ${anvil.id} · block ${block.data.toString()}`
        : `Chain ID ${anvil.id}`;

  return (
    <section aria-label="Overview" className="glass relative mb-4 overflow-hidden rounded-[1.375rem] bg-[linear-gradient(103deg,rgb(24_28_56/0.75),rgb(32_40_80/0.6)_45%,rgb(14_22_38/0.72))] px-5 py-5 sm:px-6">
      <HeroWave />
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="max-w-xl">
          <h1 className="text-[2.25rem] leading-[1.08] font-bold tracking-[-0.048em] sm:text-[2.5rem]">
            SC4053 <span className="text-lilac">DEX</span>
          </h1>
          <p className="mt-2 max-w-[60ch] text-[0.8125rem] leading-relaxed text-[#cbd1e7]">
            A non-custodial limit order book. Your tokens stay in your wallet until an order escrows them, and every fill
            settles on-chain at the maker&rsquo;s price.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:ml-auto lg:w-[min(40rem,52%)]">
          <div className="glass-raised flex min-h-[5.25rem] items-center gap-3 rounded-[1.125rem] px-4 py-3">
            {account.address ? (
              <AccountAvatar address={account.address} className="size-10 rounded-xl" />
            ) : (
              <span className="grid size-10 place-items-center rounded-xl bg-[#1a2239]/80 text-lilac" aria-hidden>
                <Wallet className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[0.6875rem] text-[#bbc3d9]">Wallet</p>
              {account.address ? (
                <AddressChip address={account.address} className="text-[0.9375rem] font-semibold" />
              ) : (
                <div className="mt-1">
                  <ConnectControl className="h-8 px-3 text-xs" />
                </div>
              )}
            </div>
          </div>

          <div className="glass-raised flex min-h-[5.25rem] items-center gap-3 rounded-[1.125rem] bg-[linear-gradient(130deg,rgb(49_104_119/0.32),rgb(42_53_77/0.66))] px-4 py-3">
            <span className="relative grid size-10 place-items-center rounded-xl bg-[#1a2239]/80 text-azure" aria-hidden>
              <Diamond className="size-5" />
              <span className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full", dot[tone])} />
            </span>
            <div className="min-w-0" aria-live="polite">
              <p className="text-[0.6875rem] text-[#bbc3d9]">Network</p>
              <p className="text-[0.9375rem] font-semibold whitespace-nowrap">{anvil.name}</p>
              <p className="tabular text-[0.6875rem] text-[#bbc7e3]">{networkNote}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
