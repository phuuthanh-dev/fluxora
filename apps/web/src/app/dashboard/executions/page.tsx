import { Suspense } from "react";
import { ExecutionsDashboard } from "@/features/dashboard/executions-dashboard";

export default function ExecutionsPage() {
  return (
    <Suspense fallback={<main className="dashboard-loading executions-loading" aria-busy="true">Preparing execution history…</main>}>
      <ExecutionsDashboard />
    </Suspense>
  );
}
