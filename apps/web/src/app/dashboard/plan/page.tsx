import { Suspense } from "react";
import { privateMetadata } from "../../../features/public-site/site";
import { PlanUsagePage } from "../../../features/plan/plan-usage";
import { SessionLoading } from "../../../features/auth/session-loading";

export const metadata = privateMetadata;
export default function Page() {
  return <Suspense fallback={<SessionLoading />}><PlanUsagePage /></Suspense>;
}
