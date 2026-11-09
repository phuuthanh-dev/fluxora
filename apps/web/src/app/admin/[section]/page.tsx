import { notFound } from "next/navigation";
import { privateMetadata } from "../../../features/public-site/site";
import { AdminDashboard } from "../../../features/admin/admin-dashboard";
import { adminSections } from "../../../features/admin/admin-sections";

export const metadata = privateMetadata;
export default async function AdminSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { section } = await params;
  const selected = adminSections.find((value) => value === section);
  if (!selected) notFound();
  const query = await searchParams;
  const status = typeof query.status === "string" ? query.status : "";
  const scope: Record<string, string> = {};
  for (const key of ["userId", "workspaceId", "workflowId", "executionId", "actorId", "targetType", "targetId"]) if (typeof query[key] === "string") scope[key] = query[key];
  const initialStatus = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "SUCCEEDED", "FAILED", "CANCELLED"].includes(status ?? "") ? status : "";
  return <AdminDashboard key={`${selected}:${initialStatus}:${JSON.stringify(scope)}`} section={selected} initialStatus={initialStatus} scope={scope} />;
}
