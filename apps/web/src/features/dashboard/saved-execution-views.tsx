"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui";
import { apiRequest } from "../api/api-client";

export type SavedViewFilter = "ALL" | "ATTENTION" | "IN_PROGRESS" | "FAILED" | "SUCCEEDED";
type SavedView = { id: string; name: string; filter: SavedViewFilter };
const filterLabels: Record<SavedViewFilter, string> = { ALL: "All", ATTENTION: "Needs attention", IN_PROGRESS: "In progress", FAILED: "Failed", SUCCEEDED: "Succeeded" };

export function SavedExecutionViews({ workspaceId, filter, onSelect }: { workspaceId: string; filter: SavedViewFilter; onSelect: (filter: SavedViewFilter) => void }) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setViews([]);
    setName("");
    setConfirmId(null);
    setError(null);
    setLoading(true);
    void apiRequest<{ views: SavedView[] }>(`/workspaces/${workspaceId}/execution-views`)
      .then((response) => { if (current) setViews(response.views); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : "Unable to load saved views."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [workspaceId]);

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await apiRequest<{ view: SavedView }>(`/workspaces/${workspaceId}/execution-views`, { method: "POST", body: JSON.stringify({ name: name.trim(), filter }) });
      setViews((current) => [...current, response.view]);
      setName("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save view."); }
    finally { setPending(false); }
  };

  const remove = async (id: string) => {
    setPending(true);
    setError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/execution-views/${encodeURIComponent(id)}`, { method: "DELETE" });
      setViews((current) => current.filter((view) => view.id !== id));
      setConfirmId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete view."); }
    finally { setPending(false); }
  };

  return <details className="saved-execution-views"><summary>Saved views</summary>
    <p>Current filter: {filterLabels[filter]}. Saved views are private to you in this workspace.</p>
    {loading ? <p>Loading saved views…</p> : views.length === 0 ? <p>No saved views yet.</p> : <ul>{views.map((view) => <li key={view.id}><Button variant="ghost" disabled={pending} onClick={() => onSelect(view.filter)}>{view.name}</Button>{confirmId === view.id ? <><Button variant="ghost" disabled={pending} onClick={() => setConfirmId(null)}>Cancel</Button><Button variant="danger" disabled={pending} onClick={() => void remove(view.id)}>Confirm delete {view.name}</Button></> : <Button variant="ghost" disabled={pending} onClick={() => setConfirmId(view.id)} aria-label={`Delete ${view.name}`}>Delete</Button>}</li>)}</ul>}
    <form onSubmit={(event) => { event.preventDefault(); void create(); }}><label htmlFor="saved-execution-view-name">View name</label><input id="saved-execution-view-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Failures" /><Button type="submit" variant="secondary" disabled={pending || loading || !name.trim()}>Save current filter</Button></form>
    {error && <p role="alert">{error}</p>}
  </details>;
}
