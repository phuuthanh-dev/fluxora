import { Suspense } from "react";
import { ConnectionsDashboard } from "@/features/credentials/connections-dashboard";

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<main className="dashboard-loading connections-loading" aria-busy="true">Preparing connections…</main>}>
      <ConnectionsDashboard />
    </Suspense>
  );
}
