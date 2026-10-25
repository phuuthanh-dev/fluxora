"use client";

import { Activity, Archive, ArrowRight, ChevronDown, CirclePlus, Copy, FilePlus2, FolderKanban, History, LayoutDashboard, LoaderCircle, LogOut, MoreVertical, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, apiUrl } from "../api/api-client";
import { ThemeToggle } from "../theme/theme-toggle";
import type { ApiWorkflow } from "../workflow/workflow-api";
import { Button, Dialog, IconButton, Menu, Select, Status } from "../../components/ui";

type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type CurrentUser = { email: string; displayName: string | null };
type ProviderStatus = { google: boolean; github: boolean; steam: boolean };
type IdentitySummary = { provider: "GOOGLE" | "GITHUB" | "STEAM"; providerAccountId: string };
type RuntimeStatus = { status: "ready" | "degraded"; checks: { database: "ready" | "unavailable"; queue: { status: "ready" | "unavailable"; mode: "inline" | "redis"; configuredWorkerConcurrency: number; waiting: number; active: number; delayed: number; failed: number } } };
type WorkflowStatusFilter = "ALL" | "LIVE" | "DRAFT";
type WorkflowSort = "UPDATED" | "NAME" | "STATUS";
type WorkflowAction = { type: "rename" | "archive" | "delete"; workflow: ApiWorkflow } | { type: "duplicate"; workflow: ApiWorkflow };
type ExecutionSummary = { id: string; workflowId: string; workflowName: string; workflowVersion: number; status: "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "SUCCEEDED" | "FAILED" | "CANCELLED"; mode: "mock" | "live"; createdAt: string; startedAt: string | null; completedAt: string | null; error: { code: string; message: string | null } | null };

export function WorkflowDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflows, setWorkflows] = useState<ApiWorkflow[]>([]);
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [executionCenterOpen, setExecutionCenterOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderStatus>({ google: false, github: false, steam: false });
  const [identities, setIdentities] = useState<IdentitySummary[]>([]);
  const [workflowName, setWorkflowName] = useState("Untitled workflow");
  const [workspaceName, setWorkspaceName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [unlinkingProvider, setUnlinkingProvider] = useState<IdentitySummary["provider"] | null>(null);
  const [notice, setNotice] = useState("Loading your workspace…");
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastCreateTemplate, setLastCreateTemplate] = useState<string | undefined>(undefined);
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusFilter>("ALL");
  const [workflowSort, setWorkflowSort] = useState<WorkflowSort>("UPDATED");
  const [workflowAction, setWorkflowAction] = useState<WorkflowAction | null>(null);
  const [workflowActionName, setWorkflowActionName] = useState("");
  const [workflowActionError, setWorkflowActionError] = useState<string | null>(null);
  const [workflowActionLoading, setWorkflowActionLoading] = useState(false);
  const activeWorkspaceIdRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadWorkflows = async (targetWorkspaceId: string, signal?: AbortSignal) => {
    if (!targetWorkspaceId) {
      setWorkflows([]);
      return;
    }
    const response = await apiRequest<{ workflows: ApiWorkflow[] }>(
      `/workspaces/${targetWorkspaceId}/workflows`,
      signal ? { signal } : undefined
    );
    if (activeWorkspaceIdRef.current !== targetWorkspaceId) return;
    setWorkflows(response.workflows);
  };

  const loadExecutions = async (targetWorkspaceId: string, signal?: AbortSignal) => {
    if (!targetWorkspaceId) {
      setExecutions([]);
      return;
    }
    setExecutionsLoading(true);
    try {
      const response = await apiRequest<{ executions: ExecutionSummary[] }>(
        `/workspaces/${targetWorkspaceId}/executions`,
        signal ? { signal } : undefined,
      );
      if (activeWorkspaceIdRef.current !== targetWorkspaceId) return;
      setExecutions(response.executions);
    } finally {
      if (!signal?.aborted && activeWorkspaceIdRef.current === targetWorkspaceId) setExecutionsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [auth, workspaceResponse, providerResponse, identityResponse] = await Promise.all([
          apiRequest<{ user: CurrentUser }>("/auth/me"),
          apiRequest<{ workspaces: WorkspaceSummary[] }>("/workspaces"),
          apiRequest<ProviderStatus>("/auth/providers"),
          apiRequest<{ identities: IdentitySummary[] }>("/auth/identities"),
        ]);
        if (!active) return;
        setUser(auth.user);
        setWorkspaces(workspaceResponse.workspaces);
        setProviders(providerResponse);
        setIdentities(identityResponse.identities);
        const initialWorkspaceId = workspaceResponse.workspaces[0]?.id ?? "";
        activeWorkspaceIdRef.current = initialWorkspaceId;
        setWorkspaceId(initialWorkspaceId);
        await Promise.all([loadWorkflows(initialWorkspaceId), loadExecutions(initialWorkspaceId)]);
        const parameters = new URLSearchParams(window.location.search);
        if (active) setNotice(parameters.get("identity") === "steam" ? "Steam identity linked. Steam API access still requires a separate credential." : parameters.get("identityError") === "steam" ? "Steam identity could not be linked. Please try again." : initialWorkspaceId ? "Choose a workflow or start a new one." : "Create a workspace to begin.");
      } catch (reason) {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Unable to load your workspace.";
        if (message === "Sign in is required." || message === "Your session has expired.") router.replace("/");
        else setNotice(message);
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    void (async () => {
      setRuntimeLoading(true);
      const runtimeResponse = await loadRuntimeStatus();
      if (!active) return;
      setRuntime(runtimeResponse);
      setRuntimeLoading(false);
    })();

    return () => { active = false; };
  }, [router]);

  const switchWorkspace = async (nextWorkspaceId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeWorkspaceIdRef.current = nextWorkspaceId;

    setWorkspaceId(nextWorkspaceId);
    setWorkflows([]);
    setExecutions([]);
    setWorkflowQuery("");
    setWorkflowStatus("ALL");
    setWorkflowSort("UPDATED");
    setNotice("Loading workflows and recent runs…");
    try {
      await Promise.all([loadWorkflows(nextWorkspaceId, controller.signal), loadExecutions(nextWorkspaceId, controller.signal)]);
      if (activeWorkspaceIdRef.current !== nextWorkspaceId) return;
      setNotice("Choose a workflow or start a new one.");
    } catch (reason) {
      if (controller.signal.aborted || activeWorkspaceIdRef.current !== nextWorkspaceId) return;
      setNotice(reason instanceof Error ? reason.message : "Unable to load workflows.");
    }
  };

  const visibleWorkflows = useMemo(() => {
    const query = workflowQuery.trim().toLocaleLowerCase();
    return workflows
      .filter((workflow) => {
        if (workflowStatus === "LIVE" && !workflow.isActive) return false;
        if (workflowStatus === "DRAFT" && workflow.published) return false;
        if (!query) return true;
        return `${workflow.name} ${workflow.description ?? ""}`.toLocaleLowerCase().includes(query);
      })
      .sort((left, right) => {
        if (workflowSort === "NAME") return left.name.localeCompare(right.name);
        if (workflowSort === "STATUS") return Number(Boolean(right.published)) - Number(Boolean(left.published)) || left.name.localeCompare(right.name);
        return new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime();
      });
  }, [workflowQuery, workflowSort, workflowStatus, workflows]);

  const hasWorkflowFilters = workflowQuery.trim().length > 0 || workflowStatus !== "ALL" || workflowSort !== "UPDATED";

  const openWorkflowAction = (action: WorkflowAction["type"], workflow: ApiWorkflow) => {
    setWorkflowAction({ type: action, workflow } as WorkflowAction);
    setWorkflowActionName(workflow.name);
    setWorkflowActionError(null);
  };

  const closeWorkflowAction = () => {
    if (workflowActionLoading) return;
    setWorkflowAction(null);
    setWorkflowActionError(null);
  };

  const applyWorkflowAction = async () => {
    if (!workflowAction) return;
    const { type, workflow } = workflowAction;
    if (type === "rename" && !workflowActionName.trim()) return;
    setWorkflowActionLoading(true);
    setWorkflowActionError(null);
    try {
      if (type === "rename") {
        const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}`, { method: "PATCH", body: JSON.stringify({ name: workflowActionName.trim() }) });
        setWorkflows((current) => current.map((candidate) => candidate.id === workflow.id ? response.workflow : candidate));
        setNotice("Workflow renamed.");
      } else if (type === "duplicate") {
        const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/clone`, { method: "POST" });
        setWorkflows((current) => [response.workflow, ...current]);
        setNotice("Workflow duplicated.");
      } else if (type === "archive") {
        await apiRequest(`/workflows/${workflow.id}/archive`, { method: "POST" });
        setWorkflows((current) => current.filter((candidate) => candidate.id !== workflow.id));
        setNotice("Workflow archived.");
      } else {
        await apiRequest(`/workflows/${workflow.id}`, { method: "DELETE" });
        setWorkflows((current) => current.filter((candidate) => candidate.id !== workflow.id));
        setNotice("Workflow permanently deleted.");
      }
      setWorkflowAction(null);
    } catch (reason) {
      setWorkflowActionError(reason instanceof Error ? reason.message : "Unable to update this workflow.");
    } finally {
      setWorkflowActionLoading(false);
    }
  };

  const createWorkflow = async (templateSlug?: string) => {
    if (!workspaceId || (!templateSlug && !workflowName.trim())) return;
    setIsCreating(true);
    setCreateError(null);
    setLastCreateTemplate(templateSlug);
    try {
      const response = templateSlug
        ? await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspaceId}/workflows/from-template/${templateSlug}`, { method: "POST" })
        : await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspaceId}/workflows`, { method: "POST", body: JSON.stringify({ name: workflowName.trim() }) });
      router.push(`/editor?workflow=${encodeURIComponent(response.workflow.id)}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to create the workflow.";
      setCreateError(message);
      setIsCreating(false);
    }
  };

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceName.trim()) return;
    setIsCreating(true);
    try {
      const response = await apiRequest<{ workspace: WorkspaceSummary }>("/workspaces", { method: "POST", body: JSON.stringify({ name: workspaceName.trim() }) });
      setWorkspaces((current) => [response.workspace, ...current]);
      setWorkspaceName("");
      await switchWorkspace(response.workspace.id);
      setNotice("Workspace created. Start its first workflow.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to create workspace.");
    } finally {
      setIsCreating(false);
    }
  };

  const logout = async () => {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  };

  const unlinkIdentity = async (provider: IdentitySummary["provider"]) => {
    setUnlinkingProvider(provider);
    try {
      const response = await apiRequest<{ identities: IdentitySummary[] }>(`/auth/identities/${provider.toLowerCase()}`, { method: "DELETE" });
      setIdentities(response.identities);
      setNotice(`${identityLabel(provider)} identity unlinked.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to unlink this identity.");
    } finally {
      setUnlinkingProvider(null);
    }
  };

  if (isLoading) return <main className="dashboard-loading" aria-busy="true"><Sparkles className="ui-spinner" size={22} /><strong>Preparing your dashboard</strong><span>Loading workspaces and workflows…</span></main>;

  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const steamIdentity = identities.find((identity) => identity.provider === "STEAM");
  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <button className="dashboard-brand" type="button" onClick={() => router.push("/dashboard")}><span><Sparkles size={17} /></span><strong>Workflow Automation</strong></button>
        <div className="dashboard-header__workspace"><label htmlFor="dashboard-workspace">Workspace</label><Select id="dashboard-workspace" value={workspaceId} onChange={(event) => void switchWorkspace(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select></div>
        <div className="dashboard-header__user"><span>{user?.displayName ?? user?.email ?? "Owner"}</span>{steamIdentity ? <span className="dashboard-steam-status" title={`Steam ID ${steamIdentity.providerAccountId}`}>Steam linked</span> : <Button variant="ghost" className="dashboard-steam-link" disabled={!providers.steam} onClick={() => window.location.assign(`${apiUrl}/auth/steam/connect`)}>{providers.steam ? "Link Steam" : "Steam setup"}</Button>}
          <Menu label={`Connections${identities.length ? ` (${identities.length})` : ""}`} className="dashboard-connections">{identities.length ? identities.map((identity) => <div key={identity.provider}><span>{identityLabel(identity.provider)}</span><Button variant="ghost" disabled={unlinkingProvider === identity.provider} onClick={() => void unlinkIdentity(identity.provider)}>{unlinkingProvider === identity.provider ? "Unlinking…" : "Unlink"}</Button></div>) : <p>No external identities linked.</p>}</Menu>
          <ThemeToggle /><IconButton label="Sign out" onClick={() => void logout()}><LogOut size={16} /></IconButton></div>
      </header>
      <section className="dashboard-main">
        <div className="dashboard-hero"><div><p className="section-label">{activeWorkspace?.name ?? "WORKSPACE"}</p><h1>Your workflow control room.</h1><p>Create, publish, monitor, and revisit every automation from one place.</p></div><Button variant="primary" className="dashboard-new-button" onClick={() => document.getElementById("workflow-create")?.scrollIntoView({ behavior: "smooth", block: "center" })}><CirclePlus size={17} /> New workflow</Button></div>
        <div className="dashboard-stats"><div><LayoutDashboard size={17} /><strong>{workflows.length}</strong><span>workflows</span></div><div><FolderKanban size={17} /><strong>{workflows.filter((workflow) => workflow.isActive).length}</strong><span>active workflows</span></div><div><FilePlus2 size={17} /><strong>{workflows.filter((workflow) => !workflow.published).length}</strong><span>draft-only</span></div></div>
        <Status tone={runtimeLoading ? "info" : runtime?.status === "ready" ? "success" : runtime?.status === "degraded" ? "warning" : "error"} className={`dashboard-runtime dashboard-runtime--${runtimeLoading ? "checking" : runtime?.status ?? "unreachable"}`} aria-live="polite" aria-busy={runtimeLoading}><Activity size={17} /><div><strong>{runtimeLoading ? "Checking runtime status…" : runtime?.status === "ready" ? "Execution runtime ready" : runtime?.status === "degraded" ? "Execution runtime needs attention" : "Runtime status unreachable"}</strong><span>{runtimeLoading ? "Contacting the API readiness endpoint." : runtime ? `Database ${runtime.checks.database} · ${runtime.checks.queue.mode} queue ${runtime.checks.queue.status} · ${runtime.checks.queue.active}/${runtime.checks.queue.configuredWorkerConcurrency} active · ${runtime.checks.queue.waiting} queued` : "Could not reach the API readiness endpoint."}</span></div></Status>
        <section className="dashboard-executions" aria-labelledby="execution-center-heading"><div className="dashboard-section-heading dashboard-execution-toolbar"><div><p className="section-label">OPERATIONS</p><h2 id="execution-center-heading">Execution center</h2></div><div className="dashboard-execution-toolbar__actions"><span>{executionsLoading ? "Checking recent runs…" : `${executions.length} recent run${executions.length === 1 ? "" : "s"}`}</span><Button variant="ghost" className="dashboard-execution-toggle" aria-label={`${executionCenterOpen ? "Collapse" : "Expand"} execution center`} aria-expanded={executionCenterOpen} aria-controls="dashboard-execution-content" onClick={() => setExecutionCenterOpen((current) => !current)}>{executionCenterOpen ? "Collapse" : "Expand"}<ChevronDown size={15} aria-hidden="true" /></Button></div></div>{executionCenterOpen && <div id="dashboard-execution-content" className="dashboard-execution-panel">{executionsLoading ? <div className="dashboard-execution-empty" aria-busy="true"><LoaderCircle className="ui-spinner" size={18} /><span>Loading recent runs…</span></div> : executions.length === 0 ? <div className="dashboard-execution-empty"><History size={22} /><strong>Recent runs</strong><span>Run a test or publish a workflow to see execution activity here.</span></div> : <><div className="dashboard-execution-heading"><strong>Recent runs</strong><span>{executions.length} shown</span></div><div className="dashboard-execution-list">{executions.map((execution) => <article className="dashboard-execution" key={execution.id}><span className={`execution-status execution-status--${execution.status.toLowerCase()}`}>{executionLabel(execution.status)}</span><div className="dashboard-execution__detail"><strong>{execution.workflowName}</strong><span>v{execution.workflowVersion} · {execution.mode === "mock" ? "Test run" : "Live run"} · {formatExecutionTime(execution.createdAt)}</span>{execution.error && <small>{execution.error.code}: {execution.error.message}</small>}</div><Button variant="ghost" className="dashboard-execution__open" onClick={() => router.push(`/editor?workflow=${encodeURIComponent(execution.workflowId)}&execution=${encodeURIComponent(execution.id)}`)}>Open workflow <ArrowRight size={14} /></Button></article>)}</div></>}</div>}</section>
        <section id="workflow-create" className="dashboard-create"><div><p className="section-label">CREATE</p><h2>Start a workflow</h2><p>Use a blank canvas or the Steam daily report template.</p></div><div className="dashboard-create__actions"><input aria-label="New workflow name" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} /><Button variant="secondary" className="dashboard-secondary-button" onClick={() => void createWorkflow()} disabled={isCreating || !workspaceId || !workflowName.trim()}>{isCreating && lastCreateTemplate === undefined ? "Creating…" : "Blank workflow"}</Button><Button variant="primary" className="dashboard-primary-button" onClick={() => void createWorkflow("steam-daily-report")} disabled={isCreating || !workspaceId}>{isCreating && lastCreateTemplate === "steam-daily-report" ? "Creating…" : "Use Steam template"}</Button></div>{createError && <Status tone="error" className="dashboard-create__error"><span>{createError}</span><Button variant="ghost" className="dashboard-create__retry" onClick={() => void createWorkflow(lastCreateTemplate)} disabled={isCreating}>Retry</Button></Status>}</section>
        <section className="dashboard-workflows"><div className="dashboard-section-heading"><div><p className="section-label">WORKFLOWS</p><h2>All automations</h2></div><span role="status" aria-live="polite">{notice}</span></div><div className="dashboard-workflow-toolbar" aria-label="Workflow controls"><input type="search" aria-label="Search workflows" placeholder="Search workflows" value={workflowQuery} onChange={(event) => setWorkflowQuery(event.target.value)} /><Select aria-label="Workflow status" value={workflowStatus} onChange={(event) => setWorkflowStatus(event.target.value as WorkflowStatusFilter)}><option value="ALL">All statuses</option><option value="LIVE">Live</option><option value="DRAFT">Draft</option></Select><Select aria-label="Workflow sort" value={workflowSort} onChange={(event) => setWorkflowSort(event.target.value as WorkflowSort)}><option value="UPDATED">Last updated</option><option value="NAME">Name A–Z</option><option value="STATUS">Status</option></Select>{hasWorkflowFilters && <Button variant="ghost" className="dashboard-workflow-toolbar__clear" aria-label="Clear workflow filters" onClick={() => { setWorkflowQuery(""); setWorkflowStatus("ALL"); setWorkflowSort("UPDATED"); }}>Clear</Button>}</div><p className="dashboard-workflow-summary" role="status" aria-live="polite">{workflows.length === 0 ? "No workflows yet" : `Showing ${visibleWorkflows.length} of ${workflows.length} workflow${workflows.length === 1 ? "" : "s"}`}</p>{workflows.length === 0 ? <div className="dashboard-empty"><FolderKanban size={26} /><h3>No workflows in this workspace</h3><p>Start with the Steam template or create a blank automation.</p></div> : visibleWorkflows.length === 0 ? <div className="dashboard-empty dashboard-empty--filtered"><FolderKanban size={26} /><h3>No workflows match these filters</h3><p>Try a different search or clear the current filters.</p><Button variant="ghost" onClick={() => { setWorkflowQuery(""); setWorkflowStatus("ALL"); setWorkflowSort("UPDATED"); }}>Clear workflow filters</Button></div> : <div className="workflow-card-grid">{visibleWorkflows.map((workflow) => <article key={workflow.id} className="workflow-card"><div className="workflow-card__status"><span className={workflow.isActive ? "workflow-status workflow-status--live" : "workflow-status"}>{workflow.isActive ? `Live · v${workflow.published?.version ?? "—"}` : workflow.published ? `Published · v${workflow.published.version}` : "Draft"}</span><div className="workflow-card__meta"><span className="workflow-card__updated">Updated {new Date(workflow.updatedAt ?? Date.now()).toLocaleDateString()}</span><Menu label={`Workflow actions for ${workflow.name}`} trigger={<MoreVertical size={16} aria-hidden="true" />} className="workflow-card__menu"><div className="workflow-card__menu-list"><button type="button" onClick={() => openWorkflowAction("rename", workflow)}><Pencil size={14} />Rename</button><button type="button" onClick={() => openWorkflowAction("duplicate", workflow)}><Copy size={14} />Duplicate</button><button type="button" onClick={() => openWorkflowAction("archive", workflow)}><Archive size={14} />Archive</button><button type="button" className="workflow-card__delete" onClick={() => openWorkflowAction("delete", workflow)}><Trash2 size={14} />Delete permanently</button></div></Menu></div></div><div className="workflow-card__title"><h3>{workflow.name}</h3></div><p>{workflow.description || "No description yet. Open the editor to configure this workflow."}</p><footer><span>{workflow.draft?.graph.nodes.length ?? workflow.published?.graph.nodes.length ?? 0} nodes</span><Button variant="ghost" className="workflow-card__open" onClick={() => router.push(`/editor?workflow=${encodeURIComponent(workflow.id)}`)}>Open editor <ArrowRight size={15} /></Button></footer></article>)}</div>}</section>
        <section className="dashboard-workspace-create"><div><p className="section-label">WORKSPACE</p><h2>Create another workspace</h2></div><form onSubmit={createWorkspace}><input aria-label="New workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="e.g. Personal automations" /><Button variant="secondary" className="dashboard-secondary-button" disabled={isCreating || !workspaceName.trim()} type="submit">Create workspace</Button></form></section>
      </section>
      {workflowAction && <div className="dashboard-action-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWorkflowAction(); }}><Dialog label={workflowAction.type === "rename" ? "Rename workflow" : workflowAction.type === "archive" ? "Archive workflow" : workflowAction.type === "delete" ? "Delete workflow" : "Duplicate workflow"} className="dashboard-action-dialog"><p className="section-label">WORKFLOW ACTION</p><h2>{workflowAction.type === "rename" ? "Rename workflow" : workflowAction.type === "archive" ? "Archive workflow" : workflowAction.type === "delete" ? "Delete workflow" : "Duplicate workflow"}</h2>{workflowAction.type === "rename" ? <><p>Choose a clear name for <strong>{workflowAction.workflow.name}</strong>.</p><label className="dashboard-action-dialog__field"><span>Workflow name</span><input aria-label="Workflow name" value={workflowActionName} onChange={(event) => setWorkflowActionName(event.target.value)} autoFocus /></label></> : <p>{workflowAction.type === "archive" ? <><strong>{workflowAction.workflow.name}</strong> will be hidden from this workspace. Its versions and execution history stay available.</> : workflowAction.type === "delete" ? <><strong>{workflowAction.workflow.name}</strong> will be permanently removed. This is only allowed when it has no execution history.</> : <>Create a new draft copy of <strong>{workflowAction.workflow.name}</strong>?</>}</p>}{workflowActionError && <Status tone="error" className="dashboard-action-dialog__error">{workflowActionError}</Status>}<div className="dashboard-action-dialog__actions"><Button variant="ghost" onClick={closeWorkflowAction} disabled={workflowActionLoading}>Cancel</Button><Button variant={workflowAction.type === "delete" ? "danger" : "primary"} onClick={() => void applyWorkflowAction()} disabled={workflowActionLoading || (workflowAction.type === "rename" && !workflowActionName.trim())}>{workflowActionLoading ? "Working…" : workflowAction.type === "rename" ? "Save name" : workflowAction.type === "archive" ? "Archive workflow" : workflowAction.type === "delete" ? "Delete permanently" : "Duplicate workflow"}</Button></div></Dialog></div>}
    </main>
  );
}

function identityLabel(provider: IdentitySummary["provider"]) {
  return provider === "GOOGLE" ? "Google" : provider === "GITHUB" ? "GitHub" : "Steam";
}

function executionLabel(status: ExecutionSummary["status"]) {
  return status === "SUCCEEDED" ? "Succeeded" : status === "WAITING_APPROVAL" ? "Waiting" : status.charAt(0) + status.slice(1).toLowerCase();
}

function formatExecutionTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

async function loadRuntimeStatus(): Promise<RuntimeStatus | null> {
  try {
    const response = await fetch(`${apiUrl}/health/ready`, { credentials: "include" });
    const body = await response.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const status = (body as Record<string, unknown>).status;
    return status === "ready" || status === "degraded" ? body as RuntimeStatus : null;
  } catch {
    return null;
  }
}
