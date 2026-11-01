"use client";

import { Archive, ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Status } from "../../components/ui";
import { Collapse } from "../../components/ui/disclosure";
import { apiRequest } from "../api/api-client";
import type { ApiWorkflow } from "../workflow/workflow-api";

type Props = { workspaceId: string; revision: number; onRestored: (workflow: ApiWorkflow) => void };

export function ArchivedWorkflows({ workspaceId, revision, onRestored }: Props) {
  const [open, setOpen] = useState(false);
  const [workflows, setWorkflows] = useState<ApiWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!open || !workspaceId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiRequest<{ workflows: ApiWorkflow[] }>(`/workspaces/${encodeURIComponent(workspaceId)}/workflows/archived`, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setWorkflows(response.workflows); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load archived workflows."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, workspaceId, revision, refresh]);

  const restore = async (workflow: ApiWorkflow) => {
    if (restoring) return;
    setRestoring(workflow.id);
    setError(null);
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${encodeURIComponent(workflow.id)}/restore`, { method: "POST" });
      setWorkflows((current) => current.filter((item) => item.id !== workflow.id));
      onRestored(response.workflow);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to restore this workflow.");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <section className="dashboard-archived" aria-label="Archived workflows">
      <Button variant="ghost" className="dashboard-archived__toggle" aria-expanded={open} aria-controls="archived-workflow-list" onClick={() => setOpen(!open)}>
        <Archive size={16} aria-hidden="true" /> Archived workflows <ChevronDown size={15} aria-hidden="true" />
      </Button>
      <Collapse open={open} id="archived-workflow-list">
        <div className="dashboard-archived__content">
          <p>Restored workflows stay inactive until you activate them again.</p>
          {loading ? <div className="dashboard-archived__state" role="status"><LoaderCircle className="ui-spinner" size={16} /> Loading archived workflows…</div> : null}
          {error ? <Status tone="error" className="dashboard-archived__error">{error}<Button variant="ghost" onClick={() => setRefresh((value) => value + 1)}>Retry</Button></Status> : null}
          {!loading && !error && workflows.length === 0 ? <div className="dashboard-archived__state">No archived workflows in this workspace.</div> : null}
          {!loading && workflows.length > 0 ? <ul className="dashboard-archived__list">{workflows.map((workflow) => (
            <li key={workflow.id}>
              <div><strong>{workflow.name}</strong><span>Archived {workflow.archivedAt ? new Date(workflow.archivedAt).toLocaleDateString() : ""}</span></div>
              <Button variant="secondary" aria-label={`Restore ${workflow.name}`} disabled={restoring !== null} onClick={() => void restore(workflow)}>{restoring === workflow.id ? "Restoring…" : "Restore"}</Button>
            </li>
          ))}</ul> : null}
        </div>
      </Collapse>
    </section>
  );
}
