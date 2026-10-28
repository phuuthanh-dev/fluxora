"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/api-client";
import type { NodeResource } from "./node-catalog";
import { Field, Select } from "../../components/ui";

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

export function ResourcePicker({ workspaceId, resource, credentialId, label, value, placeholder = "Search resources", onChange }: {
  workspaceId: string;
  resource: NodeResource;
  credentialId: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [resources, setResources] = useState<GitHubRepositoryResource[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !credentialId) {
      setResources([]);
      setError(null);
      return;
    }
    let isCurrent = true;
    setLoading(true);
    setError(null);
    const endpoint = resource === "github-repository"
      ? `/workspaces/${workspaceId}/credentials/${credentialId}/github/repositories`
      : null;
    if (!endpoint) return;
    void apiRequest<{ repositories: GitHubRepositoryResource[] }>(endpoint)
      .then((response) => { if (isCurrent) setResources(response.repositories); })
      .catch((reason) => { if (isCurrent) setError(reason instanceof Error ? reason.message : `Unable to load ${resourceLabels[resource]}s.`); })
      .finally(() => { if (isCurrent) setLoading(false); });
    return () => { isCurrent = false; };
  }, [credentialId, resource, workspaceId]);

  const filteredResources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? resources.filter((item) => item.fullName.toLowerCase().includes(normalized)) : resources;
  }, [query, resources]);
  const selectedIsUnavailable = Boolean(value) && !resources.some((item) => item.fullName === value);

  return (
    <Field label={label} className="config-field resource-picker">
      {!credentialId ? <small>Select a compatible credential first.</small> : <>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label={`${label} search`} />
        <Select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={loading || Boolean(error)}>
          <option value="">{loading ? "Loading repositories…" : `Select ${resourceLabels[resource]}`}</option>
          {selectedIsUnavailable && <option value={value}>Current value unavailable</option>}
          {filteredResources.map((item) => <option key={item.id} value={item.fullName}>{item.fullName}{item.private ? " · private" : ""}</option>)}
        </Select>
        {error && <small role="alert">{error}</small>}
        {!loading && !error && !resources.length && <small>No repositories found for this credential.</small>}
        {!loading && !error && resources.length > 0 && <small>{filteredResources.length} of {resources.length} repositories available.</small>}
      </>}
    </Field>
  );
}
