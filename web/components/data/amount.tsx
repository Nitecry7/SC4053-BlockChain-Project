import { cn } from "@/lib/utils";
import { formatExact, splitAmount, TOKEN_DECIMALS } from "@/lib/units";

/**
 * An exact on-chain amount. The integer and the first `visible` decimals are shown; the remaining digits are dimmed,
 * never rounded away. The full decimal value is in the accessible name and the native tooltip.
 */
export function Amount({
  value,
  decimals = TOKEN_DECIMALS,
  visible = 4,
  symbol,
  showTail = true,
  className,
}: {
  value: bigint;
  decimals?: number;
  visible?: number;
  symbol?: string;
  showTail?: boolean;
  className?: string;
}) {
  const { integer, fraction, tail } = splitAmount(value, decimals, visible);
  const exact = formatExact(value, decimals);
  const label = symbol ? `${exact} ${symbol}` : exact;
  return (
    <span className={cn("tabular whitespace-nowrap", className)} title={label} aria-label={label}>
      <span aria-hidden="true">
        {integer}
        {fraction && <span>.{fraction}</span>}
        {showTail && tail && <span className="text-subtle/60">{tail}</span>}
        {symbol && <span className="ml-1 font-medium text-muted-foreground">{symbol}</span>}
      </span>
    </span>
  );
}
