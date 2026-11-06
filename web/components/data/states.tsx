import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** An honest empty or unavailable state: says what is true and what to do. */
export function EmptyState({ title, children, icon, className }: { title: string; children?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-6 text-center", className)}>
      {icon && <div className="grid size-10 place-items-center rounded-xl glass-inset text-lilac">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children && <div className="max-w-[34ch] text-xs leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  );
}

/** A "not available yet" label for features scheduled in a later phase. Never styled to look functional. */
export function ComingSoon({ children = "Coming soon", className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex flex-none items-center whitespace-nowrap rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground", className)}>
      {children}
    </span>
  );
}
