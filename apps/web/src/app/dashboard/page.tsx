import { privateMetadata } from "../../features/public-site/site";
import { WorkflowDashboard } from "@/features/dashboard/workflow-dashboard";

export const metadata = privateMetadata;

export default function DashboardPage() {
  return <WorkflowDashboard />;
}
