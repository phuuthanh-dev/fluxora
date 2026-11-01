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
  "google-calendar": "calendar",
  "google-calendar-event": "event",
  "gmail-label": "label",
  "gemini-model": "model",
  "openai-model": "model",
  "google-chat-space": "space",
  "mongodb-database": "database",
  "mongodb-collection": "collection",
  "postgres-schema": "schema",
  "postgres-table": "table",
  "trello-board": "board",
  "trello-list": "list",
  "sentry-organization": "organization",
  "sentry-project": "project",
};
const resourcePlurals: Record<NodeResource, string> = { "github-repository": "repositories", "google-file": "files", "google-spreadsheet": "spreadsheets", "google-calendar": "calendars", "google-calendar-event": "events", "gmail-label": "labels", "gemini-model": "models", "openai-model": "models", "google-chat-space": "spaces", "mongodb-database": "databases", "mongodb-collection": "collections", "postgres-schema": "schemas", "postgres-table": "tables", "trello-board": "boards", "trello-list": "lists", "sentry-organization": "organizations", "sentry-project": "projects" };

export function ResourcePicker({ workspaceId, resource, credentialId, dependencyValue, label, value, placeholder = "Search resources", allowExpression = false, onChange }: {
  workspaceId: string;
  resource: NodeResource;
  credentialId: string;
  dependencyValue?: string;
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
  const [hasMoreModels, setHasMoreModels] = useState(false);
  const [repositoryOwners, setRepositoryOwners] = useState<string[]>([]);
  const [repositoryOwner, setRepositoryOwner] = useState("");
  const [retry, setRetry] = useState(0);
  const [manual, setManual] = useState(value.includes("{{"));

  useEffect(() => {
    setResources([]);
    setQuery("");
    setNextPage(null);
    setHasMoreModels(false);
    setPage("");
    setRepositoryOwners([]);
    setRepositoryOwner("");
  }, [credentialId, resource, workspaceId, dependencyValue]);

  useEffect(() => {
    if (!workspaceId || !credentialId || (["mongodb-collection", "postgres-table", "google-calendar-event", "trello-list", "sentry-project"].includes(resource) && (!dependencyValue || dependencyValue.includes("{{")))) {
      setResources([]);
      setRepositoryOwners([]);
      setError(null);
      setLoading(false);
      return;
    }
    let isCurrent = true;
    setLoading(true);
    setError(null);
    const base = `/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}`;
    const params = new URLSearchParams();
    if (resource === "github-repository") {
      params.set("page", page || "1");
      if (repositoryOwner) params.set("owner", repositoryOwner);
    }
    else if (resource === "mongodb-collection") params.set("database", dependencyValue ?? "");
    else if (resource === "postgres-table") params.set("schema", dependencyValue ?? "");
    else if (resource === "trello-list") params.set("board", dependencyValue ?? "");
    else if (resource === "sentry-project") params.set("organization", dependencyValue ?? "");
    else if (resource === "google-calendar-event") params.set("calendarId", dependencyValue ?? "");
    else if (resource === "google-file" || resource === "google-spreadsheet") { params.set("kind", resource === "google-spreadsheet" ? "spreadsheet" : "file"); if (page) params.set("pageToken", page); }
    else if (resource === "google-calendar" && page) params.set("pageToken", page);
    const endpoint = resource === "sentry-organization" ? `${base}/sentry/organizations` : resource === "sentry-project" ? `${base}/sentry/projects` : resource === "trello-board" ? `${base}/trello/boards` : resource === "trello-list" ? `${base}/trello/lists` : resource === "github-repository" ? `${base}/github/repositories` : resource === "gemini-model" ? `${base}/gemini/models` : resource === "openai-model" ? `${base}/openai/models` : resource === "google-chat-space" ? `${base}/google-chat/spaces` : resource === "gmail-label" ? `${base}/gmail/labels` : resource === "google-calendar" ? `${base}/google-calendar/calendars` : resource === "google-calendar-event" ? `${base}/google-calendar/events` : resource === "mongodb-database" ? `${base}/mongodb/databases` : resource === "mongodb-collection" ? `${base}/mongodb/collections` : resource === "postgres-schema" ? `${base}/postgres/schemas` : resource === "postgres-table" ? `${base}/postgres/tables` : `${base}/google/files`;
    type Response = { organizations?: Array<{ id: string; name: string }>; projects?: Array<{ id: string; name: string }>; boards?: Array<{ id: string; name: string }>; lists?: Array<{ id: string; name: string }>; repositories?: Array<{ id: number; fullName: string; private: boolean }>; repositoryOwners?: string[]; nextPage?: number | null; files?: Array<{ id: string; name: string }>; calendars?: Array<{ id: string; name: string }>; events?: Array<{ id: string; name: string }>; labels?: Array<{ id: string; name: string }>; spaces?: Array<{ id: string; name: string }>; databases?: Array<{ id: string; name: string }>; collections?: Array<{ id: string; name: string }>; schemas?: Array<{ id: string; name: string }>; tables?: Array<{ id: string; name: string }>; nextPageToken?: string | null; models?: Array<{ id: string; label: string }>; hasMore?: boolean };
    void apiRequest<Response>(`${endpoint}?${params}`)
      .then((response) => { if (isCurrent) {
        const options: ResourceOption[] = resource === "github-repository" ? (response.repositories ?? []).map((item) => ({ id: String(item.id), value: item.fullName, label: `${item.fullName}${item.private ? " · private" : ""}` })) : resource === "gemini-model" || resource === "openai-model" ? (response.models ?? []).map((item) => ({ id: item.id, value: item.id, label: item.label === item.id ? item.id : `${item.label} · ${item.id}` })) : (resource === "sentry-organization" ? response.organizations ?? [] : resource === "sentry-project" ? response.projects ?? [] : resource === "trello-board" ? response.boards ?? [] : resource === "trello-list" ? response.lists ?? [] : resource === "google-chat-space" ? response.spaces ?? [] : resource === "gmail-label" ? response.labels ?? [] : resource === "google-calendar" ? response.calendars ?? [] : resource === "google-calendar-event" ? response.events ?? [] : resource === "mongodb-database" ? response.databases ?? [] : resource === "mongodb-collection" ? response.collections ?? [] : resource === "postgres-schema" ? response.schemas ?? [] : resource === "postgres-table" ? response.tables ?? [] : response.files ?? []).map((item) => ({ id: item.id, value: item.id, label: item.name }));
        setResources((current) => !page ? options : [...current, ...options.filter((item) => !current.some((existing) => existing.id === item.id))]);
        if (resource === "github-repository") setRepositoryOwners((current) => [...new Set([...current, ...(response.repositoryOwners ?? [])])].sort((left, right) => left.localeCompare(right)));
        setHasMoreModels((resource === "gemini-model" || resource === "openai-model" || resource === "google-chat-space" || resource === "gmail-label" || resource === "google-calendar-event" || resource === "mongodb-database" || resource === "mongodb-collection" || resource === "postgres-schema" || resource === "postgres-table" || resource === "trello-board" || resource === "trello-list" || resource === "sentry-organization" || resource === "sentry-project") && response.hasMore === true);
        setNextPage(resource === "github-repository" ? response.nextPage ? String(response.nextPage) : null : response.nextPageToken ?? null);
      } })
      .catch((reason) => { if (isCurrent) setError(reason instanceof Error ? reason.message : `Unable to load ${resourcePlurals[resource]}.`); })
      .finally(() => { if (isCurrent) setLoading(false); });
    return () => { isCurrent = false; };
  }, [credentialId, resource, workspaceId, page, repositoryOwner, retry, dependencyValue]);

  const filteredResources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? resources.filter((item) => item.label.toLowerCase().includes(normalized) || item.value.toLowerCase().includes(normalized)) : resources;
  }, [query, resources]);
  const selectedNotShown = Boolean(value) && !filteredResources.some((item) => item.value === value);

  return (
    <div role="group" aria-label={label} className="config-field resource-picker">
      <span className="ui-field__label">{label}</span>
      {manual ? <><input value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} value`} placeholder={resource === "github-repository" ? (allowExpression ? "owner/repository or expression" : "owner/repository") : resource === "gemini-model" || resource === "openai-model" ? "Model ID or expression" : resource === "google-chat-space" ? "spaces/… or expression" : resource === "google-calendar" ? "Calendar ID or expression" : resource === "google-calendar-event" ? "Event ID or expression" : resource === "gmail-label" ? (allowExpression ? "Label ID or expression" : "Label ID") : ["sentry-organization", "sentry-project"].includes(resource) ? `${resourceLabels[resource]} slug or expression` : ["trello-board", "trello-list"].includes(resource) ? `${resourceLabels[resource]} ID or expression` : ["mongodb-collection", "mongodb-database", "postgres-schema", "postgres-table"].includes(resource) ? `${resourceLabels[resource]} name or expression` : "File ID or expression"} /><small>{allowExpression ? "Use a value from the provider or a previous step." : "Enter the exact provider value."}</small></> : !credentialId ? <small>Select a compatible credential first.</small> : ["mongodb-collection", "postgres-table", "google-calendar-event", "trello-list", "sentry-project"].includes(resource) && (!dependencyValue || dependencyValue.includes("{{")) ? <small>Choose the parent resource first, or enter a value manually.</small> : <>
        {resource === "github-repository" && <label className="resource-picker__owner"><span className="ui-field__label">Repository owner</span><Select aria-label={`${label} owner`} value={repositoryOwner} onChange={(event) => { setRepositoryOwner(event.target.value); setResources([]); setQuery(""); setPage(""); setNextPage(null); }}><option value="">All visible owners</option>{repositoryOwners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</Select><small>Classic tokens may access multiple personal or organization owners. This filter does not change GitHub permissions.</small></label>}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label={`${label} search`} />
        <Select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={(loading && !page) || (Boolean(error) && !resources.length)}>
          <option value="">{loading ? "Loading…" : `Select ${resourceLabels[resource]}`}</option>
          {selectedNotShown && <option value={value}>{value} · current value</option>}
          {filteredResources.map((item) => <option key={item.id} value={item.value}>{item.label}</option>)}
        </Select>
        {error && <><small role="alert">{error}</small><Button type="button" variant="ghost" onClick={() => setRetry((current) => current + 1)}>Retry</Button></>}
        {!loading && !error && !resources.length && <small>No {resourcePlurals[resource]} found for this connection.</small>}
        {!loading && !error && resources.length > 0 && <small>{filteredResources.length} of {resources.length} loaded {resourcePlurals[resource]} match{nextPage ? "; more are available" : ""}.</small>}
        {!loading && !error && hasMoreModels && <small>Showing up to {resource === "google-calendar-event" ? "50 upcoming" : "100"} {resourcePlurals[resource]}. Enter another value manually if needed.</small>}
        {resource === "openai-model" && <small>Choose a model that supports text generation with the Responses API.</small>}
        {nextPage && !error && <Button type="button" variant="ghost" disabled={loading} onClick={() => setPage(nextPage)}>{loading ? "Loading…" : `Load more ${resourcePlurals[resource]}`}</Button>}
      </>}
      <Button className="resource-picker__mode" type="button" variant="ghost" onClick={() => setManual((current) => !current)}>{manual ? "Choose from list" : allowExpression ? "Enter value or expression" : `Enter ${resourceLabels[resource]} manually`}</Button>
    </div>
  );
}
