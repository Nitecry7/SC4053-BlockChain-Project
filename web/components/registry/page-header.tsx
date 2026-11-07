import type { ReactNode } from "react";

export function PageHeader({ title, children, meta }: { title: string; children?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="glass relative mb-4 overflow-hidden rounded-[1.375rem] bg-[linear-gradient(103deg,rgb(24_28_56/0.75),rgb(32_40_80/0.55)_45%,rgb(14_22_38/0.72))] px-5 py-5 sm:px-6">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/3 h-56 w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(108_120_224/0.45),transparent)]" />
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.875rem] leading-tight font-bold tracking-[-0.045em]">{title}</h1>
          {children && <p className="mt-1 max-w-[62ch] text-[0.8125rem] leading-relaxed text-[#cbd1e7]">{children}</p>}
        </div>
        {meta && <div className="text-[0.75rem] text-muted-foreground">{meta}</div>}
      </div>
    </div>
  );
}

export function matches(query: string, ...fields: (string | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
