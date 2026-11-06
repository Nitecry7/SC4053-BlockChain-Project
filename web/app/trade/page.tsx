import type { Metadata } from "next";
import { Suspense } from "react";
import { TradeView } from "@/components/trade/trade-view";

export const metadata: Metadata = { title: "Trade" };

export default function TradePage() {
  return (
    <Suspense>
      <TradeView />
    </Suspense>
  );
}
