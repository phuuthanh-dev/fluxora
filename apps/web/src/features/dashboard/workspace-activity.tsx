"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button, IconButton, SectionHeader, Status } from "../../components/ui";
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

  const segments = activity ? [
    { label: "Succeeded", count: activity.counts.SUCCEEDED, tone: "success" },
    { label: "Failed", count: activity.counts.FAILED, tone: "danger" },
    { label: "In progress", count: activity.counts.QUEUED + activity.counts.RUNNING, tone: "info" },
    { label: "Waiting approval", count: activity.counts.WAITING_APPROVAL, tone: "warning" },
    { label: "Cancelled", count: activity.counts.CANCELLED, tone: "neutral" },
  ] : [];
  const refresh = () => setRevision((value) => value + 1);
  return <section className="workspace-activity" aria-labelledby="workspace-activity-heading">
    <SectionHeader className="workspace-activity__heading" eyebrow="OVERVIEW" id="workspace-activity-heading" title="Workspace activity" description="Runs created in the last 24 hours · test and live · retained history" actions={<IconButton label="Refresh workspace activity" disabled={loading} onClick={refresh}><RefreshCw className={loading ? "ui-spinner" : undefined} size={16} /></IconButton>} />
    {loading ? <div className="workspace-activity__message" role="status">Loading workspace activity…</div> : error ? <Status tone="error">Could not load workspace activity. <Button variant="ghost" onClick={refresh}>Retry</Button></Status> : activity ? <>
      <div className="workspace-activity__metrics" aria-label="Execution counts for the last 24 hours">
        <div><span>Total runs</span><strong>{activity.total}</strong></div>
        <div><span>Succeeded</span><strong>{activity.counts.SUCCEEDED}</strong></div>
        <div><span>Failed</span><strong>{activity.counts.FAILED}</strong></div>
        <div><span>In progress</span><strong>{activity.counts.QUEUED + activity.counts.RUNNING}</strong></div>
        <div><span>Waiting approval</span><strong>{activity.counts.WAITING_APPROVAL}</strong></div>
        <div><span>Cancelled</span><strong>{activity.counts.CANCELLED}</strong></div>
      </div>
      <figure className="workspace-activity__distribution" aria-label="Run status distribution over the last 24 hours">
        <figcaption>{activity.total ? "Run outcomes" : "No runs in the last 24 hours"}<span>{activity.total ? "Counts shown above · includes test and live" : "Your first run will appear here."}</span></figcaption>
        <div className="workspace-activity__bar" aria-hidden="true">{segments.filter((segment) => segment.count > 0).map((segment) => <span key={segment.tone} data-tone={segment.tone} style={{ flex: segment.count }} />)}</div>
        {activity.total > 0 && <ul className="workspace-activity__legend">{segments.filter((segment) => segment.count > 0).map((segment) => <li key={segment.tone}><i data-tone={segment.tone} aria-hidden="true" />{segment.label} <strong>{Math.round(segment.count / activity.total * 100)}%</strong></li>)}</ul>}
      </figure>
      <div className="workspace-activity__footer"><span><Activity size={14} aria-hidden="true" /> Updated {new Date(activity.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><Link href={`/dashboard/executions?workspace=${encodeURIComponent(workspaceId)}`}>View execution history <ArrowRight size={14} aria-hidden="true" /></Link></div>
    </> : null}
  </section>;
}
