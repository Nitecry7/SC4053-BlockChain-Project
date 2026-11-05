import { cn } from "@/lib/utils";

/** A deterministic gradient avatar derived from the address bytes. Not an identity claim, just a visual anchor. */
export function AccountAvatar({ address, className }: { address: string; className?: string }) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(12, "0");
  const hueA = parseInt(hex.slice(0, 4), 16) % 360;
  const hueB = (hueA + 60 + (parseInt(hex.slice(4, 8), 16) % 120)) % 360;
  const angle = parseInt(hex.slice(8, 12), 16) % 360;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-7 shrink-0 rounded-[9px] ring-1 ring-white/25", className)}
      style={{ background: `linear-gradient(${angle}deg, hsl(${hueA} 80% 62%), hsl(${hueB} 75% 48%))` }}
    />
  );
}
