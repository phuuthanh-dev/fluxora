"use client";

import { ArrowRight, CirclePlus, FilePlus2, FolderKanban, LayoutDashboard, LogOut, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../api/api-client";
import type { ApiWorkflow } from "../workflow/workflow-api";

type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type CurrentUser = { email: string; displayName: string | null };

export function WorkflowDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflows, setWorkflows] = useState<ApiWorkflow[]>([]);
  const [workflowName, setWorkflowName] = useState("Untitled workflow");
  const [workspaceName, setWorkspaceName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState("Loading your workspace…");

  const loadWorkflows = async (targetWorkspaceId: string) => {
    if (!targetWorkspaceId) {
      setWorkflows([]);
      return;
    }
    const response = await apiRequest<{ workflows: ApiWorkflow[] }>(`/workspaces/${targetWorkspaceId}/workflows`);
    setWorkflows(response.workflows);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [auth, workspaceResponse] = await Promise.all([
          apiRequest<{ user: CurrentUser }>("/auth/me"),
          apiRequest<{ workspaces: WorkspaceSummary[] }>("/workspaces"),
        ]);
        if (!active) return;
        setUser(auth.user);
        setWorkspaces(workspaceResponse.workspaces);
        const initialWorkspaceId = workspaceResponse.workspaces[0]?.id ?? "";
        setWorkspaceId(initialWorkspaceId);
        await loadWorkflows(initialWorkspaceId);
        if (active) setNotice(initialWorkspaceId ? "Choose a workflow or start a new one." : "Create a workspace to begin.");
      } catch (reason) {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Unable to load your workspace.";
        if (message === "Sign in is required." || message === "Your session has expired.") router.replace("/");
        else setNotice(message);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [router]);

  const switchWorkspace = async (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    setNotice("Loading workflows…");
    try {
      await loadWorkflows(nextWorkspaceId);
      setNotice("Choose a workflow or start a new one.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to load workflows.");
    }
  };

  const createWorkflow = async (templateSlug?: string) => {
    if (!workspaceId || !workflowName.trim()) return;
    setIsCreating(true);
    try {
      const response = templateSlug
        ? await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspaceId}/workflows/from-template/${templateSlug}`, { method: "POST" })
        : await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspaceId}/workflows`, { method: "POST", body: JSON.stringify({ name: workflowName.trim() }) });
      router.push(`/editor?workflow=${encodeURIComponent(response.workflow.id)}`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to create the workflow.");
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

  if (isLoading) return <main className="dashboard-loading" aria-busy="true"><Sparkles className="ui-spinner" size={22} /><strong>Preparing your dashboard</strong><span>Loading workspaces and workflows…</span></main>;

  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <button className="dashboard-brand" type="button" onClick={() => router.push("/dashboard")}><span><Sparkles size={17} /></span><strong>Workflow Automation</strong></button>
        <div className="dashboard-header__workspace"><label htmlFor="dashboard-workspace">Workspace</label><select id="dashboard-workspace" value={workspaceId} onChange={(event) => void switchWorkspace(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></div>
        <div className="dashboard-header__user"><span>{user?.displayName ?? user?.email ?? "Owner"}</span><button type="button" onClick={() => void logout()} aria-label="Sign out"><LogOut size={16} /></button></div>
      </header>
      <section className="dashboard-main">
        <div className="dashboard-hero"><div><p className="section-label">{activeWorkspace?.name ?? "WORKSPACE"}</p><h1>Your workflow control room.</h1><p>Create, publish, monitor, and revisit every automation from one place.</p></div><button className="dashboard-new-button" type="button" onClick={() => document.getElementById("workflow-create")?.scrollIntoView({ behavior: "smooth", block: "center" })}><CirclePlus size={17} /> New workflow</button></div>
        <div className="dashboard-stats"><div><LayoutDashboard size={17} /><strong>{workflows.length}</strong><span>workflows</span></div><div><FolderKanban size={17} /><strong>{workflows.filter((workflow) => workflow.published).length}</strong><span>live versions</span></div><div><FilePlus2 size={17} /><strong>{workflows.filter((workflow) => !workflow.published).length}</strong><span>draft-only</span></div></div>
        <section id="workflow-create" className="dashboard-create"><div><p className="section-label">CREATE</p><h2>Start a workflow</h2><p>Use a blank canvas or the Steam daily report template.</p></div><div className="dashboard-create__actions"><input aria-label="New workflow name" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} /><button className="dashboard-secondary-button" type="button" onClick={() => void createWorkflow()} disabled={isCreating || !workspaceId || !workflowName.trim()}>Blank workflow</button><button className="dashboard-primary-button" type="button" onClick={() => void createWorkflow("steam-daily-report")} disabled={isCreating || !workspaceId}>{isCreating ? "Creating…" : "Use Steam template"}</button></div></section>
        <section className="dashboard-workflows"><div className="dashboard-section-heading"><div><p className="section-label">WORKFLOWS</p><h2>All automations</h2></div><span role="status" aria-live="polite">{notice}</span></div>{workflows.length === 0 ? <div className="dashboard-empty"><FolderKanban size={26} /><h3>No workflows in this workspace</h3><p>Start with the Steam template or create a blank automation.</p></div> : <div className="workflow-card-grid">{workflows.map((workflow) => <article key={workflow.id} className="workflow-card"><div className="workflow-card__status"><span className={workflow.published ? "workflow-status workflow-status--live" : "workflow-status"}>{workflow.published ? `Live · v${workflow.published.version}` : "Draft"}</span><span>Updated {new Date(workflow.updatedAt ?? Date.now()).toLocaleDateString()}</span></div><h3>{workflow.name}</h3><p>{workflow.description || "No description yet. Open the editor to configure this workflow."}</p><footer><span>{workflow.draft?.graph.nodes.length ?? workflow.published?.graph.nodes.length ?? 0} nodes</span><button type="button" onClick={() => router.push(`/editor?workflow=${encodeURIComponent(workflow.id)}`)}>Open editor <ArrowRight size={15} /></button></footer></article>)}</div>}</section>
        <section className="dashboard-workspace-create"><div><p className="section-label">WORKSPACE</p><h2>Create another workspace</h2></div><form onSubmit={createWorkspace}><input aria-label="New workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="e.g. Personal automations" /><button className="dashboard-secondary-button" disabled={isCreating || !workspaceName.trim()} type="submit">Create workspace</button></form></section>
      </section>
    </main>
  );
}
