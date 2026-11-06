import Link from "next/link";
import type { MarketStatus } from "@/lib/market-select";

/** Why the market in the URL is not the one shown. Says nothing while a check is still running or when the request is fine. */
export function MarketRequestNotice({ status, requested }: { status: MarketStatus; requested: string | null }) {
  if (!requested || status === "default" || status === "selected" || status === "checking") return null;
  const text =
    status === "invalid-format" ? (
      <>The market in the link is not a valid address, so it is not offered here.</>
    ) : status === "not-registered" ? (
      <>
        <span className="font-mono break-all">{requested}</span> is not a market listed through MarketFactory (checked on-chain), so it is not offered here.
      </>
    ) : (
      <>
        Could not check <span className="font-mono break-all">{requested}</span> on-chain, so it is not offered here.
      </>
    );
  return (
    <p role="status" className="mb-4 rounded-2xl border border-warn/35 bg-warn/[0.08] px-4 py-3 text-[0.8125rem]">
      {text} Showing a listed market instead.{" "}
      <Link href="/markets" className="text-lilac hover:text-white">
        All markets
      </Link>
    </p>
  );
}
