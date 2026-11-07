import { cn } from "@/lib/utils";

// The letter colour is part of each palette so that it keeps at least 4.5:1 across the letter (P2-8A.2, R8; measured in
// docs/ai-audit/test-evidence/person2/p2-8a2-liveness.md): white on the purple (start stop darkened a little), dark navy on
// the three light palettes, where white measured 2.0 to 3.4.
const PALETTES = [
  "from-[#8860f2] to-[#5b3ad8] text-white shadow-[0_4px_14px_-2px_rgb(124_92_242/0.55)]",
  "from-[#7ec1ff] to-[#2f74ee] text-[#0a0f24] shadow-[0_4px_14px_-2px_rgb(76_140_255/0.5)]",
  "from-[#5fe0b8] to-[#1f9c86] text-[#0a0f24] shadow-[0_4px_14px_-2px_rgb(52_200_160/0.45)]",
  "from-[#ff9ec2] to-[#d9467b] text-[#0a0f24] shadow-[0_4px_14px_-2px_rgb(230_90_140/0.45)]",
];

function paletteFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length]!;
}

/** A coin mark: the token's first letter on a gradient disc. Decorative; the symbol is always written next to it. */
export function TokenMark({ symbol, size = "md", className }: { symbol: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "size-5 text-[0.6875rem]", md: "size-8 text-sm", lg: "size-10 text-base" };
  const fixed: Record<string, string> = { NTU: PALETTES[0]!, SGDX: PALETTES[1]! };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-linear-to-br font-bold ring-1 ring-white/20",
        sizes[size],
        fixed[symbol.toUpperCase()] ?? paletteFor(symbol),
        className,
      )}
    >
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Two overlapping marks for a pair, base first. */
export function PairMark({ base, quote, size = "sm" }: { base: string; quote: string; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center" aria-hidden="true">
      <TokenMark symbol={base} size={size} />
      <TokenMark symbol={quote} size={size} className="-ml-1.5" />
    </span>
  );
}
