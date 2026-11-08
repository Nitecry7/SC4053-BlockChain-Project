import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketForm } from "@/components/create/market-form";

export const metadata: Metadata = { title: "List Market" };

export default function ListMarketPage() {
  return (
    <Suspense>
      <MarketForm />
    </Suspense>
  );
}
