import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A labelled text field in the approved glass style, with its error or hint wired to the input for assistive technology. */
export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  disabled,
  inputMode,
  suffix,
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
  inputMode?: "text" | "decimal";
  suffix?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className={cn("glass-inset rounded-[0.875rem] px-3.5 py-3", error && "border-sell/50")}>
      <label htmlFor={id} className="text-[0.6875rem] text-[#c3cce0]">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[1.0625rem] font-semibold text-foreground outline-none placeholder:text-[#98a2c0] disabled:cursor-not-allowed disabled:text-[#b2b9d0]",
            mono && "font-mono text-[0.9375rem]",
          )}
        />
        {suffix}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[0.6875rem] text-sell">
          {error}
        </p>
      ) : (
        hint && (
          <div id={`${id}-hint`} className="mt-1 text-[0.6875rem] text-subtle">
            {hint}
          </div>
        )
      )}
    </div>
  );
}
