import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/dashboard";

export default function OverviewPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
