import { ArrowLeftRight, BarChart3, Layers, LayoutDashboard, SquarePlus, Store, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; icon: LucideIcon; href?: string; topLabel?: string; note?: string };

/** Only routes that exist are links. Later phases are listed, disabled, with the phase they arrive in. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", topLabel: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Markets", href: "/markets", icon: BarChart3 },
  { label: "Tokens", href: "/tokens", icon: Layers },
  { label: "Trade", icon: ArrowLeftRight, note: "Order placement arrives in the next phase" },
  { label: "Create token", icon: SquarePlus, note: "Token issuance from the browser arrives in a later phase" },
  { label: "List market", icon: Store, note: "Market listing from the browser arrives in a later phase" },
];

export const TOP_NAV = NAV_ITEMS.filter((i) => i.href || i.label === "Trade");

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
