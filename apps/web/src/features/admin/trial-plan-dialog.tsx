"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, DialogHeader, Progress, Select, Status } from "../../components/ui";
import { apiRequest } from "../api/api-client";

type Workspace = { id: string; name: string; effectivePlan: string; trialExpiresAt: string | null };
type Usage = { retainedRuns: number; activeWorkflows: number };

export function TrialPlanDialog({ workspace, onClose, onSaved }: { workspace: Workspace; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState(workspace.effectivePlan);
  const [days, setDays] = useState("14");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<Usage>(`/admin/workspaces/${encodeURIComponent(workspace.id)}/plan-usage`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setUsage(result); })
      .catch(() => { if (!controller.signal.aborted) setError("Could not load workspace usage."); });
    return () => controller.abort();
  }, [workspace.id]);
  async function save() {
    setSaving(true); setError("");
    try {
      await apiRequest(`/admin/workspaces/${encodeURIComponent(workspace.id)}/trial-plan`, { method: "POST", body: JSON.stringify({ plan, ...(plan === "FREE" ? {} : { days: Number(days) }) }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the trial."); }
    finally { setSaving(false); }
  }
  return <div className="admin-dialog-backdrop"><Dialog label="Manage trial plan" className="admin-dialog admin-plan-dialog" onClose={() => { if (!saving) onClose(); }}>
    <DialogHeader title="Manage trial plan" eyebrow="WORKSPACE" onClose={() => { if (!saving) onClose(); }} />
    <p><strong>{workspace.name}</strong></p>
    <p>Plans are informational. This does not charge the user or restrict workflows. Trial changes are recorded in the audit log.</p>
    {usage ? <p>Retained live runs this month: <strong>at least {usage.retainedRuns.toLocaleString()}</strong> · Active workflows: <strong>{usage.activeWorkflows}</strong>. Retention may remove older runs.</p> : !error ? <Progress label="Loading usage" /> : null}
    <label className="admin-plan-field">Plan<Select aria-label="Trial plan" value={plan} onChange={(event) => setPlan(event.target.value)}><option value="FREE">Free</option><option value="STARTER">Starter trial</option><option value="PRO">Pro trial</option></Select></label>
    {plan !== "FREE" && <label className="admin-plan-field">Trial duration<Select aria-label="Trial duration" value={days} onChange={(event) => setDays(event.target.value)}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></Select><small>Starts now; saving restarts the selected trial duration.</small></label>}
    {error && <Status tone="error">{error}</Status>}
    <div className="admin-dialog__actions"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save trial"}</Button></div>
  </Dialog></div>;
}
