"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "../api/api-client";
import type { NodeResource } from "./node-catalog";
import { Button, Select } from "../../components/ui";

type ResourceOption = { id: string; value: string; label: string; inputTokenLimit?: number; outputTokenLimit?: number; thinking?: boolean };

const resourceLabels: Record<NodeResource, string> = {
  "airtable-base": "base",
  "airtable-table": "table",
  "airtable-record": "record",
  "jira-issue": "issue",
  "gitlab-pipeline": "pipeline",
  "gitlab-merge-request": "merge request",
  "github-label": "label",
  "sentry-issue": "issue",
  "vercel-deployment": "deployment",
  "jira-project": "project",
  "jira-issue-type": "issue type",
  "steam-game": "game",
  "gitlab-project": "project",
  "gitlab-issue": "issue",
  "github-repository": "repository",
  "github-issue": "issue",
  "github-pull-request": "pull request",
  "google-file": "file",
  "google-drive-item": "file",
  "google-folder": "folder",
  "google-spreadsheet": "spreadsheet",
  "google-sheet-tab": "sheet tab",
  "google-sheet-header": "column",
  "google-calendar": "calendar",
  "google-calendar-event": "event",
  "gmail-label": "label",
  "gmail-draft": "draft",
  "gemini-model": "model",
  "openai-model": "model",
  "google-chat-space": "space",
  "slack-channel": "channel",
  "mongodb-database": "database",
  "mongodb-collection": "collection",
  "postgres-schema": "schema",
  "postgres-table": "table",
  "trello-board": "board",
  "trello-list": "list",
  "trello-card": "card",
  "notion-page": "page",
  "notion-property": "property",
  "notion-data-source": "data source",
  "notion-source-property": "property",
  "notion-source-option": "value",
  "sentry-organization": "organization",
  "sentry-project": "project",
  "sentry-installation": "installation",
  "vercel-team": "team",
  "vercel-project": "project",
  "supabase-table": "table",
};
const resourcePlurals: Record<NodeResource, string> = { "airtable-base": "bases", "airtable-table": "tables", "airtable-record": "records", "jira-issue": "issues", "gitlab-pipeline": "pipelines", "gitlab-merge-request": "merge requests", "github-label": "labels", "sentry-issue": "issues", "vercel-deployment": "deployments", "jira-project": "projects", "jira-issue-type": "issue types", "gitlab-project": "projects", "gitlab-issue": "issues", "steam-game": "games", "github-issue": "issues", "github-pull-request": "pull requests", "github-repository": "repositories", "google-file": "files", "google-drive-item": "files", "google-folder": "folders", "google-spreadsheet": "spreadsheets", "google-sheet-tab": "sheet tabs", "google-sheet-header": "columns", "google-calendar": "calendars", "google-calendar-event": "events", "gmail-label": "labels", "gmail-draft": "drafts", "gemini-model": "models", "openai-model": "models", "google-chat-space": "spaces", "slack-channel": "channels", "mongodb-database": "databases", "mongodb-collection": "collections", "postgres-schema": "schemas", "postgres-table": "tables", "trello-board": "boards", "trello-list": "lists", "trello-card": "cards", "notion-page": "pages", "notion-property": "properties", "notion-data-source": "data sources", "notion-source-property": "properties", "notion-source-option": "values", "sentry-organization": "organizations", "sentry-project": "projects", "sentry-installation": "installations", "vercel-team": "teams", "vercel-project": "projects", "supabase-table": "tables" };

export function ResourcePicker({ workspaceId, resource, credentialId, dependencyValue, secondaryDependencyValue, resourceVariant, label, value, multiple = false, placeholder = "Search resources", allowExpression = false, onChange }: {
  workspaceId: string;
  resource: NodeResource;
  credentialId: string;
  dependencyValue?: string;
  secondaryDependencyValue?: string;
  resourceVariant?: string;
  label: string;
  value: string;
  multiple?: boolean;
  placeholder?: string;
  allowExpression?: boolean;
  onChange: (value: string) => void;
}) {
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [page, setPage] = useState<string>("");
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [hasMoreModels, setHasMoreModels] = useState(false);
  const [repositoryOwners, setRepositoryOwners] = useState<string[]>([]);
  const [repositoryOwner, setRepositoryOwner] = useState("");
  const [retry, setRetry] = useState(0);
  const [manual, setManual] = useState(value.includes("{{"));
  const itemResource = ["jira-issue", "gitlab-pipeline", "gitlab-merge-request", "github-label", "sentry-issue", "vercel-deployment"].includes(resource);
  const serverSearch = resource === "jira-issue";
  const serverInput = serverSearch ? query : "";
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => { setSearchQuery(serverSearch ? query : ""); if (serverSearch) { setPage(""); setNextPage(null); } }, 300);
    return () => clearTimeout(timer);
  }, [query, serverSearch]);
  const selectedValues: string[] = useMemo(() => {
    if (!multiple) return [];
    try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed; } catch { /* Legacy comma-separated values and expressions stay editable. */ }
    return value.includes("{{") ? [] : value.split(",").map((v) => v.trim()).filter(Boolean);
  }, [value, multiple]);
  const scope = JSON.stringify([workspaceId, credentialId, resource, dependencyValue, secondaryDependencyValue, resourceVariant, serverSearch ? searchQuery : ""]);
  const requestScope = useRef(scope);
  const eventPageStart = useRef<string | null>(null);

  useEffect(() => {
    setResources([]);
    setQuery("");
    setNextPage(null);
    setHasMoreModels(false);
    setPage("");
    setRepositoryOwners([]);
    setRepositoryOwner("");
    setWarning(null);
    eventPageStart.current = null;
  }, [credentialId, resource, workspaceId, dependencyValue, secondaryDependencyValue, resourceVariant]);

  useEffect(() => {
    // The reset effect above updates React state after this render. Do not send
    // the previous scope's cursor or GitHub owner with a new connection or
    // parent resource while waiting for those updates to take effect.
    const scopeChanged = requestScope.current !== scope;
    requestScope.current = scope;
    if (scopeChanged && (page || repositoryOwner)) return;
    if (!workspaceId || !credentialId || (resource === "steam-game" && Boolean(dependencyValue) && !/^\d{17,20}$/.test(dependencyValue ?? "")) || (["airtable-table", "airtable-record", "gitlab-pipeline", "gitlab-merge-request", "github-label", "sentry-issue", "vercel-deployment", "jira-issue-type", "gitlab-issue", "mongodb-collection", "postgres-table", "google-calendar-event", "google-sheet-tab", "google-sheet-header", "trello-list", "trello-card", "notion-property", "notion-source-property", "notion-source-option", "github-issue", "github-pull-request", "sentry-project", "sentry-installation", "vercel-project"].includes(resource) && (!dependencyValue || dependencyValue.includes("{{"))) || (resource === "notion-source-option" && (!secondaryDependencyValue || secondaryDependencyValue.includes("{{") || !["status", "select"].includes(resourceVariant ?? "")))) {
      setResources([]);
      setRepositoryOwners([]);
      setError(null);
      setLoading(false);
      return;
    }
    if ((resource === "google-sheet-header" || resource === "airtable-record") && (!secondaryDependencyValue || secondaryDependencyValue.includes("{{"))) { setResources([]); setError(null); setLoading(false); return; }
    if (serverSearch && query !== searchQuery) return;
    let isCurrent = true;
    setLoading(true);
    setError(null);
    const base = `/workspaces/${encodeURIComponent(workspaceId)}/credentials/${encodeURIComponent(credentialId)}`;
    const params = new URLSearchParams();
    if (resource === "airtable-table" || resource === "airtable-record") { params.set("baseId", dependencyValue ?? ""); if (resource === "airtable-record") params.set("tableId", secondaryDependencyValue ?? ""); }
    else if (itemResource) {
      if (dependencyValue) params.set("parent", dependencyValue);
      if (secondaryDependencyValue) params.set("context", secondaryDependencyValue);
      if (page) params.set("cursor", page);
      if (serverSearch && searchQuery) params.set("query", searchQuery);
    }
    else if (resource === "github-repository") {
      params.set("page", page || "1");
      if (repositoryOwner) params.set("owner", repositoryOwner);
    }
    else if (resource === "steam-game" && dependencyValue) params.set("steamId", dependencyValue);
    else if (resource === "mongodb-collection") params.set("database", dependencyValue ?? "");
    else if (resource === "postgres-table") params.set("schema", dependencyValue ?? "");
    else if (resource === "trello-list" || resource === "trello-card") { params.set("board", dependencyValue ?? ""); if (resource === "trello-card" && page) params.set("before", page); }
    else if ((resource === "notion-page" || resource === "notion-data-source") && page) params.set("cursor", page);
    else if (resource === "notion-property") params.set("pageId", dependencyValue ?? "");
    else if (resource === "notion-source-property") params.set("dataSourceId", dependencyValue ?? "");
    else if (resource === "notion-source-option") { params.set("dataSourceId", dependencyValue ?? ""); params.set("propertyId", secondaryDependencyValue ?? ""); params.set("mode", resourceVariant ?? ""); }
    else if (resource === "jira-issue-type") params.set("project", dependencyValue ?? "");
    else if (resource === "gitlab-project" || resource === "gitlab-issue") { if (page) params.set("page", page); if (resource === "gitlab-issue") params.set("project", dependencyValue ?? ""); }
    else if (resource === "github-issue" || resource === "github-pull-request") { params.set("repository", dependencyValue ?? ""); if (page) params.set("page", page); }
    else if ((resource === "sentry-project" || resource === "sentry-installation")) params.set("organization", dependencyValue ?? "");
    else if (resource === "vercel-project") params.set("team", dependencyValue ?? "");
    else if (resource === "google-sheet-tab" || resource === "google-sheet-header") { params.set("spreadsheetId", dependencyValue ?? ""); if (resource === "google-sheet-header") params.set("sheet", secondaryDependencyValue ?? ""); }
    else if (resource === "google-calendar-event") { params.set("calendarId", dependencyValue ?? ""); if (page && eventPageStart.current) { params.set("pageToken", page); params.set("timeMin", eventPageStart.current); } }
    else if (resource === "google-file" || resource === "google-drive-item" || resource === "google-folder" || resource === "google-spreadsheet") { params.set("kind", resource === "google-spreadsheet" ? "spreadsheet" : resource === "google-folder" ? "folder" : resource === "google-drive-item" ? "all" : "file"); if (page) params.set("pageToken", page); }
    else if (resource === "slack-channel" && page) params.set("cursor", page);
    else if ((resource === "google-calendar" || resource === "gmail-draft" || resource === "gemini-model") && page) params.set("pageToken", page);
    const endpoint = resource === "airtable-base" ? `${base}/airtable/bases` : resource === "airtable-table" ? `${base}/airtable/tables` : resource === "airtable-record" ? `${base}/airtable/records` : resource === "google-sheet-tab" ? `${base}/google/sheets/tabs` : resource === "google-sheet-header" ? `${base}/google/sheets/headers` : itemResource ? `${base}/items/${resource}` : resource === "jira-project" ? `${base}/jira/projects` : resource === "jira-issue-type" ? `${base}/jira/issue-types` : resource === "gitlab-project" ? `${base}/gitlab/projects` : resource === "gitlab-issue" ? `${base}/gitlab/issues` : resource === "slack-channel" ? `${base}/slack/channels` : resource === "steam-game" ? `${base}/steam/games` : resource === "github-issue" ? `${base}/github/issues` : resource === "github-pull-request" ? `${base}/github/pull-requests` : resource === "notion-page" ? `${base}/notion/pages` : resource === "notion-property" ? `${base}/notion/properties` : resource === "notion-data-source" ? `${base}/notion/data-sources` : resource === "notion-source-property" ? `${base}/notion/data-source-properties` : resource === "notion-source-option" ? `${base}/notion/data-source-options` : resource === "trello-card" ? `${base}/trello/cards` : resource === "supabase-table" ? `${base}/supabase/tables` : resource === "vercel-team" ? `${base}/vercel/teams` : resource === "vercel-project" ? `${base}/vercel/projects` : resource === "sentry-organization" ? `${base}/sentry/organizations` : resource === "sentry-installation" ? `${base}/sentry/installations` : resource === "sentry-project" ? `${base}/sentry/projects` : resource === "trello-board" ? `${base}/trello/boards` : resource === "trello-list" ? `${base}/trello/lists` : resource === "github-repository" ? `${base}/github/repositories` : resource === "gemini-model" ? `${base}/gemini/models` : resource === "openai-model" ? `${base}/openai/models` : resource === "google-chat-space" ? `${base}/google-chat/spaces` : resource === "gmail-label" ? `${base}/gmail/labels` : resource === "gmail-draft" ? `${base}/gmail/drafts` : resource === "google-calendar" ? `${base}/google-calendar/calendars` : resource === "google-calendar-event" ? `${base}/google-calendar/events` : resource === "mongodb-database" ? `${base}/mongodb/databases` : resource === "mongodb-collection" ? `${base}/mongodb/collections` : resource === "postgres-schema" ? `${base}/postgres/schemas` : resource === "postgres-table" ? `${base}/postgres/tables` : `${base}/google/files`;
    type Response = { tabs?: Array<{ id: number; title: string }>; headers?: Array<{ column: number; name: string }>; issueTypes?: Array<{ id: string; name: string }>; channels?: Array<{ id: string; name: string }>; games?: Array<{ id: string; name: string }>; warning?: string; items?: Array<{ id: string; name: string }>; truncated?: boolean; cards?: Array<{ id: string; name: string }>; properties?: Array<{ id: string; name: string }>; sources?: Array<{ id: string; name: string }>; options?: Array<{ id: string; name: string }>; pages?: Array<{ id: string; title: string }>; nextCursor?: string | null; nextBefore?: string | null; teams?: Array<{ id: string; name: string }>; organizations?: Array<{ id: string; name: string }>; installations?: Array<{ id: string; name: string }>; projects?: Array<{ id: string; name: string }>; boards?: Array<{ id: string; name: string }>; lists?: Array<{ id: string; name: string }>; repositories?: Array<{ id: number; fullName: string; private: boolean }>; repositoryOwners?: string[]; nextPage?: number | null; files?: Array<{ id: string; name: string }>; calendars?: Array<{ id: string; name: string }>; events?: Array<{ id: string; name: string }>; labels?: Array<{ id: string; name: string }>; drafts?: Array<{ id: string; name: string }>; spaces?: Array<{ id: string; name: string }>; databases?: Array<{ id: string; name: string }>; collections?: Array<{ id: string; name: string }>; schemas?: Array<{ id: string; name: string }>; tables?: Array<{ id: string; name: string }>; nextPageToken?: string | null; timeMin?: string; models?: Array<{ id: string; label: string; inputTokenLimit?: number; outputTokenLimit?: number; thinking?: boolean }>; hasMore?: boolean };
    void apiRequest<Response>(`${endpoint}?${params}`)
      .then((response) => { if (isCurrent) {
        setLoadedScope(scope);
        if (resource === "google-calendar-event" && !page) eventPageStart.current = response.timeMin ?? null;
        setWarning(response.warning ?? (response.truncated ? resource.startsWith("airtable-") ? "Only the first 100 results are shown. Enter an ID manually if needed." : "Only the first 1,000 pages are available. Enter a number manually if needed." : null));
        const options: ResourceOption[] = resource === "google-sheet-tab" ? (response.tabs ?? []).map((item) => ({ id: String(item.id), value: item.title, label: item.title })) : resource === "google-sheet-header" ? (response.headers ?? []).filter((item) => item.name.trim()).map((item) => ({ id: String(item.column), value: item.name, label: item.name })) : resource === "github-repository" ? (response.repositories ?? []).map((item) => ({ id: String(item.id), value: item.fullName, label: `${item.fullName}${item.private ? " · private" : ""}` })) : resource === "gemini-model" || resource === "openai-model" ? (response.models ?? []).map((item) => ({ ...item, value: item.id, label: item.label === item.id ? item.id : `${item.label} · ${item.id}` })) : ((itemResource || resource.startsWith("airtable-")) ? response.items ?? [] : resource === "jira-project" ? response.projects ?? [] : resource === "jira-issue-type" ? response.issueTypes ?? [] : resource === "gitlab-project" ? response.projects ?? [] : resource === "gitlab-issue" ? response.items ?? [] : resource === "steam-game" ? response.games ?? [] : resource === "github-issue" || resource === "github-pull-request" ? response.items ?? [] : resource === "notion-page" ? (response.pages ?? []).map((item) => ({ id: item.id, name: item.title })) : (resource === "notion-property" || resource === "notion-source-property") ? response.properties ?? [] : resource === "notion-data-source" ? response.sources ?? [] : resource === "notion-source-option" ? response.options ?? [] : resource === "trello-card" ? response.cards ?? [] : resource === "supabase-table" ? response.tables ?? [] : resource === "vercel-team" ? response.teams ?? [] : resource === "vercel-project" ? response.projects ?? [] : resource === "sentry-organization" ? response.organizations ?? [] : resource === "sentry-installation" ? response.installations ?? [] : resource === "sentry-project" ? response.projects ?? [] : resource === "trello-board" ? response.boards ?? [] : resource === "trello-list" ? response.lists ?? [] : resource === "google-chat-space" ? response.spaces ?? [] : resource === "slack-channel" ? response.channels ?? [] : resource === "gmail-label" ? response.labels ?? [] : resource === "gmail-draft" ? response.drafts ?? [] : resource === "google-calendar" ? response.calendars ?? [] : resource === "google-calendar-event" ? response.events ?? [] : resource === "mongodb-database" ? response.databases ?? [] : resource === "mongodb-collection" ? response.collections ?? [] : resource === "postgres-schema" ? response.schemas ?? [] : resource === "postgres-table" ? response.tables ?? [] : response.files ?? []).map((item) => ({ id: item.id, value: item.id, label: item.name }));
        setResources((current) => !page ? options : [...current, ...options.filter((item) => !current.some((existing) => existing.id === item.id))]);
        if (resource === "github-repository") setRepositoryOwners((current) => [...new Set([...current, ...(response.repositoryOwners ?? [])])].sort((left, right) => left.localeCompare(right)));
        setHasMoreModels((resource === "jira-project" || resource === "jira-issue-type" || resource === "steam-game" || resource === "gemini-model" || resource === "openai-model" || resource === "google-chat-space" || resource === "gmail-label" || resource === "gmail-draft" || resource === "google-calendar-event" || resource === "mongodb-database" || resource === "mongodb-collection" || resource === "postgres-schema" || resource === "postgres-table" || resource === "trello-board" || resource === "trello-list" || resource === "trello-card" || resource === "sentry-organization" || resource === "sentry-project" || resource === "sentry-installation" || resource === "vercel-team" || resource === "vercel-project" || resource === "supabase-table") && response.hasMore === true && (resource !== "trello-card" || !response.nextBefore) && ((resource !== "gmail-draft" && resource !== "gemini-model") || !response.nextPageToken));
        setNextPage(itemResource ? response.nextCursor ?? null : (resource === "gitlab-project" || resource === "gitlab-issue" || resource === "github-repository" || resource === "github-issue" || resource === "github-pull-request") ? response.nextPage ? String(response.nextPage) : null : (resource === "notion-page" || resource === "notion-data-source" || resource === "slack-channel") ? response.nextCursor ?? null : resource === "trello-card" ? response.nextBefore ?? null : resource === "google-calendar-event" && !eventPageStart.current ? null : response.nextPageToken ?? null);
      } })
      .catch((reason) => { if (isCurrent) {
        if (resource === "supabase-table" && reason instanceof ApiClientError && (reason.code === "SUPABASE_DISCOVERY_RESTRICTED" || reason.code === "SUPABASE_TABLES_UNAVAILABLE")) {
          setManual(true);
          setError(null);
          setWarning(reason.message);
        } else setError(reason instanceof Error ? reason.message : `Unable to load ${resourcePlurals[resource]}.`);
      } })
      .finally(() => { if (isCurrent) setLoading(false); });
    return () => { isCurrent = false; };
  }, [credentialId, resource, workspaceId, page, repositoryOwner, retry, dependencyValue, secondaryDependencyValue, resourceVariant, scope, itemResource, serverSearch, searchQuery, serverInput]);

  const filteredResources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return resources.filter((item) => (resource !== "notion-source-property" || !resourceVariant || item.label.endsWith(` · ${resourceVariant}`)) && (serverSearch || !normalized || item.label.toLowerCase().includes(normalized) || item.value.toLowerCase().includes(normalized)));
  }, [query, resources, resource, resourceVariant, serverSearch]);
  const selectedNotShown = Boolean(value) && !filteredResources.some((item) => item.value === value);
  const selectedModel = resource === "gemini-model" && loadedScope === scope ? resources.find((item) => item.value === value) : undefined;

  return (
    <div role="group" aria-label={label} className="config-field resource-picker">
      <span className="ui-field__label">{label}</span>
      {manual ? <>{warning && <small role="status">{warning}</small>}<input data-expression-target={allowExpression ? "" : undefined} value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} value`} placeholder={resource === "google-sheet-tab" ? "Sheet tab name" : resource === "google-sheet-header" ? "Column header" : resource === "jira-issue" ? "PROJECT-123 or expression" : itemResource ? "Provider ID or expression" : resource === "github-repository" ? (allowExpression ? "owner/repository or expression" : "owner/repository") : resource === "gemini-model" || resource === "openai-model" ? "Model ID or expression" : resource === "google-chat-space" ? "spaces/… or expression" : resource === "slack-channel" ? "Channel ID or expression" : resource === "google-calendar" ? "Calendar ID or expression" : resource === "google-calendar-event" ? "Event ID or expression" : resource === "gmail-label" ? (allowExpression ? "Label ID or expression" : "Label ID") : resource === "gmail-draft" ? (allowExpression ? "Draft ID or expression" : "Draft ID") : ["vercel-team", "vercel-project", "sentry-installation"].includes(resource) ? `${resourceLabels[resource]} ID or expression` : ["sentry-organization", "sentry-project"].includes(resource) ? `${resourceLabels[resource]} slug or expression` : ["trello-board", "trello-list", "trello-card"].includes(resource) ? `${resourceLabels[resource]} ID or expression` : (resource === "jira-project" || resource === "jira-issue-type" || resource === "gitlab-project" || resource === "gitlab-issue" || resource === "github-issue" || resource === "github-pull-request") ? "Numeric ID or expression" : resource === "steam-game" ? "Steam App ID or expression" : resource === "notion-page" ? "Page or block ID or expression" : (resource === "notion-property" || resource === "notion-source-property") ? "Property ID or expression" : resource === "notion-data-source" ? "Data source ID or expression" : resource === "notion-source-option" ? "Exact value or expression" : ["mongodb-collection", "mongodb-database", "postgres-schema", "postgres-table", "supabase-table"].includes(resource) ? `${resourceLabels[resource]} name or expression` : resource === "google-folder" ? "Folder ID" : "File ID or expression"} /><small>{allowExpression ? "Use a value from the provider or a previous step." : "Enter the exact provider value."}</small></> : !credentialId ? <small>Select a compatible credential first.</small> : resource === "steam-game" && Boolean(dependencyValue) && !/^\d{17,20}$/.test(dependencyValue ?? "") ? <small>Enter a complete Steam ID 64, or enter the App ID manually.</small> : ["gitlab-pipeline", "gitlab-merge-request", "github-label", "sentry-issue", "vercel-deployment", "jira-issue-type", "gitlab-issue", "mongodb-collection", "postgres-table", "google-calendar-event", "google-sheet-tab", "google-sheet-header", "trello-list", "trello-card", "notion-property", "notion-source-property", "notion-source-option", "github-issue", "github-pull-request", "sentry-project", "sentry-installation", "vercel-project"].includes(resource) && (!dependencyValue || dependencyValue.includes("{{")) || ["notion-source-option", "google-sheet-header"].includes(resource) && (!secondaryDependencyValue || secondaryDependencyValue.includes("{{")) ? <small>Choose the parent resource first, or enter a value manually.</small> : <>
        {resource === "github-repository" && <label className="resource-picker__owner"><span className="ui-field__label">Repository owner</span><Select aria-label={`${label} owner`} value={repositoryOwner} onChange={(event) => { setRepositoryOwner(event.target.value); setResources([]); setQuery(""); setPage(""); setNextPage(null); }}><option value="">All visible owners</option>{repositoryOwners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</Select><small>Classic tokens may access multiple personal or organization owners. This filter does not change GitHub permissions.</small></label>}
        <input value={query} onChange={(event) => { setQuery(event.target.value); if (serverSearch) { setResources([]); setPage(""); setNextPage(null); } }} placeholder={placeholder} aria-label={`${label} search`} />
        <Select aria-label={label} value={multiple ? "" : value} onChange={(event) => { const selected = event.target.value; if (multiple) { if (selected && selectedValues.length < 20 && !selectedValues.includes(selected)) onChange(JSON.stringify([...selectedValues, selected])); } else onChange(selected); }} disabled={(loading && !page) || (Boolean(error) && !resources.length)}>
          <option value="">{loading ? "Loading…" : `Select ${resourceLabels[resource]}`}</option>
          {!multiple && selectedNotShown && <option value={value}>{value} · current value</option>}
          {filteredResources.filter((item) => !multiple || !selectedValues.includes(item.value)).map((item) => <option key={item.id} value={item.value} disabled={multiple && selectedValues.length >= 20}>{item.label}</option>)}
        </Select>
        {multiple && selectedValues.length >= 20 && <small>Maximum 20 labels. Remove a label to choose another.</small>}
        {multiple && selectedValues.length > 0 && <div className="resource-picker__chips" aria-label="Selected labels">{selectedValues.map((selected) => <Button key={selected} type="button" variant="secondary" aria-label={`Remove label ${selected}`} onClick={() => onChange(JSON.stringify(selectedValues.filter((v) => v !== selected)))}>{selected} ×</Button>)}</div>}
        {error && <><small role="alert">{error}</small><Button type="button" variant="ghost" onClick={() => setRetry((current) => current + 1)}>Retry</Button></>}
        {warning && !error && <small role="status">{warning}</small>}
        {!loading && !error && (!serverSearch || query === searchQuery) && !resources.length && <small>No {resourcePlurals[resource]} found for this connection.</small>}
        {resource === "slack-channel" && <small>Only public channels the Fluxora bot has joined are shown. Add the bot in Slack to use another channel.</small>}
        {!loading && !error && resources.length > 0 && <small>{filteredResources.length} of {resources.length} loaded {resourcePlurals[resource]} match{nextPage ? "; more are available" : ""}.</small>}
        {!serverSearch && !loading && !error && query.trim() && nextPage && <small>Search only includes loaded {resourcePlurals[resource]}. Load more to search additional results.</small>}
        {!loading && !error && hasMoreModels && (resource !== "google-calendar-event" || !nextPage) && <small>Showing up to {resource === "google-calendar-event" ? "50 upcoming" : resource === "jira-project" || resource === "jira-issue-type" ? "50" : resource === "gmail-draft" ? "10" : "100"} {resourcePlurals[resource]}. Enter another value manually if needed.</small>}
        {resource === "openai-model" && <small>Choose a model that supports text generation with the Responses API.</small>}
        {resource === "gemini-model" && <small>Choose a model available to this Google project. Listing a model does not guarantee access, structured output support, or cost.</small>}
        {selectedModel && (selectedModel.inputTokenLimit || selectedModel.outputTokenLimit || selectedModel.thinking !== undefined) && <small>Google-reported model limits: {selectedModel.inputTokenLimit ? `input ${selectedModel.inputTokenLimit.toLocaleString()} tokens` : "input limit unavailable"}; {selectedModel.outputTokenLimit ? `output ${selectedModel.outputTokenLimit.toLocaleString()} tokens` : "output limit unavailable"}{selectedModel.thinking === undefined ? "" : selectedModel.thinking ? "; thinking supported" : "; thinking not reported as supported"}. Limits can change and do not guarantee structured output support or cost.</small>}
        {nextPage && !error && <Button type="button" variant="ghost" disabled={loading} onClick={() => setPage(nextPage)}>{loading ? "Loading…" : `Load more ${resourcePlurals[resource]}`}</Button>}
      </>}
      {serverSearch && !manual && <small>Shows issues updated in the last 90 days by default. Search by key or text for other issues. Recent updates may take time to appear.</small>}
      <Button className="resource-picker__mode" type="button" variant="ghost" onClick={() => { if (manual && warning && resource === "supabase-table") { setWarning(null); setRetry((current) => current + 1); } setManual((current) => !current); }}>{manual ? "Choose from list" : allowExpression ? "Enter value or expression" : `Enter ${resourceLabels[resource]} manually`}</Button>
      {resource === "steam-game" && <small>Only games visible in this Steam library are listed. You can enter any App ID manually.</small>}
      {resource === "supabase-table" && <small>Listing a table does not grant access to its rows. The Data API key and Row Level Security still apply.</small>}
    </div>
  );
}
