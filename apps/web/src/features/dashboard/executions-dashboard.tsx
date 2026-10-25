"use client";

import { ArrowLeft, ArrowRight, CircleAlert, History, LoaderCircle, LogOut, PlugZap, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api/api-client";
import { ThemeToggle } from "../theme/theme-toggle";
import { Button, EmptyState, IconButton, PageHeader, Progress, Select, Skeleton, Status } from "../../components/ui";

type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type CurrentUser = { email: string; displayName: string | null };
type ExecutionStatus = "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "SUCCEEDED" | "FAILED" | "CANCELLED";
type ExecutionFilter = "ALL" | "ATTENTION" | "IN_PROGRESS" | "FAILED" | "SUCCEEDED";
type ExecutionSummary = {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  status: ExecutionStatus;
  mode: "mock" | "live";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: { code: string; message: string | null } | null;
};

function executionLabel(status: ExecutionStatus) {
  return status === "SUCCEEDED" ? "Succeeded" : status === "WAITING_APPROVAL" ? "Waiting for approval" : status.charAt(0) + status.slice(1).toLowerCase();
}

function formatExecutionTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function ExecutionsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExecutionFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeWorkspaceId = useRef("");

  const loadExecutions = async (targetWorkspaceId: string, nextCursor?: string) => {
    if (!targetWorkspaceId) {
      setExecutions([]);
      setCursor(null);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }
    if (nextCursor) setIsLoadingMore(true);
    else {
      setIsLoading(true);
      setError(null);
    }
    try {
      const parameters = new URLSearchParams({ limit: "30" });
      if (nextCursor) parameters.set("cursor", nextCursor);
      const response = await apiRequest<{ executions: ExecutionSummary[]; nextCursor: string | null }>(`/workspaces/${targetWorkspaceId}/executions?${parameters.toString()}`);
      if (activeWorkspaceId.current !== targetWorkspaceId) return;
      setExecutions((current) => nextCursor ? [...current, ...response.executions.filter((candidate) => !current.some((existing) => existing.id === candidate.id))] : response.executions);
      setCursor(response.nextCursor);
    } catch (reason) {
      if (activeWorkspaceId.current !== targetWorkspaceId) return;
      setError(reason instanceof Error ? reason.message : "Unable to load executions.");
    } finally {
      if (activeWorkspaceId.current === targetWorkspaceId) {
        if (nextCursor) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    }
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
        const requestedWorkspace = searchParams.get("workspace");
        const initialWorkspace = workspaceResponse.workspaces.find((workspace) => workspace.id === requestedWorkspace) ?? workspaceResponse.workspaces[0];
        const initialWorkspaceId = initialWorkspace?.id ?? "";
        activeWorkspaceId.current = initialWorkspaceId;
        setWorkspaceId(initialWorkspaceId);
        await loadExecutions(initialWorkspaceId);
      } catch (reason) {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Unable to load execution history.";
        if (message === "Sign in is required." || message === "Your session has expired.") router.replace("/");
        else setError(message);
      }
    })();
    return () => { active = false; };
  }, [router, searchParams]);

  const switchWorkspace = (nextWorkspaceId: string) => {
    activeWorkspaceId.current = nextWorkspaceId;
    setWorkspaceId(nextWorkspaceId);
    setExecutions([]);
    setCursor(null);
    setFilter("ALL");
    router.replace(`/dashboard/executions?workspace=${encodeURIComponent(nextWorkspaceId)}`);
    void loadExecutions(nextWorkspaceId);
  };

  const logout = async () => {
    await apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  };

  const counts = useMemo(() => ({
    attention: executions.filter((execution) => execution.status === "FAILED" || execution.status === "WAITING_APPROVAL").length,
    inProgress: executions.filter((execution) => execution.status === "QUEUED" || execution.status === "RUNNING").length,
    failed: executions.filter((execution) => execution.status === "FAILED").length,
    succeeded: executions.filter((execution) => execution.status === "SUCCEEDED").length,
  }), [executions]);
  const visibleExecutions = useMemo(() => executions.filter((execution) => {
    if (filter === "ATTENTION") return execution.status === "FAILED" || execution.status === "WAITING_APPROVAL";
    if (filter === "IN_PROGRESS") return execution.status === "QUEUED" || execution.status === "RUNNING";
    if (filter === "FAILED") return execution.status === "FAILED";
    if (filter === "SUCCEEDED") return execution.status === "SUCCEEDED";
    return true;
  }), [executions, filter]);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  return (
    <main className="dashboard-page executions-page">
      <header className="dashboard-header">
        <button className="dashboard-brand" type="button" onClick={() => router.push("/dashboard")}>
          <span><PlugZap size={17} /></span><strong>Workflow Automation</strong>
        </button>
        <div className="dashboard-header__workspace">
          <label htmlFor="executions-workspace">Workspace</label>
          <Select id="executions-workspace" value={workspaceId} onChange={(event) => switchWorkspace(event.target.value)} disabled={workspaces.length === 0}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </Select>
        </div>
        <div className="dashboard-header__user">
          <span>{user?.displayName ?? user?.email ?? "Owner"}</span>
          <Button variant="ghost" className="dashboard-header__link" onClick={() => router.push(workspaceId ? `/dashboard/connections?workspace=${encodeURIComponent(workspaceId)}` : "/dashboard/connections")}>
            <PlugZap size={15} /> Connections
          </Button>
          <ThemeToggle />
          <IconButton label="Sign out" onClick={() => void logout()}><LogOut size={16} /></IconButton>
        </div>
      </header>
      <section className="executions-main">
        <PageHeader
          eyebrow={activeWorkspace?.name ?? "EXECUTIONS"}
          title="Execution history"
          description="Inspect the immutable workflow version, mode, status, and redacted failure detail for every run in this workspace."
          actions={<><Button variant="secondary" onClick={() => router.push("/dashboard")}><ArrowLeft size={15} /> Dashboard</Button><IconButton variant="secondary" label="Refresh execution history" onClick={() => void loadExecutions(workspaceId)} disabled={isLoading || !workspaceId}><RefreshCw className={isLoading ? "ui-spinner" : undefined} size={16} /></IconButton></>}
        />
        {isLoading && executions.length === 0 ? <div className="executions-loading" aria-busy="true"><Skeleton /><Skeleton /><Skeleton /><Progress label="Loading execution history" /></div> : null}
        {!isLoading && error ? <Status tone="error" className="executions-error"><CircleAlert size={17} /><span>{error}</span><Button variant="ghost" onClick={() => void loadExecutions(workspaceId)}>Retry</Button></Status> : null}
        {!isLoading && !error && !workspaceId ? <EmptyState icon={<History size={24} />} title="Create a workspace first" description="Execution history is scoped to the workspace that owns the workflow." action={<Button variant="primary" onClick={() => router.push("/dashboard")}>Go to dashboard</Button>} /> : null}
        {!isLoading && !error && workspaceId && executions.length === 0 ? <EmptyState icon={<History size={24} />} title="No runs yet" description="Run a mock test from an editor, or activate a workflow for incoming triggers to build execution history." action={<Button variant="primary" onClick={() => router.push("/dashboard")}>Open workflows</Button>} /> : null}
        {!isLoading && !error && executions.length > 0 ? <section className="executions-list-panel" aria-labelledby="execution-list-heading">
          <div className="executions-list-panel__heading"><div><p className="section-label">RUNS</p><h2 id="execution-list-heading">Recent runs</h2></div><span>{visibleExecutions.length} of {executions.length} shown</span></div>
          <div className="dashboard-execution-filters executions-filters" role="group" aria-label="Filter execution history">
            <button type="button" className={filter === "ALL" ? "is-active" : undefined} aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>All ({executions.length})</button>
            <button type="button" className={filter === "ATTENTION" ? "is-active" : undefined} aria-pressed={filter === "ATTENTION"} onClick={() => setFilter("ATTENTION")}>Needs attention ({counts.attention})</button>
            <button type="button" className={filter === "IN_PROGRESS" ? "is-active" : undefined} aria-pressed={filter === "IN_PROGRESS"} onClick={() => setFilter("IN_PROGRESS")}>In progress ({counts.inProgress})</button>
            <button type="button" className={filter === "FAILED" ? "is-active" : undefined} aria-pressed={filter === "FAILED"} onClick={() => setFilter("FAILED")}>Failed ({counts.failed})</button>
            <button type="button" className={filter === "SUCCEEDED" ? "is-active" : undefined} aria-pressed={filter === "SUCCEEDED"} onClick={() => setFilter("SUCCEEDED")}>Succeeded ({counts.succeeded})</button>
          </div>
          {visibleExecutions.length === 0 ? <EmptyState className="executions-filtered-empty" icon={<History size={21} />} title="No matching runs" description="Choose another filter to see the remaining execution history." action={<Button variant="ghost" onClick={() => setFilter("ALL")}>Show all runs</Button>} /> : <div className="executions-list">{visibleExecutions.map((execution) => <article className="dashboard-execution executions-list__item" key={execution.id}>
            <span className={`execution-status execution-status--${execution.status.toLowerCase()}`}>{executionLabel(execution.status)}</span>
            <div className="dashboard-execution__detail"><strong>{execution.workflowName}</strong><span>v{execution.workflowVersion} · {execution.mode === "mock" ? "Test run" : "Live run"} · {formatExecutionTime(execution.createdAt)}</span>{execution.error ? <small>{execution.error.code}: {execution.error.message}</small> : null}</div>
            <Button variant="ghost" className="dashboard-execution__open" onClick={() => router.push(`/editor?workflow=${encodeURIComponent(execution.workflowId)}&execution=${encodeURIComponent(execution.id)}`)}>Inspect run <ArrowRight size={14} /></Button>
          </article>)}</div>}
          {cursor ? <div className="dashboard-execution-load-more"><Button variant="ghost" disabled={isLoadingMore} onClick={() => void loadExecutions(workspaceId, cursor)}>{isLoadingMore ? <><LoaderCircle className="ui-spinner" size={14} /> Loading more…</> : "Load more runs"}</Button></div> : null}
        </section> : null}
      </section>
    </main>
  );
}
