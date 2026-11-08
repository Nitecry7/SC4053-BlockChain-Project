import type { ReactNode } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { useRpcHealth } from "@/hooks/use-rpc-health";
import type { GlossaryKey } from "@/lib/glossary";
import { dataReadsAllowed } from "@/lib/rpc-health";
import { cn } from "@/lib/utils";

/** A liquid-glass panel with an optional heading row. */
export function Panel({
  title,
  action,
  children,
  className,
  id,
  as: Tag = "section",
  info,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "section" | "div" | "aside";
  /** A glossary term: an information icon is shown beside the heading (not inside it, so the heading's name stays clean). */
  info?: GlossaryKey;
}) {
  const headingId = id ? `${id}-title` : undefined;
  const health = useRpcHealth();
  const stale = health.everRead && !dataReadsAllowed(health.state);
  return (
    <Tag id={id} aria-labelledby={title ? headingId : undefined} className={cn("glass overflow-hidden rounded-[1.125rem] p-4 sm:p-5", className)}>
      {stale && (
        <p data-testid="last-known" className="mb-2 inline-block rounded-full border border-warn/40 bg-warn/10 px-2.5 py-0.5 text-[0.6875rem] font-medium text-warn">
          Last known, not current
        </p>
      )}
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <div className="flex min-w-0 items-center gap-0.5">
              <h2 id={headingId} className="text-[0.9375rem] font-semibold tracking-[-0.02em]">
                {title}
              </h2>
              {info && <InfoTip term={info} />}
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}
