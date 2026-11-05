import type { Metadata } from "next";
import { Suspense } from "react";
import { TokensView } from "@/components/registry/tokens-view";

export const metadata: Metadata = { title: "Tokens" };

export default function TokensPage() {
  return (
    <Suspense>
      <TokensView />
    </Suspense>
  );
}
