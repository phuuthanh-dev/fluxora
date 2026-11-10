"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Dialog, DialogHeader, EmptyState, Field, Progress, Status } from "../../components/ui";
import { apiRequest } from "../api/api-client";

type RecordSummary = { id: string; state: string; requiredAction: string | null; oldestDataAt: string; nextReportAt: string; lastReportedAt: string | null; lastAttemptAt: string | null; cycleDays: number; coverageReviewedAt: string | null; connectionCount: number; workspaceCount: number; lastErrorCode: string | null };
type RecordPage = { enabled: boolean; records: RecordSummary[]; nextCursor: string | null };
type Preview = { id: string; action: string; expiresAt: number; previewToken: string; legacyReviewRequired: boolean; blockers: string[]; counts: { connections: number; workflows: number; executions: number; nodes: number; items: number }; workflows: { id: string; name: string; isActive: boolean }[]; review: string[] };
const endpoint = "/admin/jira-privacy-reporting";
const date = (value: string | null) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not yet reported";

export function JiraPrivacyPanel() {
  const [page, setPage] = useState<RecordPage | null>(null);
  const [cursor, setCursor] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<RecordSummary | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [legacyReviewed, setLegacyReviewed] = useState(false);
  const [reference, setReference] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [nextDate, setNextDate] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void apiRequest<RecordPage>(`${endpoint}/records${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`).then((value) => { if (active) setPage(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load reporting records."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, refresh]);

  async function discover() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ linked: number; invalid: number }>(`${endpoint}/discover`, { method: "POST", body: "{}" });
      setNotice(`${result.linked} current connections linked. ${result.invalid} need investigation. Deleted legacy connections still need a separate inventory.`);
      setRefresh((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not inventory connections."); }
    finally { setBusy(false); }
  }

  async function review(record: RecordSummary) {
    setBusy(true); setError(""); setNotice(""); setPreview(null);
    setReviewed(false); setLegacyReviewed(false); setReference(""); setConfirmation(""); setNextDate("");
    try {
      if (record.state === "ACTION_REQUIRED") setPreview(await apiRequest<Preview>(`${endpoint}/${record.id}/preview`));
      setSelected(record);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not prepare the review."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      if (selected.state === "UNCERTAIN") {
        await apiRequest(`${endpoint}/${selected.id}/recover`, { method: "POST", body: JSON.stringify({ providerReviewed: reviewed, reviewReference: reference, nextReportAt: new Date(nextDate).toISOString() }) });
        setNotice("Reviewed report rescheduled. No provider request was sent by this action.");
      } else if (preview) {
        const result = await apiRequest<{ erasedExecutions: number; removedConnections: number }>(`${endpoint}/${selected.id}/resolve`, { method: "POST", body: JSON.stringify({ previewToken: preview.previewToken, copiesReviewed: reviewed, legacyReviewed, reviewReference: reference, confirmation }) });
        setNotice(`Resolved: ${result.erasedExecutions} execution payloads erased, ${result.removedConnections} Jira connections removed. Status and timing retained.`);
      }
      setSelected(null); setPreview(null); setRefresh((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The request could not be completed. Review a fresh preview."); }
    finally { setBusy(false); }
  }

  const validReference = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(reference);
  const canConfirm = !busy && validReference && reviewed && (selected?.state === "UNCERTAIN" ? Boolean(nextDate) : preview && !preview.blockers.length && (!preview.legacyReviewRequired || legacyReviewed) && confirmation === "ERASE");
  return <div className="admin-privacy">
    <section className="admin-card">
      <div className="admin-card__heading"><h2><ShieldCheck size={19} aria-hidden="true" /> Jira data requests</h2><span className="admin-badge">Reporting {page?.enabled ? "configured on" : "off"}</span></div>
      <p>Only requests needing review are listed. Account IDs, credentials and execution payloads stay hidden.</p>
      <Button variant="ghost" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />Refresh requests</Button>
      <details className="admin-privacy__inventory"><summary>Connection inventory</summary><p>For existing connections that predate tracking. Inventory only adds metadata links; it does not erase data, enable reporting, or identify people in free text. Deleted legacy connections still need operator investigation.</p><Button variant="secondary" disabled={busy || loading} onClick={() => void discover()}><Database size={15} aria-hidden="true" />Inventory current connections</Button></details>
    </section>
    {notice && <Status tone="success">{notice}</Status>}
    {error && <Status tone="error">{error}</Status>}
    {loading && <Progress label="Loading Jira data requests" />}
    {!loading && !error && page?.records.length === 0 && <EmptyState title={cursor ? "No requests on this page" : "No pending Jira requests"} description="Requests appear here when Atlassian requires action or a reporting attempt needs investigation. No action is needed here right now." />}
    <ul className="admin-privacy__records" aria-label="Jira data requests">{!loading && page?.records.map((record) => <li key={record.id} className="admin-card">
      <div className="admin-card__heading"><h3>Record <code>{record.id.slice(0, 8)}</code></h3><span className="admin-badge">{record.requiredAction ?? record.state.replaceAll("_", " ").toLowerCase()}</span></div>
      <dl className="admin-privacy__metadata"><div><dt>Connections tracked</dt><dd>{record.connectionCount}</dd></div><div><dt>Workspaces tracked</dt><dd>{record.workspaceCount}</dd></div><div><dt>Last reported</dt><dd>{date(record.lastReportedAt)}</dd></div><div><dt>Next report</dt><dd>{date(record.nextReportAt)}</dd></div></dl>
      {!record.coverageReviewedAt && <p className="admin-caption">Legacy attribution needs review, including connections deleted before tracking was added.</p>}
      {record.lastErrorCode && <p className="admin-caption">Last result: <code>{record.lastErrorCode}</code></p>}
      {["ACTION_REQUIRED", "UNCERTAIN"].includes(record.state) && <Button variant="secondary" disabled={busy} onClick={() => void review(record)}>{busy ? "Preparing…" : record.state === "UNCERTAIN" ? "Review uncertain attempt" : "Review affected data"}</Button>}
    </li>)}</ul>
    {(cursor || page?.nextCursor) && <div className="admin-privacy__actions">{page?.nextCursor && <Button variant="secondary" disabled={loading} onClick={() => setCursor(page.nextCursor!)}>Next requests</Button>}{cursor && <Button variant="ghost" onClick={() => setCursor("")}>First page</Button>}</div>}
    {selected && <div className="admin-dialog-backdrop"><Dialog label={selected.state === "UNCERTAIN" ? "Review uncertain Jira report" : "Review Jira data erasure"} className="admin-dialog admin-privacy-dialog" onClose={() => { if (!busy) { setSelected(null); setPreview(null); } }}>
      <DialogHeader eyebrow="JIRA PRIVACY / OPERATOR REVIEW" title={selected.state === "UNCERTAIN" ? "Schedule a reviewed report" : "Review before erasing"} onClose={() => { if (!busy) { setSelected(null); setPreview(null); } }} />
      {error && <Status tone="error">{error}</Status>}
      {selected.state === "UNCERTAIN" ? <><p>The previous request may have reached Atlassian. Investigate the provider result and its reporting cycle before choosing the next eligible time. This action does not send a report now.</p><p className="admin-caption">Last attempt: {date(selected.lastAttemptAt)}. Last known reporting cycle: {selected.cycleDays} days; the provider may require longer after a lost response.</p><Field label="Confirmed next eligible report time"><input type="datetime-local" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></Field></> : preview && <>
        <p>For <strong>{preview.action}</strong>, erase the stored copy. All affected execution, node and item payloads are cleared; statuses and timing stay. Matching Jira connections are removed. Immutable workflow graphs stay unchanged.</p>
        <dl className="admin-privacy__metadata">{Object.entries(preview.counts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
        {preview.blockers.length > 0 && <Status tone="warning"><strong>Resolve these blockers first</strong><ul>{preview.blockers.map((message) => <li key={message}>{message}</li>)}</ul></Status>}
        {preview.workflows.length > 0 && <details><summary>Affected workflows ({preview.workflows.length})</summary><ul>{preview.workflows.map((workflow) => <li key={workflow.id}>{workflow.name} · {workflow.isActive ? "Active — deactivate first" : "Inactive"}</li>)}</ul></details>}
        <ul>{preview.review.map((message) => <li key={message}>{message}</li>)}</ul>
        {preview.legacyReviewRequired && <label className="admin-privacy__check"><input type="checkbox" checked={legacyReviewed} onChange={(event) => setLegacyReviewed(event.target.checked)} /><span>I completed the legacy inventory, including deleted connections and any untracked copies.</span></label>}
        <Field label="Type ERASE to confirm"><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></Field>
      </>}
      <Field label="Review reference" hint="Use a ticket/reference ID, not a name, email, account ID or secret."><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} autoComplete="off" /></Field>
      <label className="admin-privacy__check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>{selected.state === "UNCERTAIN" ? "I verified the provider outcome and next eligible reporting time." : "I reviewed configuration, logs, backups, exports and external destinations, and handled copies outside this preview."}</span></label>
      <div className="admin-privacy__actions"><Button variant="ghost" disabled={busy} onClick={() => { setSelected(null); setPreview(null); }}>Cancel</Button><Button variant={selected.state === "UNCERTAIN" ? "primary" : "danger"} disabled={!canConfirm} onClick={() => void confirm()}>{busy ? "Working…" : selected.state === "UNCERTAIN" ? "Schedule reviewed report" : "Erase reviewed data"}</Button></div>
    </Dialog></div>}
  </div>;
}
