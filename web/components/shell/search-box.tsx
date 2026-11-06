"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Searches the on-chain market and token registries (it opens the Markets page filtered). */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(query.trim() ? `/markets?q=${encodeURIComponent(query.trim())}` : "/markets");
      }}
      className={cn(
        "flex h-10 items-center gap-2.5 rounded-full border border-white/16 bg-[#0f1528]/80 px-3.5 text-muted-foreground transition-colors focus-within:border-lilac/50",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <label htmlFor="global-search" className="sr-only">
        Search tokens, pairs or addresses
      </label>
      <input
        id="global-search"
        ref={input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tokens, pairs, or addresses…"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
      />
      <kbd className="hidden rounded-md bg-white/7 px-1.5 py-0.5 font-sans text-[0.6875rem] text-muted-foreground lg:inline">⌘ K</kbd>
    </form>
  );
}
