import { privateMetadata } from "../../features/public-site/site";
import { AdminDashboard } from "../../features/admin/admin-dashboard";

export const metadata = privateMetadata;
export default function AdminPage() { return <AdminDashboard />; }
