"use client";

import { ArrowLeft, ArrowRight, CircleAlert, History, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/api-client";
import { Button, EmptyState, IconButton, PageHeader, Progress, SectionHeader, Skeleton, Status, Toolbar } from "../../components/ui";
import { AppShellHeader } from "../app-shell/app-shell-header";
import { SavedExecutionViews } from "./saved-execution-views";

type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type ExecutionStatus = "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "SUCCEEDED" | "FAILED" | "CANCELLED";
type ExecutionFilter = "ALL" | "ATTENTION" | "IN_PROGRESS" | "FAILED" | "SUCCEEDED";
type Retention = { successDays: number; failedDays: number; maxCount: number; enabled: boolean; countScope: "system" };
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
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExecutionFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retention, setRetention] = useState<Retention | null>(null);
  const [retentionError, setRetentionError] = useState(false);
  const activeWorkspaceId = useRef("");
  const activeFilter = useRef<ExecutionFilter>("ALL");
  const requestSequence = useRef(0);

  const loadExecutions = async (targetWorkspaceId: string, nextCursor?: string, selectedFilter: ExecutionFilter = activeFilter.current) => {
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
      setIsLoadingMore(false);
      setError(null);
    }
    const requestId = ++requestSequence.current;
    try {
      const parameters = new URLSearchParams({ limit: "30" });
      if (nextCursor) parameters.set("cursor", nextCursor);
      if (selectedFilter !== "ALL") parameters.set("filter", selectedFilter);
      const response = await apiRequest<{ executions: ExecutionSummary[]; nextCursor: string | null }>(`/workspaces/${targetWorkspaceId}/executions?${parameters.toString()}`);
      if (activeWorkspaceId.current !== targetWorkspaceId || requestSequence.current !== requestId) return;
      setExecutions((current) => nextCursor ? [...current, ...response.executions.filter((candidate) => !current.some((existing) => existing.id === candidate.id))] : response.executions);
      setCursor(response.nextCursor);
    } catch (reason) {
      if (activeWorkspaceId.current !== targetWorkspaceId || requestSequence.current !== requestId) return;
      setError(reason instanceof Error ? reason.message : "Unable to load executions.");
    } finally {
      if (activeWorkspaceId.current === targetWorkspaceId && requestSequence.current === requestId) {
        if (nextCursor) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const workspaceResponse = await apiRequest<{ workspaces: WorkspaceSummary[] }>("/workspaces");
        if (!active) return;
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
    activeFilter.current = "ALL";
    router.replace(`/dashboard/executions?workspace=${encodeURIComponent(nextWorkspaceId)}`);
    void loadExecutions(nextWorkspaceId);
  };

  useEffect(() => {
    if (!workspaceId) return;
    let current = true;
    setRetention(null);
    setRetentionError(false);
    void apiRequest<{ retention: Retention }>(`/workspaces/${workspaceId}/execution-retention`)
      .then((response) => { if (current) setRetention(response.retention); })
      .catch(() => { if (current) setRetentionError(true); });
    return () => { current = false; };
  }, [workspaceId]);

  const changeFilter = (next: ExecutionFilter) => {
    activeFilter.current = next;
    setFilter(next);
    setExecutions([]);
    setCursor(null);
    void loadExecutions(workspaceId, undefined, next);
  };

  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  return (
    <main className="dashboard-page executions-page">
      <AppShellHeader workspaces={workspaces} workspaceId={workspaceId} onWorkspaceChange={switchWorkspace} active="executions" />
      <section className="executions-main">
        <PageHeader
          eyebrow={activeWorkspace?.name ?? "EXECUTIONS"}
          title="Execution history"
          description="Inspect the immutable workflow version, mode, status, and redacted failure detail for every run in this workspace."
          actions={<><Button variant="secondary" onClick={() => router.push("/dashboard")}><ArrowLeft size={15} /> Dashboard</Button><IconButton variant="secondary" label="Refresh execution history" onClick={() => void loadExecutions(workspaceId)} disabled={isLoading || !workspaceId}><RefreshCw className={isLoading ? "ui-spinner" : undefined} size={16} /></IconButton></>}
        />
        {workspaceId && <details className="retention-summary"><summary>Execution retention</summary>{retention ? <div><p>{retention.enabled ? "Automatic cleanup is enabled." : "Automatic cleanup is disabled."}</p><p>Successful runs: {retention.successDays} days · Failed and cancelled runs: {retention.failedDays} days.</p><p>{retention.maxCount ? `The ${retention.maxCount.toLocaleString()} completed-run limit applies across the entire system, not just this workspace. Older runs may be removed sooner if the limit is exceeded.` : "No system-wide completed-run count limit is configured."}</p><p>Queued, running, and waiting runs are not removed by retention cleanup.</p></div> : <p>{retentionError ? "Retention settings could not be loaded." : "Loading retention settings…"}</p>}</details>}
        {workspaceId && <SavedExecutionViews key={workspaceId} workspaceId={workspaceId} filter={filter} onSelect={changeFilter} />}
        {isLoading && executions.length === 0 ? <div className="executions-loading" aria-busy="true"><Skeleton /><Skeleton /><Skeleton /><Progress label="Loading execution history" /></div> : null}
        {!isLoading && error ? <Status tone="error" className="executions-error"><CircleAlert size={17} /><span>{error}</span><Button variant="ghost" onClick={() => void loadExecutions(workspaceId)}>Retry</Button></Status> : null}
        {!isLoading && !error && !workspaceId ? <EmptyState icon={<History size={24} />} title="Create a workspace first" description="Execution history is scoped to the workspace that owns the workflow." action={<Button variant="primary" onClick={() => router.push("/dashboard")}>Go to dashboard</Button>} /> : null}
        {!isLoading && !error && workspaceId ? <section className="executions-list-panel" aria-labelledby="execution-list-heading">
          <SectionHeader className="executions-list-panel__heading" eyebrow="RUNS" id="execution-list-heading" title="Recent runs" meta={`${executions.length} loaded`} />
          <Toolbar className="dashboard-execution-filters executions-filters" label="Filter execution history">
            <button type="button" className={filter === "ALL" ? "is-active" : undefined} aria-pressed={filter === "ALL"} onClick={() => changeFilter("ALL")}>All</button>
            <button type="button" className={filter === "ATTENTION" ? "is-active" : undefined} aria-pressed={filter === "ATTENTION"} onClick={() => changeFilter("ATTENTION")}>Needs attention</button>
            <button type="button" className={filter === "IN_PROGRESS" ? "is-active" : undefined} aria-pressed={filter === "IN_PROGRESS"} onClick={() => changeFilter("IN_PROGRESS")}>In progress</button>
            <button type="button" className={filter === "FAILED" ? "is-active" : undefined} aria-pressed={filter === "FAILED"} onClick={() => changeFilter("FAILED")}>Failed</button>
            <button type="button" className={filter === "SUCCEEDED" ? "is-active" : undefined} aria-pressed={filter === "SUCCEEDED"} onClick={() => changeFilter("SUCCEEDED")}>Succeeded</button>
          </Toolbar>
          {executions.length === 0 ? <EmptyState className="executions-filtered-empty" icon={<History size={21} />} title={filter === "ALL" ? "No runs yet" : "No matching runs"} description={filter === "ALL" ? "Run a test or activate a workflow to build execution history." : "Choose another filter to see the remaining execution history."} action={<Button variant="ghost" onClick={() => filter === "ALL" ? router.push("/dashboard") : changeFilter("ALL")}>{filter === "ALL" ? "Open workflows" : "Show all runs"}</Button>} /> : <div className="executions-list">{executions.map((execution) => <article className="dashboard-execution executions-list__item" key={execution.id}>
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
