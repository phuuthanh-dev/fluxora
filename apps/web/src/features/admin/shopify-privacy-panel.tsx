"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, DialogHeader, Progress, Status } from "../../components/ui";
import { apiRequest } from "../api/api-client";

type RequestSummary = { id: string; shop: string; kind: string; createdAt: string };
type RequestDetail = RequestSummary & { payload: string; workflows: { id: string; name: string; isActive: boolean }[]; inventoryIncomplete: boolean };
const endpoint = "/admin/shopify-data-requests";
const label: Record<string, string> = { "customer-data": "Data request", "customer-redact": "Customer deletion", "shop-redact": "Store deletion" };

export function ShopifyPrivacyPanel() {
  const [requests, setRequests] = useState<RequestSummary[] | null>(null);
  const [selected, setSelected] = useState<RequestDetail | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void apiRequest<{ requests: RequestSummary[] }>(endpoint).then((result) => { if (active) setRequests(result.requests); }).catch(() => { if (active) setError("Could not load Shopify data requests."); });
    return () => { active = false; };
  }, [refresh]);
  async function review(id: string) {
    setBusy(true); setError(""); setReviewed(false);
    try { setSelected(await apiRequest<RequestDetail>(`${endpoint}/${encodeURIComponent(id)}`)); }
    catch { setError("Could not open this request."); }
    finally { setBusy(false); }
  }
  async function resolve() {
    if (!selected || !reviewed || busy) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`${endpoint}/${encodeURIComponent(selected.id)}/resolve`, { method: "POST", body: JSON.stringify({ reviewed: true }) });
      setSelected(null); setRefresh((value) => value + 1);
    } catch { setError("Could not update this request."); }
    finally { setBusy(false); }
  }
  return <section className="admin-card admin-privacy">
    <div className="admin-card__heading"><h2>Shopify data requests</h2><Button variant="ghost" onClick={() => setRefresh((value) => value + 1)}>Refresh requests</Button></div>
    <p>Review and complete requests within 30 days.</p>
    {error && <Status tone="error">{error}</Status>}
    {!requests ? <Progress label="Loading Shopify data requests" /> : requests.length === 0 ? <p>No pending Shopify requests.</p> : <ul className="admin-privacy__records">{requests.map((item) => <li key={item.id}>
      <div className="admin-card__heading"><div><strong>{label[item.kind] ?? item.kind}</strong><p>{item.shop} · {new Date(item.createdAt).toLocaleDateString()}</p></div><Button variant="secondary" disabled={busy} onClick={() => void review(item.id)}>Review request</Button></div>
    </li>)}</ul>}
    {selected && <div className="admin-dialog-backdrop"><Dialog label="Review Shopify request" className="admin-dialog admin-privacy-dialog" onClose={() => { if (!busy) setSelected(null); }}>
      <DialogHeader eyebrow="SHOPIFY / DATA REQUEST" title={label[selected.kind] ?? selected.kind} onClose={() => { if (!busy) setSelected(null); }} />
      {error && <Status tone="error">{error}</Status>}
      <p>{selected.shop} · {new Date(selected.createdAt).toLocaleString()}</p>
      <Status tone="warning">Marking this handled does not erase data or notify the store. Complete the request first.</Status>
      {selected.inventoryIncomplete && <Status tone="warning">The workflow inventory is incomplete. Review other stored copies separately.</Status>}
      {selected.workflows.length > 0 && <div><strong>Workflows to review</strong><ul>{selected.workflows.map((workflow) => <li key={workflow.id}>{workflow.name}{workflow.isActive ? " · Active" : ""}</li>)}</ul></div>}
      <pre className="admin-shopify-request">{selected.payload}</pre>
      <label className="admin-privacy__check"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span>I have completed this request.</span></label>
      <div className="admin-privacy__actions"><Button variant="ghost" onClick={() => setSelected(null)} disabled={busy}>Cancel</Button><Button variant="primary" disabled={!reviewed || busy} onClick={() => void resolve()}>Mark handled</Button></div>
    </Dialog></div>}
  </section>;
}
