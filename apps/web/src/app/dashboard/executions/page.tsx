import { privateMetadata } from "../../../features/public-site/site";
import { Suspense } from "react";
import { ExecutionsDashboard } from "@/features/dashboard/executions-dashboard";

export const metadata = privateMetadata;

export default function ExecutionsPage() {
  return (
    <Suspense fallback={<main className="dashboard-loading executions-loading" aria-busy="true">Preparing execution history…</main>}>
      <ExecutionsDashboard />
    </Suspense>
  );
}
