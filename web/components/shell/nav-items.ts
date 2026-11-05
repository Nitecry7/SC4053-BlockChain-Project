import { ArrowLeftRight, BarChart3, Layers, LayoutDashboard, SquarePlus, Store, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; icon: LucideIcon; href?: string; topLabel?: string; note?: string; sideOnly?: boolean };

/** Only routes that exist are links. `sideOnly` entries are in the sidebar but not the (narrower) top bar. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", topLabel: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Markets", href: "/markets", icon: BarChart3 },
  { label: "Tokens", href: "/tokens", icon: Layers },
  { label: "Trade", href: "/trade", icon: ArrowLeftRight },
  { label: "Create token", href: "/create-token", icon: SquarePlus, sideOnly: true },
  { label: "List market", href: "/list-market", icon: Store, sideOnly: true },
];

export const TOP_NAV = NAV_ITEMS.filter((i) => i.href && !i.sideOnly);

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
