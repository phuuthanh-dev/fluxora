"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogHeader, PageHeader, Progress, Status } from "../../components/ui";
import { apiRequest } from "../api/api-client";
import { AppShellHeader, type AppShellWorkspace } from "../app-shell/app-shell-header";
import "./admin.css";

type Overview = { users: number; workspaces: number; workflows: number; activeWorkflows: number; failedRuns: number; health: { status: string; checks: { database: string; scheduler: string; queue: { status: string } } } };
type User = { id: string; email: string; displayName: string | null; createdAt: string; disabledAt: string | null; _count: { ownedWorkspaces: number } };
type Workspace = { id: string; name: string; owner: { email: string }; _count: { workflows: number } };
type Workflow = { id: string; name: string; isActive: boolean; archivedAt: string | null; workspace: { name: string } };
type Execution = { id: string; status: string; mode: string; createdAt: string; workflowVersion: { workflow: { name: string } } };
type Audit = { id: string; action: string; targetType: string; createdAt: string; actor: { email: string } | null };
type Section = "Overview" | "Users" | "Workspaces" | "Workflows" | "Executions" | "Audit" | "Support";
const sections: Section[] = ["Overview", "Users", "Workspaces", "Workflows", "Executions", "Audit", "Support"];
const date = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export function AdminDashboard() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("Overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [workspaces, setWorkspaces] = useState<AppShellWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [spaces, setSpaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [events, setEvents] = useState<Audit[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [confirmation, setConfirmation] = useState<{ user: User; action: "sessions" | "disable" | "enable" } | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([apiRequest<Overview>("/admin/overview"), apiRequest<{ workspaces: AppShellWorkspace[] }>("/workspaces")]).then(([data, owned]) => {
      if (!active) return;
      setOverview(data); setWorkspaces(owned.workspaces); setWorkspaceId(owned.workspaces[0]?.id ?? "");
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Administration is unavailable."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!overview || section === "Overview" || section === "Support") return;
    let active = true;
    setBusy(true); setError("");
    const params = new URLSearchParams({ q: search, page: String(page) });
    void apiRequest<Record<string, unknown>>(`/admin/${section.toLowerCase()}?${params}`).then((data) => {
      if (!active) return;
      setHasMore(data.hasMore === true);
      if (section === "Users") setUsers(data.users as User[]);
      if (section === "Workspaces") setSpaces(data.workspaces as Workspace[]);
      if (section === "Workflows") setWorkflows(data.workflows as Workflow[]);
      if (section === "Executions") setExecutions(data.executions as Execution[]);
      if (section === "Audit") setEvents(data.events as Audit[]);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load this section."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [section, overview, search, page]);

  async function revoke(user: User) {
    setBusy(true); setError(""); setNotice("");
    try { const result = await apiRequest<{ revoked: number }>(`/admin/users/${encodeURIComponent(user.id)}/revoke-sessions`, { method: "POST", body: "{}" }); setNotice(`${result.revoked} sessions revoked for ${user.email}.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not revoke sessions."); }
    finally { setBusy(false); }
  }

  async function changeAccount(user: User) {
    const operation = user.disabledAt ? "enable" : "disable";
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/${operation}`, { method: "POST", body: "{}" });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, disabledAt: operation === "disable" ? new Date().toISOString() : null } : item));
      setNotice(`${user.email} is ${operation === "disable" ? "disabled" : "enabled"}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the account."); }
    finally { setBusy(false); }
  }

  return <main className="dashboard-page executions-page">
    <AppShellHeader workspaces={workspaces} workspaceId={workspaceId} onWorkspaceChange={setWorkspaceId} active="admin" />
    <section className="executions-main admin-main">
      <PageHeader eyebrow="INSTANCE" title="Platform administration" description="Monitor this Fluxora instance and manage account sessions." actions={<Button variant="secondary" onClick={() => router.push("/dashboard")}>Back to workspace</Button>} />
      {error && <Status tone="error">{error}</Status>}
      {notice && <Status tone="success">{notice}</Status>}
      {!overview && !error && <Progress label="Loading administration" />}
      {overview && <><nav className="admin-tabs" aria-label="Administration sections">{sections.map((item) => <Button key={item} variant={section === item ? "primary" : "secondary"} aria-current={section === item ? "page" : undefined} onClick={() => { setSection(item); setNotice(""); setSearch(""); setSearchDraft(""); setPage(1); }}>{item}</Button>)}</nav>
      {section === "Overview" ? <div className="admin-metrics">{[["Users", overview.users], ["Workspaces", overview.workspaces], ["Workflows", overview.workflows], ["Active workflows", overview.activeWorkflows], ["Failed runs", overview.failedRuns], ["API", overview.health.status], ["Database", overview.health.checks.database], ["Queue", overview.health.checks.queue.status], ["Scheduler", overview.health.checks.scheduler]].map(([label, value]) => <article className="admin-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div> : section === "Support" ? <section className="admin-card"><strong>Support and data requests</strong><p>Requests are handled through the existing support channel. Verify account ownership before acting. Account-wide deletion requires a manual operator process; this screen does not delete user data.</p><div className="admin-row__actions"><Button variant="secondary" onClick={() => router.push("/support")}>Open support</Button><Button variant="secondary" onClick={() => router.push("/privacy")}>Privacy policy</Button></div></section> : <section className="admin-list" aria-busy={busy}>
        <form className="admin-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchDraft.trim()); }}><label htmlFor="admin-search">Search {section.toLowerCase()}</label><input id="admin-search" maxLength={80} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} /><Button variant="secondary" type="submit">Search</Button></form>
        <p className="admin-list__hint">Page {page} · Up to 50 records</p>
        {busy && <Progress label={`Loading ${section.toLowerCase()}`} />}
        {section === "Users" && users.map((user) => <article className="admin-row" key={user.id}><div><strong>{user.displayName || user.email}</strong><span>{user.email} · {user.disabledAt ? "Disabled" : "Active"} · {user._count.ownedWorkspaces} workspaces · Joined {date(user.createdAt)}</span></div><div className="admin-row__actions"><Button variant="secondary" disabled={busy} onClick={() => setConfirmation({ user, action: "sessions" })}>Sign out sessions</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmation({ user, action: user.disabledAt ? "enable" : "disable" })}>{user.disabledAt ? "Enable sign-in" : "Disable sign-in"}</Button></div></article>)}
        {section === "Workspaces" && spaces.map((space) => <article className="admin-row" key={space.id}><div><strong>{space.name}</strong><span>{space.owner.email} · {space._count.workflows} workflows</span></div></article>)}
        {section === "Workflows" && workflows.map((workflow) => <article className="admin-row" key={workflow.id}><div><strong>{workflow.name}</strong><span>{workflow.workspace.name} · {workflow.archivedAt ? "Archived" : workflow.isActive ? "Active" : "Inactive"}</span></div></article>)}
        {section === "Executions" && executions.map((run) => <article className="admin-row" key={run.id}><div><strong>{run.workflowVersion.workflow.name}</strong><span>{run.status} · {run.mode} · {date(run.createdAt)}</span></div></article>)}
        {section === "Audit" && events.map((event) => <article className="admin-row" key={event.id}><div><strong>{event.action}</strong><span>{event.actor?.email ?? "System"} · {event.targetType} · {date(event.createdAt)}</span></div></article>)}
        <div className="admin-pagination"><Button variant="secondary" disabled={busy || page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="secondary" disabled={busy || !hasMore} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
      </section>}</>}
      {confirmation && <div className="admin-dialog-backdrop"><Dialog label="Confirm account action" className="admin-dialog" onClose={() => setConfirmation(null)}><DialogHeader title={confirmation.action === "sessions" ? "Sign out sessions?" : confirmation.action === "disable" ? "Disable sign-in?" : "Enable sign-in?"} onClose={() => setConfirmation(null)} /><p><strong>{confirmation.user.email}</strong></p><p>{confirmation.action === "sessions" ? "All sessions will be signed out. The user can sign in again." : confirmation.action === "disable" ? "Active sessions will be signed out. Existing workflows continue running." : "This user will be able to sign in again."}</p><div className="admin-dialog__actions"><Button variant="secondary" onClick={() => setConfirmation(null)}>Cancel</Button><Button variant="primary" onClick={() => { const selected = confirmation; setConfirmation(null); void (selected.action === "sessions" ? revoke(selected.user) : changeAccount(selected.user)); }}>Confirm</Button></div></Dialog></div>}
    </section>
  </main>;
}
