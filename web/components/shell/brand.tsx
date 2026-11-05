import Link from "next/link";
import { cn } from "@/lib/utils";

/** The SC4053 DEX mark: two interlocking ribbons (bids and asks meeting), in the lilac-to-azure brand gradient. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 40" className={cn("h-9 w-7 drop-shadow-[0_2px_10px_rgb(146_107_255/0.6)]", className)} aria-hidden="true">
      <defs>
        <linearGradient id="brand-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dccbff" />
          <stop offset=".55" stopColor="#8a6cf5" />
          <stop offset="1" stopColor="#5f8dff" />
        </linearGradient>
        <linearGradient id="brand-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7aa8ff" />
          <stop offset="1" stopColor="#7c5cf2" />
        </linearGradient>
      </defs>
      <path d="M25 2 9.5 13.4C5 16.7 5.6 22.6 10.6 24.6l6.4 2.6c1.7.7 1.9 2.9.4 4L7 38.5l15.8-9.9c4.5-2.8 4-8.9-.9-10.9l-6.6-2.7c-1.6-.7-1.8-2.8-.4-3.9z" fill="url(#brand-a)" />
      <path d="M25 2 30 7 14.8 18.3c-1.4-.7-1.6-2.8-.2-3.9z" fill="url(#brand-b)" opacity=".75" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="SC4053 DEX, home">
      <BrandMark />
      {!compact && (
        <span className="text-[1.3125rem] font-bold tracking-[-0.045em] whitespace-nowrap">
          SC4053 <span className="text-lilac">DEX</span>
        </span>
      )}
    </Link>
  );
}
