"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/api-client";
import type { NodeResource } from "./node-catalog";
import { Button, Select } from "../../components/ui";

type ResourceOption = { id: string; value: string; label: string };

const resourceLabels: Record<NodeResource, string> = {
  "github-repository": "repository",
  "google-file": "file",
  "google-spreadsheet": "spreadsheet",
};
const resourcePlurals: Record<NodeResource, string> = { "github-repository": "repositories", "google-file": "files", "google-spreadsheet": "spreadsheets" };

export function ResourcePicker({ workspaceId, resource, credentialId, label, value, placeholder = "Search resources", allowExpression = false, onChange }: {
  workspaceId: string;
  resource: NodeResource;
  credentialId: string;
  label: string;
  value: string;
  placeholder?: string;
  allowExpression?: boolean;
  onChange: (value: string) => void;
}) {
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<string>("");
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [manual, setManual] = useState(value.includes("{{"));

  useEffect(() => {
    setResources([]);
    setQuery("");
    setNextPage(null);
    setPage("");
  }, [credentialId, resource, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !credentialId) {
      setResources([]);
      setError(null);
      setLoading(false);
      return;
    }
    let isCurrent = true;
    setLoading(true);
    setError(null);
    const base = `/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}`;
    const params = new URLSearchParams();
    if (resource === "github-repository") params.set("page", page || "1");
    else { params.set("kind", resource === "google-spreadsheet" ? "spreadsheet" : "file"); if (page) params.set("pageToken", page); }
    const endpoint = resource === "github-repository" ? `${base}/github/repositories` : `${base}/google/files`;
    type Response = { repositories?: Array<{ id: number; fullName: string; private: boolean }>; nextPage?: number | null; files?: Array<{ id: string; name: string }>; nextPageToken?: string | null };
    void apiRequest<Response>(`${endpoint}?${params}`)
      .then((response) => { if (isCurrent) {
        const options: ResourceOption[] = resource === "github-repository" ? (response.repositories ?? []).map((item) => ({ id: String(item.id), value: item.fullName, label: `${item.fullName}${item.private ? " · private" : ""}` })) : (response.files ?? []).map((item) => ({ id: item.id, value: item.id, label: item.name }));
        setResources((current) => !page ? options : [...current, ...options.filter((item) => !current.some((existing) => existing.id === item.id))]);
        setNextPage(resource === "github-repository" ? response.nextPage ? String(response.nextPage) : null : response.nextPageToken ?? null);
      } })
      .catch((reason) => { if (isCurrent) setError(reason instanceof Error ? reason.message : `Unable to load ${resourcePlurals[resource]}.`); })
      .finally(() => { if (isCurrent) setLoading(false); });
    return () => { isCurrent = false; };
  }, [credentialId, resource, workspaceId, page, retry]);

  const filteredResources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? resources.filter((item) => item.label.toLowerCase().includes(normalized) || item.value.toLowerCase().includes(normalized)) : resources;
  }, [query, resources]);
  const selectedNotShown = Boolean(value) && !filteredResources.some((item) => item.value === value);

  return (
    <div role="group" aria-label={label} className="config-field resource-picker">
      <span className="ui-field__label">{label}</span>
      <Button type="button" variant="ghost" onClick={() => setManual((current) => !current)}>{manual ? "Choose from list" : allowExpression ? "Enter value or expression" : `Enter ${resourceLabels[resource]} manually`}</Button>
      {manual ? <><input value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} value`} placeholder={resource === "github-repository" ? (allowExpression ? "owner/repository or expression" : "owner/repository") : "File ID or expression"} /><small>{allowExpression ? "Use a value from the provider or a previous step." : "Enter the exact provider value."}</small></> : !credentialId ? <small>Select a compatible credential first.</small> : <>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label={`${label} search`} />
        <Select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={(loading && !page) || (Boolean(error) && !resources.length)}>
          <option value="">{loading ? "Loading…" : `Select ${resourceLabels[resource]}`}</option>
          {selectedNotShown && <option value={value}>{value} · current value</option>}
          {filteredResources.map((item) => <option key={item.id} value={item.value}>{item.label}</option>)}
        </Select>
        {error && <><small role="alert">{error}</small><Button type="button" variant="ghost" onClick={() => setRetry((current) => current + 1)}>Retry</Button></>}
        {!loading && !error && !resources.length && <small>No {resourcePlurals[resource]} found for this connection.</small>}
        {!loading && !error && resources.length > 0 && <small>{filteredResources.length} of {resources.length} loaded {resourcePlurals[resource]} match{nextPage ? "; more are available" : ""}.</small>}
        {nextPage && !error && <Button type="button" variant="ghost" disabled={loading} onClick={() => setPage(nextPage)}>{loading ? "Loading…" : `Load more ${resourcePlurals[resource]}`}</Button>}
      </>}
    </div>
  );
}
