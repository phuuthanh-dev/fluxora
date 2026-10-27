"use client";

import type { WorkflowGraph } from "@workflow/contracts";
import { AlertTriangle, CheckCircle2, Clock3, Download, GitBranch, LoaderCircle, RotateCcw, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dialog, EmptyState, IconButton, Progress, Skeleton, Status } from "../../components/ui";
import { apiRequest } from "../api/api-client";

export type ExecutionError = { code: string; message: string | null; retryable: boolean };
export type ExecutionNodeDetail = {
  nodeId: string;
  nodeType: string;
  status: string;
  attempt: number;
  input: unknown;
  output: unknown;
  error: ExecutionError | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  failureHandling: { kind: "error_branch" | "execution_failed"; targetNodeIds: string[] } | null;
  skipReason: "execution_cancelled" | "waiting_for_approval" | "not_reached_after_failure" | "branch_not_selected" | null;
};

export type ApiExecution = {
  id: string;
  status: string;
  mode: "mock" | "live";
  workflowId: string;
  workflowVersion: number;
  graph: WorkflowGraph;
  error: ExecutionError | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  recoveryCount: number;
  nodeExecutions: ExecutionNodeDetail[];
};

type Diagnostic = { schemaVersion: "fluxora.execution-diagnostic.v1"; execution: { id: string } };

export function executionFailureExplanation(node: ExecutionNodeDetail) {
  if (node.status === "SKIPPED") {
    if (node.skipReason === "execution_cancelled") return "Skipped because the execution was cancelled.";
    if (node.skipReason === "waiting_for_approval") return "Not reached yet because the workflow is waiting for approval.";
    if (node.skipReason === "not_reached_after_failure") return "Not reached after an earlier unhandled failure.";
    return "Skipped because another condition or switch branch was selected.";
  }
  if (!node.error) return null;
  const retry = node.error.retryable
    ? `Transient failure; automatic attempts stopped after attempt ${node.attempt}.`
    : "The latest failure is not retryable automatically.";
  if (node.failureHandling?.kind === "error_branch") return `${retry} Routed through the error branch to ${node.failureHandling.targetNodeIds.join(", ")}.`;
  if (node.failureHandling?.kind === "execution_failed") return `${retry} No error branch was connected, so the execution stopped.`;
  return retry;
}

export function diagnosticFileName(executionId: string) {
  return `fluxora-execution-${executionId}-diagnostic.json`;
}

export function ExecutionDetailsPanel({ executionId, onClose, onSelectNode }: { executionId: string; onClose: () => void; onSelectNode: (nodeId: string) => void }) {
  const [execution, setExecution] = useState<ApiExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/executions/${executionId}?view=timeline`);
      setExecution(response.execution);
    } catch (reason) {
      setExecution(null);
      setError(reason instanceof Error ? reason.message : "Unable to load execution details.");
    } finally {
      setIsLoading(false);
    }
  }, [executionId]);

  useEffect(() => { void load(); }, [load]);

  const nodeNames = useMemo(() => new Map(execution?.graph.nodes.map((node) => [node.id, node.type]) ?? []), [execution]);

  const downloadDiagnostic = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const response = await apiRequest<{ diagnostic: Diagnostic }>(`/executions/${executionId}/diagnostic`);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(response.diagnostic, null, 2)}\n`], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = diagnosticFileName(executionId);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setDownloadError(reason instanceof Error ? reason.message : "Unable to prepare the diagnostic snapshot.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog label="Execution details" className="execution-observability" onClose={onClose} initialFocusSelector="[data-execution-close]">
      <header className="execution-observability__header">
        <div><p className="section-label">EXECUTION TIMELINE</p><h2>Run details</h2><p>Chronological state, retry decisions, and branch handling.</p></div>
        <IconButton data-execution-close label="Close execution details" onClick={onClose}><X size={16} /></IconButton>
      </header>

      {isLoading ? <div className="execution-observability__loading" aria-busy="true"><Skeleton /><Skeleton /><Skeleton /><Progress label="Loading execution timeline" /></div> : null}
      {!isLoading && error ? <Status tone="error" className="execution-observability__error"><AlertTriangle size={17} /><span><strong>Could not load this run</strong>{error}</span><Button variant="ghost" onClick={() => void load()}><RotateCcw size={14} /> Retry</Button></Status> : null}

      {!isLoading && !error && execution ? <>
        <section className="execution-observability__summary" aria-label="Execution summary">
          <div><span>Status</span><strong className={`execution-observability__status execution-observability__status--${execution.status.toLowerCase()}`}>{execution.status.replaceAll("_", " ")}</strong></div>
          <div><span>Run</span><strong>{execution.mode === "live" ? "Live" : "Test"} · v{execution.workflowVersion}</strong></div>
          <div><span>Duration</span><strong>{formatDuration(execution.durationMs)}</strong></div>
          <div><span>Started</span><strong>{formatTimestamp(execution.startedAt ?? execution.createdAt)}</strong></div>
        </section>
        {execution.error ? <Status tone="error" className="execution-observability__run-error"><AlertTriangle size={17} /><span><strong>{execution.error.code}</strong>{execution.error.message ?? "Execution failed."} {execution.error.retryable ? "A manual retry may succeed." : "Fix the workflow or credential before retrying."}</span></Status> : null}
        {execution.nodeExecutions.length === 0 ? <EmptyState icon={<Clock3 size={22} />} title="No node activity yet" description="The run is queued or has not persisted its first node state." /> : <ol className="execution-timeline" aria-label="Node execution timeline">
          {execution.nodeExecutions.map((node) => {
            const explanation = executionFailureExplanation(node);
            return <li key={node.nodeId} className={`execution-timeline__item execution-timeline__item--${node.status.toLowerCase()}`}>
              <span className="execution-timeline__marker" aria-hidden="true">{node.status === "FAILED" ? <AlertTriangle size={14} /> : node.status === "SKIPPED" ? <SkipForward size={14} /> : node.status === "RUNNING" || node.status === "WAITING" ? <Clock3 size={14} /> : <CheckCircle2 size={14} />}</span>
              <div className="execution-timeline__body">
                <div className="execution-timeline__title"><strong>{node.nodeId}</strong><span>{node.status}</span></div>
                <p>{nodeNames.get(node.nodeId) ?? node.nodeType} · attempt {node.attempt} · {formatDuration(node.durationMs)}</p>
                {node.error ? <code>{node.error.code}: {node.error.message}</code> : null}
                {explanation ? <div className="execution-timeline__explanation">{node.failureHandling?.kind === "error_branch" ? <GitBranch size={14} /> : node.status === "SKIPPED" ? <SkipForward size={14} /> : <RotateCcw size={14} />}<span>{explanation}</span></div> : null}
                <Button variant="ghost" onClick={() => onSelectNode(node.nodeId)}>Inspect node</Button>
              </div>
              <time dateTime={node.startedAt ?? node.completedAt ?? execution.createdAt}>{formatTimestamp(node.startedAt ?? node.completedAt ?? execution.createdAt)}</time>
            </li>;
          })}
        </ol>}
        <footer className="execution-observability__footer">
          <div><strong>Safe diagnostic snapshot</strong><span>Metadata only. Credentials, headers, payloads, and provider URLs are excluded.</span></div>
          <Button variant="secondary" disabled={isDownloading} onClick={() => void downloadDiagnostic()}>{isDownloading ? <LoaderCircle className="ui-spinner" size={15} /> : <Download size={15} />}{isDownloading ? "Preparing…" : "Download JSON"}</Button>
        </footer>
        {downloadError ? <Status tone="error" className="execution-observability__download-error">{downloadError} <Button variant="ghost" onClick={() => void downloadDiagnostic()}>Retry</Button></Status> : null}
      </> : null}
    </Dialog>
  );
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return "In progress";
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}
