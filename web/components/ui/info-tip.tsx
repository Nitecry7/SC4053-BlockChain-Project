"use client";

import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";
import { useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * A small information icon that explains one trading concept in a glass popover (copy: `lib/glossary.ts`).
 *
 * - Mouse: opens on hover after a short delay and closes when the pointer leaves.
 * - Keyboard: opens when the button receives keyboard focus; Enter or Space toggles it; Escape closes it; moving focus away closes it.
 * - Touch: a tap toggles it; a tap outside closes it.
 * It renders in a portal with collision handling, so no card or glass container can clip it. The heading it sits next to stays
 * clean for screen readers: the button's name is "About <term>" and the popup is labelled with the term and described by its text.
 * Motion is a plain opacity fade, and the global reduced-motion rule removes it.
 */
export function InfoTip({ term, className, side = "top" }: { term: GlossaryKey; className?: string; side?: "top" | "bottom" | "left" | "right" }) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={(next) => setOpen(next)}>
      <Popover.Trigger
        type="button"
        data-info={term}
        aria-label={`About ${entry.term}`}
        openOnHover
        delay={180}
        closeDelay={80}
        onFocus={(e) => {
          // Keyboard focus opens it; a mouse click focuses the button too, but that is handled by the click toggle.
          if (e.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-subtle transition-colors hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-lilac focus-visible:outline-none",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} sideOffset={6} collisionPadding={10} className="isolate z-[60]">
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            data-testid="info-tip-popup"
            className="glass max-w-[min(18rem,calc(100vw-1.5rem))] rounded-xl px-3 py-2.5 text-[0.75rem] leading-snug text-[#dde3f4] shadow-xl transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          >
            <Popover.Title className="mb-0.5 text-[0.75rem] font-semibold text-white">{entry.term}</Popover.Title>
            <Popover.Description>{entry.text}</Popover.Description>
            {entry.guide && <p className="mt-1.5 text-[0.6875rem] text-subtle">More: {entry.guide}</p>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
