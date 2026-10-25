"use client";

import { Activity, ArrowRight, CirclePlus, FilePlus2, FolderKanban, LayoutDashboard, LogOut, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiRequest, apiUrl } from "../api/api-client";
import { ThemeToggle } from "../theme/theme-toggle";
import type { ApiWorkflow } from "../workflow/workflow-api";
import { Button, IconButton, Menu, Select, Status } from "../../components/ui";

type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type CurrentUser = { email: string; displayName: string | null };
type ProviderStatus = { google: boolean; github: boolean; steam: boolean };
type IdentitySummary = { provider: "GOOGLE" | "GITHUB" | "STEAM"; providerAccountId: string };
type RuntimeStatus = { status: "ready" | "degraded"; checks: { database: "ready" | "unavailable"; queue: { status: "ready" | "unavailable"; mode: "inline" | "redis"; configuredWorkerConcurrency: number; waiting: number; active: number; delayed: number; failed: number } } };

export function WorkflowDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflows, setWorkflows] = useState<ApiWorkflow[]>([]);
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
        await loadWorkflows(initialWorkspaceId);
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
    setNotice("Loading workflows…");
    try {
      await loadWorkflows(nextWorkspaceId, controller.signal);
      if (activeWorkspaceIdRef.current !== nextWorkspaceId) return;
      setNotice("Choose a workflow or start a new one.");
    } catch (reason) {
      if (controller.signal.aborted || activeWorkspaceIdRef.current !== nextWorkspaceId) return;
      setNotice(reason instanceof Error ? reason.message : "Unable to load workflows.");
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
        <div className="dashboard-stats"><div><LayoutDashboard size={17} /><strong>{workflows.length}</strong><span>workflows</span></div><div><FolderKanban size={17} /><strong>{workflows.filter((workflow) => workflow.published).length}</strong><span>live versions</span></div><div><FilePlus2 size={17} /><strong>{workflows.filter((workflow) => !workflow.published).length}</strong><span>draft-only</span></div></div>
        <Status tone={runtimeLoading ? "info" : runtime?.status === "ready" ? "success" : runtime?.status === "degraded" ? "warning" : "error"} className={`dashboard-runtime dashboard-runtime--${runtimeLoading ? "checking" : runtime?.status ?? "unreachable"}`} aria-live="polite" aria-busy={runtimeLoading}><Activity size={17} /><div><strong>{runtimeLoading ? "Checking runtime status…" : runtime?.status === "ready" ? "Execution runtime ready" : runtime?.status === "degraded" ? "Execution runtime needs attention" : "Runtime status unreachable"}</strong><span>{runtimeLoading ? "Contacting the API readiness endpoint." : runtime ? `Database ${runtime.checks.database} · ${runtime.checks.queue.mode} queue ${runtime.checks.queue.status} · ${runtime.checks.queue.active}/${runtime.checks.queue.configuredWorkerConcurrency} active · ${runtime.checks.queue.waiting} queued` : "Could not reach the API readiness endpoint."}</span></div></Status>
        <section id="workflow-create" className="dashboard-create"><div><p className="section-label">CREATE</p><h2>Start a workflow</h2><p>Use a blank canvas or the Steam daily report template.</p></div><div className="dashboard-create__actions"><input aria-label="New workflow name" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} /><Button variant="secondary" className="dashboard-secondary-button" onClick={() => void createWorkflow()} disabled={isCreating || !workspaceId || !workflowName.trim()}>{isCreating && lastCreateTemplate === undefined ? "Creating…" : "Blank workflow"}</Button><Button variant="primary" className="dashboard-primary-button" onClick={() => void createWorkflow("steam-daily-report")} disabled={isCreating || !workspaceId}>{isCreating && lastCreateTemplate === "steam-daily-report" ? "Creating…" : "Use Steam template"}</Button></div>{createError && <Status tone="error" className="dashboard-create__error"><span>{createError}</span><Button variant="ghost" className="dashboard-create__retry" onClick={() => void createWorkflow(lastCreateTemplate)} disabled={isCreating}>Retry</Button></Status>}</section>
        <section className="dashboard-workflows"><div className="dashboard-section-heading"><div><p className="section-label">WORKFLOWS</p><h2>All automations</h2></div><span role="status" aria-live="polite">{notice}</span></div>{workflows.length === 0 ? <div className="dashboard-empty"><FolderKanban size={26} /><h3>No workflows in this workspace</h3><p>Start with the Steam template or create a blank automation.</p></div> : <div className="workflow-card-grid">{workflows.map((workflow) => <article key={workflow.id} className="workflow-card"><div className="workflow-card__status"><span className={workflow.published ? "workflow-status workflow-status--live" : "workflow-status"}>{workflow.published ? `Live · v${workflow.published.version}` : "Draft"}</span><span>Updated {new Date(workflow.updatedAt ?? Date.now()).toLocaleDateString()}</span></div><h3>{workflow.name}</h3><p>{workflow.description || "No description yet. Open the editor to configure this workflow."}</p><footer><span>{workflow.draft?.graph.nodes.length ?? workflow.published?.graph.nodes.length ?? 0} nodes</span><Button variant="ghost" className="workflow-card__open" onClick={() => router.push(`/editor?workflow=${encodeURIComponent(workflow.id)}`)}>Open editor <ArrowRight size={15} /></Button></footer></article>)}</div>}</section>
        <section className="dashboard-workspace-create"><div><p className="section-label">WORKSPACE</p><h2>Create another workspace</h2></div><form onSubmit={createWorkspace}><input aria-label="New workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="e.g. Personal automations" /><Button variant="secondary" className="dashboard-secondary-button" disabled={isCreating || !workspaceName.trim()} type="submit">Create workspace</Button></form></section>
      </section>
    </main>
  );
}

function identityLabel(provider: IdentitySummary["provider"]) {
  return provider === "GOOGLE" ? "Google" : provider === "GITHUB" ? "GitHub" : "Steam";
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
