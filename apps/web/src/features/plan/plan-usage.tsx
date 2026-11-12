"use client";

import { ArrowRight, CircleGauge } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { planCatalog, PlanCode } from "@workflow/contracts";
import { AppShellHeader, type AppShellWorkspace } from "../app-shell/app-shell-header";
import { apiRequest, isUnauthenticated } from "../api/api-client";
import { loginHref } from "../auth/auth-redirect";
import { SessionLoading } from "../auth/session-loading";
import { PageHeader, Progress, Status } from "../../components/ui";
import { PlanCards } from "./plan-cards";
import "./plan-usage.css";

type Usage = { plan: PlanCode; paidUntil?: string | null; trialExpiresAt: string | null; periodStart: string; periodEnd: string; retainedRuns: number; trackedRuns?: number; meteringSince?: string; activeWorkflows: number; catalog: typeof planCatalog };

function isUsage(value: unknown): value is Usage {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Usage>;
  return (data.plan === "FREE" || data.plan === "STARTER" || data.plan === "PRO") &&
    typeof data.retainedRuns === "number" && typeof data.activeWorkflows === "number" &&
    typeof data.periodStart === "string" && typeof data.periodEnd === "string" &&
    Boolean(data.catalog?.FREE && data.catalog?.STARTER && data.catalog?.PRO);
}

function usePlanUsage(workspaceId: string) {
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    setData(null); setError(false);
    void apiRequest<unknown>(`/workspaces/${encodeURIComponent(workspaceId)}/plan-usage`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { if (isUsage(result)) setData(result); else setError(true); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [workspaceId]);
  return { data, error };
}

export function PlanUsageSummary({ workspaceId }: { workspaceId: string }) {
  const { data, error } = usePlanUsage(workspaceId);
  if (error) return null;
  return <section className="plan-summary" aria-label="Plan and usage">
    <div className="plan-summary__icon"><CircleGauge size={19} aria-hidden="true" /></div>
    <div><strong>{data ? `${data.catalog[data.plan].name} plan` : "Loading plan…"}</strong><p>{data ? `At least ${data.retainedRuns.toLocaleString()} retained live runs this month` : "Checking retained usage"}</p></div>
    <Link href={`/dashboard/plan?workspace=${encodeURIComponent(workspaceId)}`}>View plan <ArrowRight size={15} aria-hidden="true" /></Link>
  </section>;
}

export function PlanUsagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<AppShellWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const { data, error } = usePlanUsage(workspaceId);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    setCheckoutAvailable(false);
    void apiRequest<{ available: boolean }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/availability`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setCheckoutAvailable(result.available === true); })
      .catch(() => { /* Checkout stays unavailable when status cannot be verified. */ });
    return () => controller.abort();
  }, [workspaceId]);
  useEffect(() => {
    let active = true;
    void apiRequest<{ workspaces: AppShellWorkspace[] }>("/workspaces").then((result) => {
      if (!active) return;
      setWorkspaces(result.workspaces);
      setWorkspaceId(result.workspaces.find((item) => item.id === searchParams.get("workspace"))?.id ?? result.workspaces[0]?.id ?? "");
    }).catch((reason: unknown) => {
      if (!active) return;
      if (isUnauthenticated(reason)) router.replace(loginHref(window.location));
      else setLoadError(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, searchParams]);
  const workspace = useMemo(() => workspaces.find((item) => item.id === workspaceId), [workspaces, workspaceId]);
  if (loading) return <SessionLoading />;
  return <main className="dashboard-page plan-page">
    <AppShellHeader workspaces={workspaces} workspaceId={workspaceId} onWorkspaceChange={(id) => { setWorkspaceId(id); router.replace(`/dashboard/plan?workspace=${encodeURIComponent(id)}`); }} active="plan" />
    <section className="plan-main">
      <PageHeader eyebrow={workspace?.name ?? "WORKSPACE"} title="Plan & usage" description="Understand your workspace activity and explore proposed plans." />
      {loadError || error ? <Status tone="error">Could not load plan details. Please refresh and try again.</Status> : null}
      {!workspaceId && !loadError ? <Status tone="info">Create a workspace to view its plan and activity.</Status> : null}
      {workspaceId && !data && !error ? <Progress label="Loading plan and usage" /> : null}
      {searchParams.get("payment") === "return" && <Status tone="info">Payment is confirmed only after payOS notifies Fluxora. Refresh this page to check your plan; contact support if it does not update.</Status>}
      {searchParams.get("payment") === "cancel" && <Status tone="info">You returned from checkout. No payment is confirmed by this page.</Status>}
      {data ? <>
        <div className="plan-notice"><strong>{checkoutAvailable ? "Pay for 30 days · manual renewal" : "Early access · no charges"}</strong><p>{checkoutAvailable ? "Payments use payOS. No automatic renewal; plan limits are not yet enforced." : "Plans, prices and benefits are proposed. No payment or plan limits are active."}</p></div>
        <section className="plan-current" aria-labelledby="current-plan-heading">
          <div className="plan-current__top"><div><p className="plan-eyebrow">CURRENT PLAN</p><h2 id="current-plan-heading">{data.catalog[data.plan].name}{data.trialExpiresAt ? " trial" : ""}</h2><p>{data.paidUntil ? `Paid access ends ${new Date(data.paidUntil).toLocaleDateString([], { dateStyle: "medium" })}.` : data.trialExpiresAt ? `Trial ends ${new Date(data.trialExpiresAt).toLocaleDateString([], { dateStyle: "medium" })}.` : "Available for your workspace during early access."}</p></div><span className="plan-current__badge">{data.paidUntil ? "Paid" : data.plan === "FREE" ? "Early access" : "Trial"}</span></div>
          <div className="plan-usage-grid"><div><span>Retained live runs this month</span><strong>At least {data.retainedRuns.toLocaleString()}</strong><small>Started {new Date(data.periodStart).toLocaleDateString([], { dateStyle: "medium", timeZone: "UTC" })} · resets {new Date(data.periodEnd).toLocaleDateString([], { dateStyle: "medium", timeZone: "UTC" })} UTC</small></div><div><span>Active workflows</span><strong>{data.activeWorkflows.toLocaleString()}</strong><small>Currently active in this workspace</small></div></div>
          <Progress className="plan-usage-progress" label={`Retained runs compared with proposed ${data.catalog[data.plan].monthlyRuns.toLocaleString()} monthly runs`} value={data.retainedRuns / data.catalog[data.plan].monthlyRuns * 100} />
          <p className="plan-disclaimer">Usage is based on retained execution history, which may be cleaned up before month end. It is a minimum, not a complete usage meter. Live manual and node-debug runs are included; mock runs are excluded.</p>
          {typeof data.trackedRuns === "number" && data.meteringSince && <p className="plan-meter-note">New usage tracking: {data.trackedRuns.toLocaleString()} live runs recorded this month since tracking began on {new Date(data.meteringSince).toLocaleDateString([], { dateStyle: "medium", timeZone: "UTC" })} UTC. Earlier runs may be missing; this count is not used for billing.</p>}
        </section>
        <div className="plan-section-heading"><div><p className="plan-eyebrow">EXPLORE PLANS</p><h2>Room to grow, on your terms.</h2><p>Proposed monthly pricing in VND. Availability and limits may change after testing.</p></div></div>
        <PlanCards current={data.plan} workspaceId={workspaceId} checkoutAvailable={checkoutAvailable} />
        <p className="plan-disclaimer">The proposed limits are not enforced. AI providers may charge you separately. All plans use the current system retention policy.</p>
      </> : null}
    </section>
  </main>;
}
