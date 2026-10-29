import { privateMetadata } from "../../../features/public-site/site";
import { Suspense } from "react";
import { ConnectionsDashboard } from "@/features/credentials/connections-dashboard";

export const metadata = privateMetadata;

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<main className="dashboard-loading connections-loading" aria-busy="true">Preparing connections…</main>}>
      <ConnectionsDashboard />
    </Suspense>
  );
}
