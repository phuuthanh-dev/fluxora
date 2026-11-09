"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleHelp, LogOut, MoreVertical, RefreshCw, Search, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import { Button, Dialog, DialogHeader, EmptyState, Menu, PageHeader, Progress, Select, Status } from "../../components/ui";
import { apiRequest } from "../api/api-client";
import { AdminShell } from "./admin-shell";
import { adminLabel, type AdminSection } from "./admin-sections";
import "./admin.css";

type Overview = { users: number; workspaces: number; workflows: number; activeWorkflows: number; failedRuns: number; health: { status: string; checks: { database: string; scheduler: string; queue: { status: string } } } };
type User = { id: string; email: string; displayName: string | null; createdAt: string; disabledAt: string | null; _count: { ownedWorkspaces: number } };
type Workspace = { id: string; name: string; updatedAt: string; owner: { id: string; email: string }; _count: { workflows: number } };
type Workflow = { id: string; name: string; isActive: boolean; archivedAt: string | null; updatedAt: string; workspace: { id: string; name: string } };
type Execution = { id: string; status: string; mode: string; createdAt: string; startedAt: string | null; completedAt: string | null; errorCode: string | null; workflowVersion: { version: number; workflow: { id: string; name: string; workspace: { id: string; name: string } } } };
type Audit = { id: string; action: string; targetType: string; targetId: string | null; workspaceId: string | null; createdAt: string; actor: { id: string; email: string } | null };
type Records = { users?: User[]; workspaces?: Workspace[]; workflows?: Workflow[]; executions?: Execution[]; events?: Audit[]; hasMore?: boolean };
function RecordDate({ value }: { value: string }) {
  if (!value) return <>—</>;
  const date = new Date(value);
  return <time dateTime={value}><span>{date.toLocaleDateString([], { dateStyle: "medium" })}</span><small>{date.toLocaleTimeString([], { timeStyle: "short" })}</small></time>;
}
const descriptions: Record<AdminSection, string> = {
  overview: "A clear view of accounts, workflow activity and service health across this instance.",
  users: "Manage sign-in access and sessions. Workflow data stays with its workspace.",
  workspaces: "Workspace ownership and workflow counts across the platform.",
  workflows: "Published activity and archive state across all workspaces.",
  executions: "Investigate run metadata across the platform. Payloads stay inside their workspace.",
  audit: "A record of administrative and workspace actions. Secret values are never shown here.",
  support: "Handle support, privacy and data requests through the existing support process.",
};

function Badge({ children, good = false, warning = false }: { children: ReactNode; good?: boolean; warning?: boolean }) {
  return <span className={`admin-badge${good ? " admin-badge--good" : warning ? " admin-badge--warning" : ""}`}>{children}</span>;
}

const emptyScope: Record<string, string> = {};
function adminHref(section: string, params: Record<string, string>) { return `/admin/${section}?${new URLSearchParams(params)}`; }
function targetHref(type: string, id: string | null) {
  if (!id) return undefined;
  const target = ({ user: ["users", "userId"], workspace: ["workspaces", "workspaceId"], workflow: ["workflows", "workflowId"], execution: ["executions", "executionId"] } as Record<string, [string, string]>)[type];
  return target ? adminHref(target[0], { [target[1]]: id }) : undefined;
}

export function AdminDashboard({ section = "overview", initialStatus = "", scope = emptyScope }: { section?: AdminSection; initialStatus?: string; scope?: Record<string, string> }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [actorId, setActorId] = useState("");
  const [records, setRecords] = useState<Records>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(initialStatus);
  const [period, setPeriod] = useState(scope.workflowId || scope.executionId ? "all" : "24h");
  const [auditDraft, setAuditDraft] = useState({ actor: "", from: "", to: "", targetType: scope.targetType ?? "", targetId: scope.targetId ?? "" });
  const [auditSearch, setAuditSearch] = useState(auditDraft);
  const [refresh, setRefresh] = useState(0);
  const [confirmation, setConfirmation] = useState<{ user: User; action: "sessions" | "disable" | "enable" } | null>(null);

  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setRecords({});
    void (async () => {
      const access = await apiRequest<{ userId: string }>("/admin/access");
      if (!active) return;
      setActorId(access.userId);
      if (section === "overview") {
        const data = await apiRequest<Overview>("/admin/overview");
        if (active) setOverview(data);
      } else if (section !== "support") {
        const params = new URLSearchParams({ ...scope, q: search, page: String(page) });
        if (section === "executions") { if (status) params.set("status", status); params.set("period", period); }
        if (section === "audit") for (const [key, value] of Object.entries(auditSearch)) { if (value) params.set(key, value); else params.delete(key); }
        const data = await apiRequest<Records>(`/admin/${section}?${params}`);
        if (active) setRecords(data);
      }
    })().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Administration is unavailable."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [section, search, page, status, period, refresh, scope, auditSearch]);

  async function confirmAction() {
    if (!confirmation || saving) return;
    const { user, action } = confirmation;
    setSaving(true); setError(""); setNotice("");
    try {
      if (action === "sessions") {
        const result = await apiRequest<{ revoked: number }>(`/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`, { method: "POST", body: "{}" });
        setNotice(`${result.revoked} sessions signed out for ${user.email}.`);
      } else {
        await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/${action}`, { method: "POST", body: "{}" });
        setNotice(`Sign-in ${action === "disable" ? "disabled" : "enabled"} for ${user.email}.`);
        setRefresh((value) => value + 1);
      }
      setConfirmation(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the account."); }
    finally { setSaving(false); }
  }

  const count = section === "audit" ? records.events?.length ?? 0 : records[section as keyof Omit<Records, "hasMore" | "events">]?.length ?? 0;
  return <AdminShell section={section}>
    <PageHeader eyebrow="PLATFORM / ALL WORKSPACES" title={section === "overview" ? "Platform administration" : adminLabel(section)} description={descriptions[section]} actions={section !== "support" && <Button variant="secondary" disabled={busy} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />Refresh</Button>} />
    {Object.keys(scope).length > 0 && <div className="admin-context" aria-label="Current administrative filters"><span>Filtered view</span>{Object.entries(scope).map(([key, value]) => <span className="admin-context__filter" key={key}>{({ userId: "User", workspaceId: "Workspace", workflowId: "Workflow", executionId: "Execution", actorId: "Actor", targetType: "Target type", targetId: "Target" } as Record<string, string>)[key] ?? key}<code title={value}>{value}</code></span>)}<Link href={`/admin/${section}`}>Clear filters</Link></div>}
    {error && <Status tone="error">{error} <Button variant="ghost" onClick={() => setRefresh((value) => value + 1)}>Try again</Button></Status>}
    {notice && <Status tone="success">{notice}</Status>}
    {busy && <Progress label={`Loading ${section}`} />}
    {section === "overview" && overview && !error && <>
      <div className="admin-metrics">{[["Users", overview.users, "users"], ["Workspaces", overview.workspaces, "workspaces"], ["Workflows", overview.workflows, "workflows"], ["Active workflows", overview.activeWorkflows, "workflows"]].map(([label, value, route]) => <Link href={`/admin/${route}`} className="admin-metric" key={label}><span>{label}<ArrowUpRight size={15} aria-hidden="true" /></span><strong>{Number(value).toLocaleString()}</strong><small>Across this instance</small></Link>)}</div>
      <div className="admin-overview-grid">
        <section className="admin-card"><div className="admin-card__heading"><h2>Service health</h2><Badge good={overview.health.status === "ready"}>{overview.health.status}</Badge></div><p>Current service checks. Readiness does not guarantee that every workflow succeeds.</p><dl className="admin-health">{[["Database", overview.health.checks.database], ["Execution queue", overview.health.checks.queue.status], ["Scheduler", overview.health.checks.scheduler]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd><Badge good={value === "ready" || value === "enabled"}>{value}</Badge></dd></div>)}</dl></section>
        <section className="admin-card"><div className="admin-card__heading"><h2>Runs needing attention</h2><span className="admin-caption">Last 24 hours</span></div><strong className="admin-attention-count">{overview.failedRuns.toLocaleString()}</strong><p>Failed executions in the last 24 hours. Review failures before changing an account or workflow.</p><Link className="admin-text-link" href="/admin/executions?status=FAILED">Review executions<ArrowUpRight size={15} aria-hidden="true" /></Link></section>
      </div>
      <Status tone="info" className="admin-scope-note"><ShieldCheck size={16} aria-hidden="true" /><span>Platform administration shows operational metadata. Connections and execution payloads remain in the workspace.</span></Status>
    </>}
    {section === "support" && !busy && !error && <div className="admin-overview-grid"><section className="admin-card"><CircleHelp size={22} aria-hidden="true" /><h2>Support requests</h2><p>Review incoming requests through the published support channel. Confirm which account and workspace need help.</p><Link className="admin-text-link" href="/support">Open support information<ArrowUpRight size={15} /></Link></section><section className="admin-card"><ShieldCheck size={22} aria-hidden="true" /><h2>Privacy and data requests</h2><p>Verify account ownership before taking action. Data deletion is a manual operator process; this area never deletes workspace data.</p><Link className="admin-text-link" href="/privacy">Read the privacy policy<ArrowUpRight size={15} /></Link></section></div>}
    {section !== "overview" && section !== "support" && <section className="admin-list" aria-busy={busy}>
      <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); setAuditSearch(auditDraft); }}>
        <label className="admin-search__query">Search {section}<span><Search size={16} aria-hidden="true" /><input maxLength={80} value={searchDraft} placeholder={section === "users" ? "Name or email" : section === "audit" ? "Action name" : section === "executions" ? "Workflow name" : "Name"} onChange={(event) => setSearchDraft(event.target.value)} /></span></label>
        {section === "executions" && <><label>Status<Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{["QUEUED", "RUNNING", "WAITING_APPROVAL", "SUCCEEDED", "FAILED", "CANCELLED"].map((value) => <option key={value} value={value}>{adminLabel(value.toLowerCase().replaceAll("_", " "))}</option>)}</Select></label><label>Period<Select value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1); }}><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All retained history</option></Select></label></>}
        {section === "audit" && <>
          <label>Actor email<input value={auditDraft.actor} maxLength={80} placeholder="Name@example.com" onChange={(event) => setAuditDraft({ ...auditDraft, actor: event.target.value })} /></label>
          <label>From (UTC)<input type="date" value={auditDraft.from} onChange={(event) => setAuditDraft({ ...auditDraft, from: event.target.value })} /></label>
          <label>Through (UTC)<input type="date" value={auditDraft.to} min={auditDraft.from || undefined} onChange={(event) => setAuditDraft({ ...auditDraft, to: event.target.value })} /></label>
          <label>Target type<Select value={auditDraft.targetType} onChange={(event) => setAuditDraft({ ...auditDraft, targetType: event.target.value })}><option value="">All targets</option>{["user", "workspace", "workflow", "execution", "credential"].map((value) => <option key={value} value={value}>{adminLabel(value)}</option>)}</Select></label>
          <label>Target ID<input value={auditDraft.targetId} maxLength={128} placeholder="Exact ID (optional)" onChange={(event) => setAuditDraft({ ...auditDraft, targetId: event.target.value })} /></label>
        </>}
        <Button variant="secondary" type="submit" disabled={busy}>Search</Button>
      </form>
      {!busy && !error && count === 0 && <EmptyState icon={<Search size={22} />} title={`No ${section === "audit" ? "audit events" : section} found`} description={search || status ? "Try a different search or filter." : "No records are available in this view."} />}
      {!busy && !error && count > 0 && <div className="admin-table-scroll"><table className="admin-table"><caption>{adminLabel(section)} · {Object.keys(scope).length ? "filtered context" : "all workspaces"}</caption>
        {section === "users" && <><thead><tr><th scope="col">User</th><th scope="col">Sign-in</th><th scope="col">Workspaces</th><th scope="col">Joined</th><th scope="col" className="admin-actions">Actions</th></tr></thead><tbody>{records.users?.map((user) => <tr key={user.id}><td><strong>{user.displayName || user.email}</strong><small>{user.email}</small></td><td><Badge good={!user.disabledAt} warning={Boolean(user.disabledAt)}>{user.disabledAt ? "Disabled" : "Active"}</Badge></td><td><Link className="admin-text-link" href={adminHref("workspaces", { userId: user.id })}>{user._count.ownedWorkspaces} workspaces<ArrowUpRight size={13} /></Link><Link className="admin-subtle-link" href={adminHref("audit", { actorId: user.id })}>View activity</Link></td><td><RecordDate value={user.createdAt} /></td><td className="admin-actions">{user.id === actorId ? <Badge>You</Badge> : <Menu label={user.email} trigger={<MoreVertical size={18} aria-hidden="true" />}><button type="button" role="menuitem" disabled={saving} onClick={() => setConfirmation({ user, action: "sessions" })}><LogOut size={16} aria-hidden="true" />Sign out sessions</button><button type="button" role="menuitem" data-tone={user.disabledAt ? undefined : "danger"} disabled={saving} onClick={() => setConfirmation({ user, action: user.disabledAt ? "enable" : "disable" })}>{user.disabledAt ? <UserRoundCheck size={16} aria-hidden="true" /> : <UserRoundX size={16} aria-hidden="true" />}{user.disabledAt ? "Enable sign-in" : "Disable sign-in"}</button></Menu>}</td></tr>)}</tbody></>}
        {section === "workspaces" && <><thead><tr><th scope="col">Workspace</th><th scope="col">Owner</th><th scope="col">Workflows</th><th scope="col">Updated</th></tr></thead><tbody>{records.workspaces?.map((space) => <tr key={space.id}><td><Link className="admin-text-link" href={adminHref("workflows", { workspaceId: space.id })}>{space.name}<ArrowUpRight size={13} /></Link><Link className="admin-subtle-link" href={adminHref("audit", { workspaceId: space.id })}>View activity</Link></td><td><Link className="admin-subtle-link" href={adminHref("users", { userId: space.owner.id })}>{space.owner.email}</Link></td><td>{space._count.workflows}</td><td><RecordDate value={space.updatedAt} /></td></tr>)}</tbody></>}
        {section === "workflows" && <><thead><tr><th scope="col">Workflow</th><th scope="col">Workspace</th><th scope="col">Status</th><th scope="col">Updated</th></tr></thead><tbody>{records.workflows?.map((workflow) => <tr key={workflow.id}><td><Link className="admin-text-link" href={adminHref("executions", { workflowId: workflow.id })}>{workflow.name}<ArrowUpRight size={13} /></Link><Link className="admin-subtle-link" href={adminHref("audit", { targetType: "workflow", targetId: workflow.id })}>View activity</Link></td><td><Link className="admin-subtle-link" href={adminHref("workspaces", { workspaceId: workflow.workspace.id })}>{workflow.workspace.name}</Link></td><td><Badge good={workflow.isActive && !workflow.archivedAt}>{workflow.archivedAt ? "Archived" : workflow.isActive ? "Active" : "Inactive"}</Badge></td><td><RecordDate value={workflow.updatedAt} /></td></tr>)}</tbody></>}
        {section === "executions" && <><thead><tr><th scope="col">Workflow</th><th scope="col">Status</th><th scope="col">Mode</th><th scope="col">Created</th></tr></thead><tbody>{records.executions?.map((run) => <tr key={run.id}><td><Link className="admin-text-link" href={adminHref("workflows", { workflowId: run.workflowVersion.workflow.id })}>{run.workflowVersion.workflow.name}</Link><small>{run.workflowVersion.workflow.workspace?.name}</small><details className="admin-run-details"><summary>Run details</summary><dl><dt>Execution</dt><dd className="admin-record-id">{run.id}</dd><dt>Version</dt><dd>{run.workflowVersion.version}</dd><dt>Started</dt><dd>{run.startedAt ? <RecordDate value={run.startedAt} /> : "Not started"}</dd><dt>Completed</dt><dd>{run.completedAt ? <RecordDate value={run.completedAt} /> : "Not completed"}</dd>{run.errorCode && <><dt>Error code</dt><dd>{run.errorCode}</dd></>}</dl><p>Inputs and outputs remain in the workspace.</p></details></td><td><Badge good={run.status === "SUCCEEDED"} warning={run.status === "FAILED"}>{adminLabel(run.status.toLowerCase().replaceAll("_", " "))}</Badge></td><td>{run.mode.toLowerCase()}</td><td><RecordDate value={run.createdAt} /></td></tr>)}</tbody></>}
        {section === "audit" && <><thead><tr><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Target</th><th scope="col">When</th></tr></thead><tbody>{records.events?.map((event) => <tr key={event.id}><td><strong>{event.action}</strong></td><td>{event.actor ? <Link className="admin-subtle-link" href={adminHref("users", { userId: event.actor.id })}>{event.actor.email}</Link> : "System"}</td><td>{targetHref(event.targetType, event.targetId) ? <Link className="admin-text-link" href={targetHref(event.targetType, event.targetId)!}>{adminLabel(event.targetType)}<ArrowUpRight size={13} /></Link> : adminLabel(event.targetType)}<small className="admin-record-id">{event.targetId ?? "No target ID"}</small>{event.workspaceId && <Link className="admin-subtle-link" href={adminHref("workspaces", { workspaceId: event.workspaceId })}>View workspace</Link>}</td><td><RecordDate value={event.createdAt} /></td></tr>)}</tbody></>}
      </table></div>}
      <footer className="admin-pagination"><span>Page {page}{!busy && !error ? ` · ${count} records` : ""}</span><div><Button variant="secondary" disabled={busy || page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="secondary" disabled={busy || !records.hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button></div></footer>
    </section>}
    {confirmation && <div className="admin-dialog-backdrop"><Dialog label="Confirm account action" className="admin-dialog" onClose={() => { if (!saving) setConfirmation(null); }}><DialogHeader title={confirmation.action === "sessions" ? "Sign out sessions?" : confirmation.action === "disable" ? "Disable sign-in?" : "Enable sign-in?"} onClose={() => { if (!saving) setConfirmation(null); }} /><p><strong>{confirmation.user.email}</strong></p><p>{confirmation.action === "sessions" ? "All sessions will be signed out. The user can sign in again." : confirmation.action === "disable" ? "Active sessions will be signed out. Existing workflows continue running; no data will be deleted." : "This user will be able to sign in again."}</p>{error && <Status tone="error">{error}</Status>}<div className="admin-dialog__actions"><Button variant="secondary" disabled={saving} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant={confirmation.action === "disable" ? "danger" : "primary"} disabled={saving} onClick={() => void confirmAction()}>{saving ? "Applying…" : "Confirm"}</Button></div></Dialog></div>}
  </AdminShell>;
}
