import type { Metadata } from "next";
import { TokenForm } from "@/components/create/token-form";

export const metadata: Metadata = { title: "Create token" };

export default function CreateTokenPage() {
  return <TokenForm />;
}
