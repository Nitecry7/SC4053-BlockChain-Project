import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A liquid-glass panel with an optional heading row. */
export function Panel({
  title,
  action,
  children,
  className,
  id,
  as: Tag = "section",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "section" | "div" | "aside";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Tag id={id} aria-labelledby={title ? headingId : undefined} className={cn("glass overflow-hidden rounded-[1.125rem] p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 id={headingId} className="text-[0.9375rem] font-semibold tracking-[-0.02em]">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}
