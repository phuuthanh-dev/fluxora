import { jiraFields } from "./jira-fields";
import { gitlabFields } from "./gitlab-fields";
import { dataTransformFields } from "./data-transform-fields";
import type { WorkflowNodeType } from "./index";
import type { NodeConfigurationField } from "./node-configuration-fields";
import { gmailWriteConfigurationFields } from "./gmail-write-fields";
import { notionReadConfigurationFields } from "./notion-read-fields";
import { trelloCardConfigurationFields } from "./trello-card-fields";
import { aiNodeFields } from "./ai-node-fields";
import { communicationNodeFields } from "./communication-node-fields";
import { dataNodeFields } from "./data-node-fields";
import { developerNodeFields } from "./developer-node-fields";
import { googleNodeFields } from "./google-node-fields";
import { otherNodeFields } from "./other-node-fields";
import { githubReadConfigurationFields } from "./github-read-fields";

/** Incremental UI metadata only. Missing entries mean the descriptor has not
 * moved yet; do not interpret them as an empty runtime validation schema. */
const sharedFields = {
  ...dataTransformFields,
  ...jiraFields,
  ...gitlabFields,
  ...aiNodeFields,
  ...communicationNodeFields,
  ...dataNodeFields,
  ...developerNodeFields,
  ...googleNodeFields,
  ...otherNodeFields,
  "action.github.list-issues": () => githubReadConfigurationFields("issue", true),
  "action.github.get-issue": () => githubReadConfigurationFields("issue", false),
  "action.github.update-issue": () => [
    ...githubReadConfigurationFields("issue", false),
    { kind: "select", key: "field", label: "Field to update", options: [{ value: "title", label: "Title" }, { value: "body", label: "Description" }, { value: "state", label: "State" }] },
    { kind: "text", key: "title", label: "New title", visibleWhen: { key: "field", equals: "title", fallback: "title" } },
    { kind: "textarea", key: "body", label: "New description (empty clears it)", visibleWhen: { key: "field", equals: "body" } },
    { kind: "select", key: "state", label: "New state", options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }], visibleWhen: { key: "field", equals: "state" } },
  ],
  "action.github.list-pull-requests": () => githubReadConfigurationFields("pull-request", true),
  "action.github.get-pull-request": () => githubReadConfigurationFields("pull-request", false),
  "action.gmail.send": () => gmailWriteConfigurationFields("send"),
  "action.gmail.reply": () => gmailWriteConfigurationFields("reply"),
  "action.gmail.create-draft": () => gmailWriteConfigurationFields("draft"),
  "action.gmail.update-draft": () => gmailWriteConfigurationFields("updateDraft"),
  "action.gmail.modify-label": () => gmailWriteConfigurationFields("label"),
  "action.notion.retrieve-page": () => notionReadConfigurationFields("page"),
  "action.notion.query-data-source": () => [
    { kind: "credential", key: "credentialId", label: "Notion connection", providers: ["NOTION"] },
    { kind: "resource", key: "dataSourceId", label: "Data source", resource: "notion-data-source", credentialKey: "credentialId", placeholder: "Search data sources" },
    { kind: "number", key: "pageSize", label: "Maximum results (1–100)", fallbackValue: 20 },
    { kind: "select", key: "sort", label: "Sort entries", options: [{ value: "provider", label: "Notion default order" }, { value: "created-newest", label: "Recently created first" }, { value: "created-oldest", label: "Oldest created first" }, { value: "edited-newest", label: "Recently edited first" }, { value: "edited-oldest", label: "Oldest edited first" }] },
    { kind: "datetime", key: "editedAfter", label: "Edited after (optional)" },
    { kind: "select", key: "filterMode", label: "Property filter", options: [{ value: "none", label: "No property filter" }, { value: "status", label: "Status equals" }, { value: "select", label: "Select equals" }, { value: "checkbox", label: "Checkbox equals" }] },
    { kind: "resource", key: "filterProperty", label: "Filter property", resource: "notion-source-property", credentialKey: "credentialId", dependencyKey: "dataSourceId", placeholder: "Search supported properties", visibleWhen: { key: "filterMode", equals: ["status", "select", "checkbox"] } },
    { kind: "resource", key: "filterValue", label: "Property value", resource: "notion-source-option", credentialKey: "credentialId", dependencyKey: "dataSourceId", secondaryDependencyKey: "filterProperty", placeholder: "Search values", visibleWhen: { key: "filterMode", equals: ["status", "select"] } },
    { kind: "select", key: "filterValue", label: "Checkbox value", options: [{ value: "true", label: "Checked" }, { value: "false", label: "Unchecked" }], visibleWhen: { key: "filterMode", equals: "checkbox" } },
    { kind: "text", key: "cursor", label: "Next cursor (optional)", advanced: { summary: "Advanced pagination", help: "Use nextCursor from the previous result with the same source, filter and sort. A provider limit can make the result incomplete; changes may shift entries between pages." } },
  ],
  "action.notion.list-children": () => notionReadConfigurationFields("children"),
  "action.notion.retrieve-property": () => notionReadConfigurationFields("property"),
  "action.notion.create-entry": () => [
    { kind: "credential", key: "credentialId", label: "Notion connection", providers: ["NOTION"] },
    { kind: "resource", key: "dataSourceId", label: "Data source", resource: "notion-data-source", credentialKey: "credentialId", placeholder: "Search shared data sources" },
    { kind: "notion-properties", key: "properties", label: "Properties" },
  ],
  "action.notion.update-entry": () => [
    { kind: "credential", key: "credentialId", label: "Notion connection", providers: ["NOTION"] },
    { kind: "resource", key: "dataSourceId", label: "Data source", resource: "notion-data-source", credentialKey: "credentialId", placeholder: "Search shared data sources" },
    { kind: "resource", key: "pageId", label: "Page", resource: "notion-page", credentialKey: "credentialId", placeholder: "Search shared pages" },
    { kind: "notion-properties", key: "properties", label: "Properties" },
  ],
  "action.notion.create-page": () => [
    { kind: "credential", key: "credentialId", label: "Notion connection", providers: ["NOTION"] },
    { kind: "resource", key: "parentPageId", label: "Parent page", resource: "notion-page", credentialKey: "credentialId", placeholder: "Search shared pages" },
    { kind: "text", key: "title", label: "Page title" },
    { kind: "textarea", key: "content", label: "Page text (optional)" },
  ],
  "action.notion.update-title": () => [
    { kind: "credential", key: "credentialId", label: "Notion connection", providers: ["NOTION"] },
    { kind: "resource", key: "pageId", label: "Page", resource: "notion-page", credentialKey: "credentialId", placeholder: "Search shared pages" },
    { kind: "text", key: "title", label: "New page title" },
  ],
  "action.notion.append-block": () => [
    { kind: "credential", key: "credentialId", label: "Notion connection", providers: ["NOTION"] },
    { kind: "resource", key: "pageId", label: "Page", resource: "notion-page", credentialKey: "credentialId", placeholder: "Search shared pages" },
    { kind: "textarea", key: "content", label: "Paragraph text" },
  ],
  "action.trello.get-card": () => trelloCardConfigurationFields("get"),
  "action.trello.update-card": () => trelloCardConfigurationFields("update"),
  "action.trello.move-card": () => trelloCardConfigurationFields("move"),
  "action.trello.archive-card": () => trelloCardConfigurationFields("archive"),
  "action.trello.list-cards": () => trelloCardConfigurationFields("list"),
  "action.trello.find-cards": () => trelloCardConfigurationFields("find"),
} satisfies Partial<Record<WorkflowNodeType, () => NodeConfigurationField[]>>;

export const sharedNodeConfigurationTypes: readonly (keyof typeof sharedFields)[] = Object.freeze(Object.keys(sharedFields) as (keyof typeof sharedFields)[]);

export function getSharedNodeConfigurationFields(type: string): NodeConfigurationField[] | undefined {
  if (!Object.hasOwn(sharedFields, type)) return undefined;
  return sharedFields[type as keyof typeof sharedFields]();
}
