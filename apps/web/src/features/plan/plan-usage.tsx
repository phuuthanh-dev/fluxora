"use client";

import { ArrowRight, CircleGauge } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { planCatalog, PlanCode } from "@workflow/contracts";
import { AppShellHeader, type AppShellWorkspace } from "../app-shell/app-shell-header";
import { apiRequest, isUnauthenticated } from "../api/api-client";
import { loginHref } from "../auth/auth-redirect";
import { SessionLoading } from "../auth/session-loading";
import { PageHeader, Progress, Status } from "../../components/ui";
import { PlanCards } from "./plan-cards";
import { PaymentReturn } from "./payment-return";
import { PendingPayment } from "./pending-payment";
import "./plan-usage.css";

type Usage = { plan: PlanCode; paidUntil?: string | null; trialExpiresAt: string | null; periodStart: string; periodEnd: string; retainedRuns: number; trackedRuns?: number; meteringSince?: string; meterComplete?: boolean; activeWorkflows: number; catalog: typeof planCatalog };

function isUsage(value: unknown): value is Usage {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Usage>;
  return (data.plan === "FREE" || data.plan === "STARTER" || data.plan === "PRO") &&
    typeof data.retainedRuns === "number" && typeof data.activeWorkflows === "number" &&
    typeof data.periodStart === "string" && typeof data.periodEnd === "string" &&
    Boolean(data.catalog?.FREE && data.catalog?.STARTER && data.catalog?.PRO);
}

function usePlanUsage(workspaceId: string, revision = 0) {
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
  }, [workspaceId, revision]);
  return { data, error };
}

export function PlanUsageSummary({ workspaceId }: { workspaceId: string }) {
  const { data, error } = usePlanUsage(workspaceId);
  if (error) return null;
  return <section className="plan-summary" aria-label="Plan and usage">
    <div className="plan-summary__icon"><CircleGauge size={19} aria-hidden="true" /></div>
    <div><strong>{data ? `${data.catalog[data.plan].name} plan` : "Loading plan…"}</strong><p>{data ? `${data.meterComplete && typeof data.trackedRuns === "number" ? data.trackedRuns.toLocaleString() : `At least ${data.retainedRuns.toLocaleString()} retained`} live runs in current allowance` : "Checking usage"}</p></div>
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
  const [methods, setMethods] = useState({ bank: false, card: false });
  const [paymentState, setPaymentState] = useState<"loading" | "none" | "pending" | "unknown">("loading");
  const [usageRevision, setUsageRevision] = useState(0);
  const onPaymentConfirmed = useCallback(() => setUsageRevision((value) => value + 1), []);
  const { data, error } = usePlanUsage(workspaceId, usageRevision);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    setCheckoutAvailable(false);
    setMethods({ bank: false, card: false });
    setPaymentState("loading");
    void apiRequest<{ available: boolean; methods?: { bank: boolean; card: boolean } }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/availability`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setCheckoutAvailable(result.available === true); setMethods(result.methods ?? { bank: result.available === true, card: false }); } })
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
      <PageHeader eyebrow={workspace?.name ?? "WORKSPACE"} title="Plan & usage" description="Understand your workspace activity and explore available plans." />
      {loadError || error ? <Status tone="error">Could not load plan details. Please refresh and try again.</Status> : null}
      {!workspaceId && !loadError ? <Status tone="info">Create a workspace to view its plan and activity.</Status> : null}
      {workspaceId && !data && !error ? <Progress label="Loading plan and usage" /> : null}
      {workspaceId && searchParams.get("workspace") === workspaceId && searchParams.get("order") && <PaymentReturn workspaceId={workspaceId} orderId={searchParams.get("order")!} onConfirmed={onPaymentConfirmed} />}
      {workspaceId && checkoutAvailable && <PendingPayment key={workspaceId} workspaceId={workspaceId} onStateChange={setPaymentState} onConfirmed={onPaymentConfirmed} revision={usageRevision} />}
      {data ? <>
        <div className="plan-notice plan-billing-info"><strong>{checkoutAvailable ? "30-day access · Manual renewal" : "Early access · no charges"}</strong><p>{checkoutAvailable ? "Your plan renews only when you choose to pay again. Refund requests are reviewed by Support." : "Plans, prices and benefits are proposed. No payment or plan limits are active."}</p></div>
        <section className="plan-current" aria-labelledby="current-plan-heading">
          <div className="plan-current__top"><div><p className="plan-eyebrow">CURRENT PLAN</p><h2 id="current-plan-heading">{data.catalog[data.plan].name}{data.trialExpiresAt ? " trial" : ""}</h2><p>{data.paidUntil ? `Paid access ends ${new Date(data.paidUntil).toLocaleDateString([], { dateStyle: "medium" })}.` : data.trialExpiresAt ? `Trial ends ${new Date(data.trialExpiresAt).toLocaleDateString([], { dateStyle: "medium" })}.` : checkoutAvailable ? "Free plan for this workspace." : "Available for your workspace during early access."}</p></div><span className="plan-current__badge">{data.paidUntil ? "Paid" : data.plan === "FREE" ? checkoutAvailable ? "Free" : "Early access" : "Trial"}</span></div>
          <div className="plan-usage-grid"><div><span>{checkoutAvailable && data.meterComplete ? "Live runs in current allowance" : "Retained live runs in current allowance"}</span><strong>{checkoutAvailable && data.meterComplete && typeof data.trackedRuns === "number" ? data.trackedRuns.toLocaleString() : `At least ${data.retainedRuns.toLocaleString()}`}</strong><small>Counted since {new Date(data.periodStart).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC · next reset {new Date(data.periodEnd).toLocaleDateString([], { dateStyle: "medium", timeZone: "UTC" })} UTC</small></div><div><span>Active workflows</span><strong>{data.activeWorkflows.toLocaleString()}</strong><small>Currently active in this workspace</small></div></div>
          <Progress className="plan-usage-progress" label={`Runs compared with ${checkoutAvailable ? "" : "proposed "}${data.catalog[data.plan].monthlyRuns.toLocaleString()} monthly runs`} value={(checkoutAvailable && data.meterComplete ? data.trackedRuns ?? 0 : data.retainedRuns) / data.catalog[data.plan].monthlyRuns * 100} />
          <p className="plan-disclaimer">{checkoutAvailable && data.meterComplete ? "Live manual and node-debug runs are included; mock runs are excluded." : "Usage is based on retained execution history, which may be cleaned up before month end. It is a minimum, not a complete usage meter. Live manual and node-debug runs are included; mock runs are excluded."}</p>
          {typeof data.trackedRuns === "number" && data.meteringSince && !data.meterComplete && <p className="plan-meter-note">Usage tracking began on {new Date(data.meteringSince).toLocaleDateString([], { dateStyle: "medium", timeZone: "UTC" })} UTC. Earlier runs may be missing; the monthly limit starts when a complete month can be measured.</p>}
        </section>
        <div className="plan-section-heading"><div><p className="plan-eyebrow">EXPLORE PLANS</p><h2>Room to grow, on your terms.</h2><p>{checkoutAvailable ? data.paidUntil ? "Renew your current plan for 30 more days, or review the terms before upgrading." : "Prices in VND for 30 days of access. Renew manually when you need to." : "Proposed pricing in VND. Availability and limits may change after testing."}</p></div></div>
        <PlanCards methods={methods} current={data.plan} workspaceId={workspaceId} checkoutAvailable={checkoutAvailable} paymentBlocked={checkoutAvailable && paymentState !== "none"} paidUntil={data.paidUntil} />
        <p className="plan-disclaimer">{checkoutAvailable ? "New live runs pause when the monthly limit is reached until the next reset or an eligible upgrade. Existing runs continue; provider and AI charges are separate." : "The proposed limits are not enforced. AI providers may charge you separately."} All plans use the current system retention policy.</p>
      </> : null}
    </section>
  </main>;
}
