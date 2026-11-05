import type { Metadata } from "next";
import { TxView } from "@/components/trade/tx-view";

export const metadata: Metadata = { title: "Transaction" };

export default function TxPage() {
  return <TxView />;
}
