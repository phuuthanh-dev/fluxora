"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/api-client";
import type { NodeResource } from "./node-catalog";
import { Button, Select } from "../../components/ui";

type GitHubRepositoryResource = {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string | null;
};

const resourceLabels: Record<NodeResource, string> = {
  "github-repository": "repository",
};

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
  const [resources, setResources] = useState<GitHubRepositoryResource[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const [manual, setManual] = useState(value.includes("{{"));

  useEffect(() => {
    setResources([]);
    setQuery("");
    setNextPage(null);
    setPage(1);
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
    const endpoint = resource === "github-repository"
      ? `/workspaces/${workspaceId}/credentials/${credentialId}/github/repositories`
      : null;
    if (!endpoint) return;
    void apiRequest<{ repositories: GitHubRepositoryResource[]; nextPage?: number | null }>(`${endpoint}?page=${page}`)
      .then((response) => { if (isCurrent) { setResources((current) => page === 1 ? response.repositories : [...current, ...response.repositories.filter((item) => !current.some((existing) => existing.id === item.id))]); setNextPage(response.nextPage ?? null); } })
      .catch((reason) => { if (isCurrent) setError(reason instanceof Error ? reason.message : `Unable to load ${resourceLabels[resource]}s.`); })
      .finally(() => { if (isCurrent) setLoading(false); });
    return () => { isCurrent = false; };
  }, [credentialId, resource, workspaceId, page, retry]);

  const filteredResources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? resources.filter((item) => item.fullName.toLowerCase().includes(normalized)) : resources;
  }, [query, resources]);
  const selectedNotShown = Boolean(value) && !filteredResources.some((item) => item.fullName === value);

  return (
    <div role="group" aria-label={label} className="config-field resource-picker">
      <span className="ui-field__label">{label}</span>
      <Button type="button" variant="ghost" onClick={() => setManual((current) => !current)}>{manual ? "Choose from list" : allowExpression ? "Enter value or expression" : "Enter repository manually"}</Button>
      {manual ? <><input value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} value`} placeholder={allowExpression ? "owner/repository or expression" : "owner/repository"} /><small>{allowExpression ? "Use a repository name or a value from a previous step." : "Enter the exact owner and repository name."}</small></> : !credentialId ? <small>Select a compatible credential first.</small> : <>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label={`${label} search`} />
        <Select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={(loading && page === 1) || (Boolean(error) && !resources.length)}>
          <option value="">{loading ? "Loading repositories…" : `Select ${resourceLabels[resource]}`}</option>
          {selectedNotShown && <option value={value}>{value} · current value</option>}
          {filteredResources.map((item) => <option key={item.id} value={item.fullName}>{item.fullName}{item.private ? " · private" : ""}</option>)}
        </Select>
        {error && <><small role="alert">{error}</small><Button type="button" variant="ghost" onClick={() => setRetry((current) => current + 1)}>Retry</Button></>}
        {!loading && !error && !resources.length && <small>No repositories found for this credential.</small>}
        {!loading && !error && resources.length > 0 && <small>{filteredResources.length} of {resources.length} loaded repositories match{nextPage ? "; more are available" : ""}.</small>}
        {nextPage && !error && <Button type="button" variant="ghost" disabled={loading} onClick={() => setPage(nextPage)}>{loading ? "Loading…" : "Load more repositories"}</Button>}
      </>}
    </div>
  );
}
