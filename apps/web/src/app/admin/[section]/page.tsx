import { notFound } from "next/navigation";
import { privateMetadata } from "../../../features/public-site/site";
import { AdminDashboard } from "../../../features/admin/admin-dashboard";
import { adminSections } from "../../../features/admin/admin-sections";

export const metadata = privateMetadata;
export default async function AdminSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ status?: string }> }) {
  const { section } = await params;
  const selected = adminSections.find((value) => value === section);
  if (!selected) notFound();
  const { status } = await searchParams;
  const initialStatus = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "SUCCEEDED", "FAILED", "CANCELLED"].includes(status ?? "") ? status : "";
  return <AdminDashboard key={`${selected}:${initialStatus}`} section={selected} initialStatus={initialStatus} />;
}
