"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button, IconButton, Status } from "../../components/ui";
import { apiRequest } from "../api/api-client";

type ActivitySummary = {
  asOf: string;
  total: number;
  counts: { QUEUED: number; RUNNING: number; WAITING_APPROVAL: number; SUCCEEDED: number; FAILED: number; CANCELLED: number };
};

export function WorkspaceActivity({ workspaceId }: { workspaceId: string }) {
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setActivity(null);
    void apiRequest<{ activity: ActivitySummary }>(`/workspaces/${encodeURIComponent(workspaceId)}/execution-activity`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setActivity(result.activity); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, revision]);

  const refresh = () => setRevision((value) => value + 1);
  return <section className="workspace-activity" aria-labelledby="workspace-activity-heading">
    <div className="workspace-activity__heading">
      <div><p className="section-label">OVERVIEW</p><h2 id="workspace-activity-heading">Workspace activity</h2><p>Runs created in the last 24 hours · test and live · retained history</p></div>
      <IconButton label="Refresh workspace activity" disabled={loading} onClick={refresh}><RefreshCw className={loading ? "ui-spinner" : undefined} size={16} /></IconButton>
    </div>
    {loading ? <div className="workspace-activity__message" role="status">Loading workspace activity…</div> : error ? <Status tone="error">Could not load workspace activity. <Button variant="ghost" onClick={refresh}>Retry</Button></Status> : activity ? <>
      <div className="workspace-activity__metrics" aria-label="Execution counts for the last 24 hours">
        <div><span>Total runs</span><strong>{activity.total}</strong></div>
        <div><span>Succeeded</span><strong>{activity.counts.SUCCEEDED}</strong></div>
        <div><span>Failed</span><strong>{activity.counts.FAILED}</strong></div>
        <div><span>In progress</span><strong>{activity.counts.QUEUED + activity.counts.RUNNING}</strong></div>
        <div><span>Waiting approval</span><strong>{activity.counts.WAITING_APPROVAL}</strong></div>
        <div><span>Cancelled</span><strong>{activity.counts.CANCELLED}</strong></div>
      </div>
      <div className="workspace-activity__footer"><span><Activity size={14} aria-hidden="true" /> Updated {new Date(activity.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><Link href={`/dashboard/executions?workspace=${encodeURIComponent(workspaceId)}`}>View execution history <ArrowRight size={14} aria-hidden="true" /></Link></div>
    </> : null}
  </section>;
}
