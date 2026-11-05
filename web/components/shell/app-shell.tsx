"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveBlock } from "@/hooks/use-dex-data";
import { cn } from "@/lib/utils";
import { ConnectControl } from "@/components/wallet/connect-control";
import { ConnectingNotice } from "@/components/wallet/wallet-pending-notice";
import { Brand } from "./brand";
import { NAV_ITEMS, TOP_NAV, isActive, type NavItem } from "./nav-items";
import { SearchBox } from "./search-box";

function TopLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const label = item.topLabel ?? item.label;
  if (!item.href) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span aria-disabled="true" tabIndex={0} />}
          className="cursor-not-allowed rounded-full px-4 py-2.5 text-[0.875rem] font-medium text-muted-foreground/70"
        >
          {label}
        </TooltipTrigger>
        <TooltipContent>{item.note}</TooltipContent>
      </Tooltip>
    );
  }
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border border-transparent px-4 py-2.5 text-[0.875rem] font-medium text-[#d3d7ea] transition-colors hover:text-white",
        active && "glass-active text-white",
      )}
    >
      {label}
    </Link>
  );
}

function SideLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Sections" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const base = "flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3.5 text-[0.875rem] font-medium";
        if (!item.href) {
          return (
            <div key={item.label} aria-disabled="true" className={cn(base, "cursor-not-allowed text-muted-foreground/60")}>
              <Icon className="size-5" aria-hidden />
              <span className="flex-1 whitespace-nowrap">{item.label}</span>
              <span className="text-[0.6875rem] font-medium text-subtle">Soon</span>
            </div>
          );
        }
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(base, "text-[#e1e4f6] transition-colors hover:bg-white/6", active && "glass-active text-white hover:bg-transparent")}
          >
            <Icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarWave() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-20 h-72 w-full opacity-90" viewBox="0 0 208 260" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="side-wave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9c80fb" stopOpacity="0" />
          <stop offset=".5" stopColor="#a48cff" stopOpacity=".55" />
          <stop offset="1" stopColor="#6aa4ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 14, 28, 42].map((d) => (
        <path key={d} d={`M-20 ${200 - d} C 40 ${140 - d}, 110 ${250 - d}, 230 ${120 - d}`} fill="none" stroke="url(#side-wave)" strokeWidth={d === 0 ? 1.6 : 1} opacity={1 - d / 70} />
      ))}
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useLiveBlock();

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[linear-gradient(90deg,rgb(7_10_22/0.94),rgb(15_23_46/0.9),rgb(8_12_24/0.95))] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-4 px-4 md:px-6 lg:gap-7 lg:pl-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<button type="button" />}
              className="inline-grid size-10 place-items-center rounded-xl text-[#d3d7ea] hover:bg-white/6 md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-white/12 bg-[#0d1426]/95 p-4 backdrop-blur-xl">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="mb-4 pt-1">
                <Brand />
              </div>
              <SideLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Brand />
          <nav aria-label="Main" className="hidden flex-1 items-center gap-1.5 lg:flex">
            {TOP_NAV.map((item) => (
              <TopLink key={item.label} item={item} pathname={pathname} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SearchBox className="hidden w-[min(22rem,26vw)] md:flex" />
            <ConnectControl />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-4 px-3 pt-4 pb-6 md:grid-cols-[76px_minmax(0,1fr)] md:px-4 xl:grid-cols-[212px_minmax(0,1fr)]">
        <aside className="glass sticky! top-20 hidden h-[calc(100dvh-6rem)] flex-col self-start overflow-hidden rounded-[1.375rem] md:flex">
          <div className="relative z-10 p-2.5 xl:p-3">
            <div className="xl:hidden">
              <CompactSideLinks pathname={pathname} />
            </div>
            <div className="hidden xl:block">
              <SideLinks pathname={pathname} />
            </div>
          </div>
          <SidebarWave />
          <div className="relative z-10 mt-auto hidden p-5 xl:block">
            <p className="text-[0.9375rem] font-semibold">SC4053 DEX</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Limit order book for NTU and SGDx, on a local Anvil chain.</p>
          </div>
        </aside>
        <main id="main" className="min-w-0">
          <ConnectingNotice />
          {children}
        </main>
      </div>
    </div>
  );
}

function CompactSideLinks({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Sections" className="flex flex-col items-center gap-1.5">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.href ? isActive(pathname, item.href) : false;
        const cls = cn(
          "grid size-12 place-items-center rounded-xl border border-transparent",
          item.href ? "text-[#e1e4f6] hover:bg-white/6" : "cursor-not-allowed text-muted-foreground/50",
          active && "glass-active text-white",
        );
        return (
          <Tooltip key={item.label}>
            <TooltipTrigger
              render={item.href ? <Link href={item.href} aria-current={active ? "page" : undefined} /> : <span aria-disabled="true" tabIndex={0} />}
              className={cls}
              aria-label={item.href ? item.label : `${item.label}, not available yet`}
            >
              <Icon className="size-5" aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="right">{item.href ? item.label : item.note}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
