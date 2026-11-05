"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  MiniMap,
  ReactFlow,
  type Connection,
  type ReactFlowInstance,
  type NodeTypes,
} from "@xyflow/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Crosshair,
  Download,
  History,
  Layers3,
  LayoutDashboard,
  KeyRound,
  LoaderCircle,
  Maximize2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Save,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiRequest, apiUrl } from "../api/api-client";
import { validateWorkflowGraph } from "./graph-validation";
import {
  getNodeDefinition,
  getNodeDefinitionForConfig,
  getLibraryDefinition,
  libraryDefinitionId,
  type NodeDefinition,
  type NodeConfigurationField,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
} from "./node-catalog";
import { useWorkflowEditorStore } from "./editor-store";
import { parseWorkflowCanvasGraph } from "./workflow-graph-schema";
import { WorkflowNode } from "./workflow-node";
import { graphForApi, graphFromApi, type ApiWorkflow } from "./workflow-api";
import { CredentialPanel } from "../credentials/credential-panel";
import type { CredentialProvider, CredentialSummary } from "../credentials/credential-types";
import { buildExpressionSuggestions, buildPossibleExpressionSuggestions, upstreamNodeIds } from "./expression-suggestions";
import { manualTriggerTestData } from "./test-data";
import { NodeIcon } from "./node-icon";
import { NodeLibrary, type NodeLibraryHandle } from "./node-library";
import { Button, Dialog, DialogHeader, Field, IconButton, Menu, Select, Status, useDialogFocus } from "../../components/ui";
import { useSurfaceMotion } from "../../components/ui/ui-motion";
import { AppShellHeader } from "../app-shell/app-shell-header";
import { ExecutionDetailsPanel, outputHasList, type ApiExecution } from "./execution-observability";
import { executionPagination } from "./execution-pagination";
import { ResourcePicker } from "./resource-picker";
import { MongoFilterField } from "./mongodb-filter-field";
import { StructuredOutputField } from "./structured-output-field";
import { resetDrivePageToken } from "./drive-pagination";
import { DriveSearchField } from "./drive-search-field";
import { RelationalSelectionField } from "./relational-selection-field";
import { isRelationalBaselineCurrent, relationalSelectionKeys, type RelationalBaseline, type RelationalDraft, type RelationalProvider, type RelationalSelection } from "./relational-selection";
import { useRelationalMetadata } from "./use-relational-metadata";
import type { StructuredOutputDraft } from "./structured-output-schema";
import type { InspectorDraft, InspectorDraftKind, StagedText, UpdateInspectorDraft } from "./inspector-drafts";
import type { MongoFilterRow } from "./mongodb-filter";
import { GoogleSheetsMappingField } from "./google-sheets-mapping-field";
import { applySheetsMapping, type SheetsMappingDraft } from "./google-sheets-mapping";

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode };

type WorkflowVersionSummary = { id: string; version: number; status: "DRAFT" | "PUBLISHED"; createdAt: string; publishedAt: string | null; nodeCount: number };
type WebhookEndpoint = { id: string; path: string; secretRequired: boolean; signingMode?: "registration" | "legacy"; callbackUrl?: string; workflowVersionId: string; createdAt: string; updatedAt: string };
type ProviderWebhookState = "CREATING" | "CREATE_DISPATCHING" | "CREATE_UNCERTAIN" | "CREATE_REJECTED" | "ACTIVE" | "DELETING" | "DELETE_UNCERTAIN" | "REMOVED";
type ProviderWebhookStatus = { enabled: boolean; endpoint: { id: string; path: string; workflowVersionId: string; updatedAt: string } | null; registration: { provider: string; repository: string; event: string; workflowVersionId: string; state: ProviderWebhookState; createdAt: string; updatedAt: string } | null; reconciliation?: { outcome: "MATCHED" | "DRIFTED" | "UNKNOWN" | "MANUAL_REQUIRED"; message: string } };
type ApiApproval = { id: string; status: string; expiresAt: string; executionId: string; workflowId: string };
type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type LiveReadinessRequirement = { nodeId: string; provider: CredentialProvider; credentialId: string | null; ready: boolean; reason: "MISSING_CREDENTIAL" | "CREDENTIAL_NOT_FOUND" | "CREDENTIAL_PROVIDER_MISMATCH" | null };
type LiveReadiness = { ready: boolean; requirements: LiveReadinessRequirement[]; unavailableNodes?: Array<{ nodeId: string; type: string }> };

function readConfigText(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function isRedditFeed(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && (url.hostname === "reddit.com" || url.hostname.endsWith(".reddit.com"));
  } catch { return false; }
}

function isGitHubWebhookTrigger(nodeType: string) {
  return nodeType === "trigger.github.issue-opened" || nodeType === "trigger.github.pull-request-opened" || nodeType === "trigger.github.push" || nodeType === "trigger.github.workflow-run-completed";
}

function isUptimeKumaTrigger(nodeType: string) {
  return nodeType === "trigger.uptime-kuma.alert";
}

function providerLabel(provider: CredentialProvider) {
  const labels: Record<CredentialProvider, string> = {
    GOOGLE_CHAT_WEBHOOK: "Google Chat",
    DISCORD_WEBHOOK: "Discord",
    TELEGRAM_BOT: "Telegram",
    GOOGLE: "Google",
    GITHUB: "GitHub",
    STEAM: "Steam",
    RIOT: "Riot Games",
    SMTP: "SMTP email",
    GEMINI: "Gemini",
    OPENAI: "OpenAI",
    MONGODB: "MongoDB",
    NOTION: "Notion",
    TRELLO: "Trello",
    SENTRY: "Sentry",
    VERCEL: "Vercel",
    SUPABASE: "Supabase",
    REDDIT: "Reddit",
    POSTGRES: "PostgreSQL",
    GOOGLE_CHAT_OAUTH: "Google Chat OAuth",
    GMAIL: "Gmail",
    GOOGLE_CALENDAR: "Google Calendar",
    HTTP: "HTTP",
  };
  return labels[provider];
}

function reasonLabel(reason: LiveReadinessRequirement["reason"]) {
  return reason === "MISSING_CREDENTIAL" ? "Select a credential in the node inspector." : reason === "CREDENTIAL_NOT_FOUND" ? "The selected credential no longer exists." : "The selected credential belongs to another provider.";
}

function providerWebhookStateLabel(state: ProviderWebhookState) {
  return state === "ACTIVE" ? "Connected" : state === "CREATING" || state === "CREATE_DISPATCHING" ? "Connecting…" : state === "DELETING" ? "Disconnecting…" : state === "CREATE_UNCERTAIN" || state === "DELETE_UNCERTAIN" ? "Needs reconciliation" : state === "CREATE_REJECTED" ? "Connection rejected" : "Disconnected";
}

function useNarrowEditorLayout() {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1080px)");
    const update = () => setIsNarrow(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isNarrow;
}

function ConfigField({ label, value, onChange, multiline = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <Field label={label} className="config-field">
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
}

function NumericConfigField({ label, value, configured, fallbackValue, allowExpressions, onChange }: { label: string; value: string; configured: boolean; fallbackValue?: number; allowExpressions: boolean; onChange: (value: string | number | undefined) => void }) {
  const isNumber = value !== "" && value.trim() !== "" && Number.isFinite(Number(value));
  const [expressionMode, setExpressionMode] = useState(value !== "" && !isNumber);
  const contextId = useId();
  // An externally loaded expression must remain visible even if the user was
  // previously editing a fixed value. Switching modes alone never clears it.
  const manual = expressionMode || (value !== "" && !isNumber);
  return <div className="config-field">
    <Field label={label}><input type={manual ? "text" : "number"} value={value} placeholder={manual ? "{{ steps.example.output.value }}" : !configured && fallbackValue !== undefined ? `Default: ${fallbackValue}` : undefined} onChange={(event) => {
      const next = event.target.value;
      onChange(manual || next === "" ? next : Number(next));
    }} /></Field>
    {allowExpressions && <><span id={contextId} className="visually-hidden">For {label}</span><Button type="button" variant="ghost" aria-describedby={contextId} disabled={manual && value !== "" && !isNumber} onClick={() => {
      if (manual && isNumber) onChange(Number(value));
      setExpressionMode(!manual);
    }}>{manual ? "Use fixed number" : "Enter expression"}</Button></>}
    {configured && value === "" && fallbackValue !== undefined && <><small>Enter a number or use the default setting.</small><Button type="button" variant="ghost" onClick={() => { onChange(undefined); setExpressionMode(false); }}>Use default</Button></>}
    {value === "" && fallbackValue === undefined && <small>Enter a value.</small>}
    {manual && <small>{allowExpressions ? "Enter an expression, or replace it with a number before switching back." : "Review this saved value in Advanced. This trigger field does not support expressions."}</small>}
  </div>;
}

function readConfigurationFieldValue(config: Record<string, unknown>, field: NodeConfigurationField) {
  const value = config[field.key];
  if (field.kind === "mongo-filter") return value === undefined ? "{}" : value && typeof value === "object" ? JSON.stringify(value, null, 2) : readConfigText(config, field.key);
  return field.key === "embeds" && value && typeof value === "object"
    ? JSON.stringify(value, null, 2)
    : readConfigText(config, field.key);
}

function readKeyValueRows(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [] as Array<{ key: string; value: string }>;
  return Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => ({ key, value: String(entryValue ?? "") }));
}

function KeyValueField({ label, value, keyPlaceholder = "Key", valuePlaceholder = "Value", onChange }: {
  label: string;
  value: unknown;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  onChange: (value: Record<string, string>) => void;
}) {
  const rows = readKeyValueRows(value);
  const updateRow = (index: number, next: Partial<{ key: string; value: string }>) => {
    const nextRows = rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...next } : row);
    onChange(Object.fromEntries(nextRows.map((row) => [row.key, row.value])));
  };
  const addRow = () => {
    let nextKey = `header-${rows.length + 1}`;
    let suffix = rows.length + 1;
    while (rows.some((row) => row.key === nextKey)) nextKey = `header-${++suffix}`;
    onChange(Object.fromEntries([...rows, { key: nextKey, value: "" }].map((row) => [row.key, row.value])));
  };
  const removeRow = (index: number) => onChange(Object.fromEntries(rows.filter((_, rowIndex) => rowIndex !== index).map((row) => [row.key, row.value])));

  return (
    <Field label={label} className="config-field key-value-field">
      <div className="key-value-field__rows">
        {rows.map((row, index) => (
          <div className="key-value-field__row" key={`${row.key}-${index}`}>
            <input aria-label={`${label} ${keyPlaceholder} ${index + 1}`} placeholder={keyPlaceholder} value={row.key} onChange={(event) => updateRow(index, { key: event.target.value })} />
            <input aria-label={`${label} ${valuePlaceholder} ${index + 1}`} placeholder={valuePlaceholder} value={row.value} onChange={(event) => updateRow(index, { value: event.target.value })} />
            <button className="key-value-field__remove" type="button" aria-label={`Remove ${label} row ${index + 1}`} onClick={() => removeRow(index)}>Remove</button>
          </div>
        ))}
      </div>
      <button className="ghost-button key-value-field__add" type="button" onClick={addRow}>Add header</button>
      <small>Use the connection for authentication when possible. Header values are stored in the workflow configuration.</small>
    </Field>
  );
}

function readTableRows(value: unknown) {
  const rows = Array.isArray(value)
    ? value.filter((row): row is unknown[] => Array.isArray(row)).map((row) => [...row])
    : [];
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return (rows.length ? rows : [[]]).map((row) => [...row, ...Array.from({ length: Math.max(0, columnCount - row.length) }, () => "")]);
}

function TableField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: unknown[][]) => void }) {
  const rows = readTableRows(value);
  const columnCount = rows[0]?.length ?? 1;
  const updateCell = (rowIndex: number, columnIndex: number, cellValue: string) => {
    onChange(rows.map((row, currentRow) => currentRow === rowIndex ? row.map((cell, currentColumn) => currentColumn === columnIndex ? cellValue : cell) : row));
  };
  const addRow = () => onChange([...rows, Array.from({ length: columnCount }, () => "")]);
  const removeRow = (rowIndex: number) => onChange(rows.length === 1 ? [Array.from({ length: columnCount }, () => "")] : rows.filter((_, currentRow) => currentRow !== rowIndex));
  const addColumn = () => onChange(rows.map((row) => [...row, ""]));
  const removeColumn = () => onChange(columnCount === 1 ? rows : rows.map((row) => row.slice(0, -1)));

  return (
    <Field label={label} className="config-field table-field">
      <div className="table-field__scroll">
        <table className="table-field__table"><tbody>{rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>
          {row.map((cell, columnIndex) => <td key={`cell-${rowIndex}-${columnIndex}`}><input aria-label={`${label} row ${rowIndex + 1} column ${columnIndex + 1}`} value={cell == null ? "" : typeof cell === "object" ? JSON.stringify(cell) : String(cell)} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} /></td>)}
          <td><button className="table-field__remove" type="button" aria-label={`Remove ${label} row ${rowIndex + 1}`} onClick={() => removeRow(rowIndex)}>Remove</button></td>
        </tr>)}</tbody></table>
      </div>
      <div className="table-field__actions"><button className="ghost-button" type="button" onClick={addRow}>Add row</button><button className="ghost-button" type="button" onClick={addColumn}>Add column</button><button className="ghost-button" type="button" onClick={removeColumn} disabled={columnCount === 1}>Remove column</button></div>
      <small>Values are sent as rows and columns. Map dynamic values later through expressions when needed.</small>
    </Field>
  );
}

function DateTimeField({ label, value, allowExpressions, onChange }: { label: string; value: string; allowExpressions: boolean; onChange: (value: string) => void }) {
  const [manual, setManual] = useState(value.includes("{{"));
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  const precision = date.getMilliseconds() ? `:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}` : date.getSeconds() ? `:${pad(date.getSeconds())}` : "";
  const local = mounted && value && Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}${precision}` : "";
  return <Field label={label} className="config-field">
    {manual ? <input aria-label={label} value={value} placeholder="ISO time or expression" onChange={(event) => onChange(event.target.value)} /> : <input aria-label={label} type="datetime-local" step="0.001" value={local} onChange={(event) => { const next = new Date(event.target.value); onChange(event.target.value && Number.isFinite(next.getTime()) ? next.toISOString() : ""); }} />}
    <small>{manual ? "Use an ISO 8601 timestamp with timezone or an expression." : "Uses your device time zone and stores the time in UTC."}</small>
    {allowExpressions && <Button type="button" variant="ghost" onClick={() => setManual((previous) => !previous)}>{manual ? "Choose date and time" : "Enter value or expression"}</Button>}
  </Field>;
}

function RowValuesField({ value, onChange, workspaceId, workflowId, nodeId, owner, credentials, config }: { value: unknown; onChange: (value: Array<{ column: string; type: string; value: string }>) => void; workspaceId: string; workflowId: string; nodeId: string; owner: boolean; credentials: CredentialSummary[]; config: Record<string, unknown> }) {
  const listId = useId();
  const { metadata, loading, eligible } = useRelationalMetadata({ provider: "supabase", workspaceId, workflowId, nodeId, owner, credentials, credentialId: readConfigText(config, "credentialId"), table: readConfigText(config, "table"), schema: "" });
  const rows = Array.isArray(value) ? value.map((entry) => {
    const row = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
    return { column: typeof row.column === "string" ? row.column : "", type: typeof row.type === "string" ? row.type : "text", value: typeof row.value === "string" ? row.value : row.value == null ? "" : String(row.value) };
  }) : [];
  const update = (index: number, patch: Partial<(typeof rows)[number]>) => onChange(rows.map((row, current) => current === index ? { ...row, ...patch } : row));
  return <div className="config-field mongo-filter">
    <strong>Row values</strong>
    <small>Enter one value per column. Other columns use their database defaults. Write permission and row-level security apply. Changing the connection or table clears these values.</small>
    <small role="status">{loading ? "Loading columns…" : metadata.status === "available" ? metadata.partial ? "Some columns may be missing. You can also enter an exact column name." : "Choose a suggested column or enter its exact name." : eligible ? "Column suggestions are unavailable. Enter exact column names." : "Choose a connection and table to load column suggestions, or enter names manually."}</small>
    {metadata.status === "available" && <datalist id={listId}>{metadata.columns.map((column) => <option key={column.value} value={column.value}>{column.label}</option>)}</datalist>}
    {rows.map((row, index) => <div className="mongo-filter__condition" key={index}>
      <div className="mongo-filter__row-heading"><strong>Column {index + 1}</strong><Button type="button" variant="ghost" aria-label={`Remove column ${index + 1}`} onClick={() => onChange(rows.filter((_, current) => current !== index))}>Remove</Button></div>
      <Field label="Column name"><input aria-label={`Column ${index + 1} name`} list={metadata.status === "available" ? listId : undefined} value={row.column} placeholder="Choose or enter a column" onChange={(event) => update(index, { column: event.target.value })} /></Field>
      <Field label="Value type"><Select aria-label={`Column ${index + 1} type`} value={row.type} onChange={(event) => update(index, { type: event.target.value, value: event.target.value === "boolean" ? "true" : "" })}><option value="text">Text</option><option value="number">Number</option><option value="boolean">True / false</option><option value="null">Null</option><option value="expression">Value from a previous step</option></Select></Field>
      {row.type !== "null" && <Field label="Value">{row.type === "boolean" ? <Select aria-label={`Column ${index + 1} value`} value={row.value} onChange={(event) => update(index, { value: event.target.value })}><option value="true">True</option><option value="false">False</option></Select> : <input aria-label={`Column ${index + 1} value`} value={row.value} placeholder={row.type === "expression" ? "{{ steps.example.output.value }}" : row.type === "number" ? "e.g. 42" : "Enter text"} onChange={(event) => update(index, { value: event.target.value })} />}</Field>}
    </div>)}
    <Button type="button" variant="ghost" disabled={rows.length >= 50} onClick={() => onChange([...rows, { column: "", type: "text", value: "" }])}>Add column</Button>
    <small>Use text for exact high-precision numbers. A connection error after sending may mean the row was inserted; check the table before retrying.</small>
  </div>;
}

function NodeConfigurationFields({ fields, config, credentials, workspaceId, workflowId, nodeId, owner, allowExpressions, onChange, draft, onDraftChange }: {
  fields: NodeConfigurationField[];
  config: Record<string, unknown>;
  credentials: CredentialSummary[];
  workspaceId: string;
  workflowId: string;
  nodeId: string;
  owner: boolean;
  allowExpressions: boolean;
  onChange: (key: string, value: unknown) => void;
  draft: InspectorDraft;
  onDraftChange: UpdateInspectorDraft;
}) {
  return <>
    {fields.map((field) => {
      const expectedValue = field.visibleWhen?.equals;
      const currentValue = field.visibleWhen ? config[field.visibleWhen.key] ?? field.visibleWhen.fallback : undefined;
      if (expectedValue !== undefined && !(Array.isArray(expectedValue) ? expectedValue.includes(currentValue as never) : currentValue === expectedValue)) return null;
      const value = readConfigurationFieldValue(config, field);
      if (field.kind === "credential") {
        return <CredentialField key={field.key} label={field.label} value={value} providers={field.providers} credentials={credentials} onChange={(nextValue) => onChange(field.key, nextValue)} optional={field.optional} />;
      }
      if (field.kind === "boolean") {
        const stored = config[field.key];
        const mixed = stored !== undefined && typeof stored !== "boolean";
        return <div key={field.key}><label className="checkbox-field"><input type="checkbox" checked={mixed ? false : stored === undefined ? field.defaultChecked ?? true : stored === true} aria-checked={mixed ? "mixed" : undefined} ref={(input) => { if (input) input.indeterminate = mixed; }} onChange={(event) => onChange(field.key, event.target.checked)} /> {field.label}</label>{mixed && <small role="status">The saved value is not a true/false literal. Review it in Advanced; selecting this checkbox replaces it.</small>}</div>;
      }
      if (field.kind === "datetime") return <DateTimeField key={field.key} label={field.label} value={value} allowExpressions={allowExpressions} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      if (field.kind === "text" && field.advanced) return <details key={field.key} className="config-field"><summary>{field.advanced.summary}</summary><ConfigField label={field.label} value={value} onChange={(nextValue) => onChange(field.key, nextValue)} /><small>{field.advanced.help}</small></details>;
      if (field.kind === "number") {
        const input = <NumericConfigField label={field.label} value={value} configured={Object.hasOwn(config, field.key)} fallbackValue={field.fallbackValue} allowExpressions={allowExpressions} onChange={(nextValue) => onChange(field.key, nextValue)} />;
        return field.advanced ? <details key={field.key} className="config-field"><summary>{field.advanced.summary}</summary>{input}<small>{field.advanced.help}</small></details> : <div key={field.key}>{input}</div>;
      }
      if (field.kind === "resource") {
        return <ResourcePicker key={field.key} workspaceId={workspaceId} resource={field.resource} credentialId={readConfigText(config, field.credentialKey)} dependencyValue={field.dependencyKey ? readConfigText(config, field.dependencyKey) : undefined} secondaryDependencyValue={field.secondaryDependencyKey ? readConfigText(config, field.secondaryDependencyKey) : undefined} resourceVariant={["notion-source-property", "notion-source-option"].includes(field.resource) ? readConfigText(config, "filterMode") : undefined} label={field.label} value={value} placeholder={field.placeholder} allowExpression={allowExpressions} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      }
      if (field.kind === "select") {
        const selectValue = !Object.hasOwn(config, field.key) && field.fallbackValue !== undefined ? field.fallbackValue : value;
        const knownValue = field.options.some((option) => option.value === selectValue);
        return <Field key={field.key} label={field.label} className="config-field"><Select aria-label={field.label} value={selectValue} onChange={(event) => onChange(field.key, event.target.value)}>{!knownValue && <option value={selectValue} disabled>{selectValue ? "Saved value is not in this list" : "Not set — select an option"}</option>}{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>;
      }
      if (field.kind === "key-value") {
        return <KeyValueField key={field.key} label={field.label} value={config[field.key]} keyPlaceholder={field.keyPlaceholder} valuePlaceholder={field.valuePlaceholder} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      }
      if (field.kind === "table") {
        return <TableField key={field.key} label={field.label} value={config[field.key]} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      }
      if (field.kind === "structured-output") return <section key={field.key} className="config-field">
        <label className="checkbox-field"><input type="checkbox" checked={config[field.key] !== undefined} disabled={draft.structuredOutput !== undefined} onChange={(event) => onChange(field.key, event.target.checked ? { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false } : undefined)} /> {field.label}</label>
        <small>When enabled, the validated result is available in the node output as <code>json</code>; <code>text</code> contains its JSON text. Model support and cost depend on the provider. Token usage appears only when the provider supplies valid usage data.</small>
        <small>Use a text field for identifiers or numbers that must retain exact high precision.</small>
        {config[field.key] !== undefined && <StructuredOutputField value={config[field.key]} onChange={(schema) => onChange(field.key, schema)} draft={draft.structuredOutput} onDraftChange={(next) => onDraftChange("structuredOutput", next)} />}
      </section>;
      if (field.kind === "mongo-filter") return <MongoFilterField key={field.key} value={value} draft={draft.filter} onDraftChange={(next) => onDraftChange("filter", next)} rawDraft={draft.filterRaw} onRawDraftChange={(next) => onDraftChange("filterRaw", next)} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      if (field.kind === "drive-search") return <DriveSearchField key={field.key} value={value} workspaceId={workspaceId} credentialId={readConfigText(config, "credentialId")} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      if (field.kind === "row-values") return <RowValuesField key={field.key} value={config[field.key]} workspaceId={workspaceId} workflowId={workflowId} nodeId={nodeId} owner={owner} credentials={credentials} config={config} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      return <ConfigField
        key={field.key}
        label={field.label}
        value={value}
        multiline={field.kind === "textarea"}
        onChange={(nextValue) => onChange(field.key, nextValue)}
      />;
    })}
  </>;
}

function CredentialField({ label, value, providers, credentials, onChange, optional = false }: {
  label: string;
  value: string;
  providers: CredentialProvider[];
  credentials: CredentialSummary[];
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  const compatibleCredentials = credentials.filter((credential) => providers.includes(credential.provider));
  const selectedIsCompatible = !value || compatibleCredentials.some((credential) => credential.id === value);
  return (
    <Field label={label} className="config-field credential-field">
      <Select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{optional ? "No credential" : "Select a credential"}</option>
        {!selectedIsCompatible && <option value={value}>Unavailable credential</option>}
        {compatibleCredentials.map((credential) => <option key={credential.id} value={credential.id}>{credential.label}</option>)}
      </Select>
      {compatibleCredentials.length === 0 && <small>No compatible connection yet. Open Manage → Credentials to add one.</small>}
    </Field>
  );
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector-section" aria-label={title}>
      <p className="inspector-section__title">{title}</p>
      <div className="inspector-section__content">{children}</div>
    </section>
  );
}

function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  return <Menu label={label} className="action-menu" contentClassName="action-menu__content">{children}</Menu>;
}

type ResultViewMode = "tree" | "table" | "raw";

function JsonTree({ value }: { value: unknown }) {
  if (value === null || typeof value !== "object") return <span className="json-tree__value">{String(value)}</span>;
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value as Record<string, unknown>);
  return <ul className="json-tree">{entries.map(([key, child]) => <li key={key}><strong>{key}</strong>{child !== null && typeof child === "object" ? <JsonTree value={child} /> : <span className="json-tree__value">: {String(child)}</span>}</li>)}</ul>;
}

// Large provider responses can contain thousands of nested values. Render only
// expanded branches and a bounded page of entries so inspecting a run remains responsive.
function LargeJsonTree({ value, initiallyOpen = false }: { value: unknown; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [visible, setVisible] = useState(50);
  if (value === null || typeof value !== "object") {
    const text = String(value);
    return <span className="json-tree__value">{text.length > 1000 ? `${text.slice(0, 1000)}…` : text}</span>;
  }
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value as Record<string, unknown>);
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{Array.isArray(value) ? `Array · ${entries.length} items` : `Object · ${entries.length} fields`}</summary>{open && <ul className="json-tree">{entries.slice(0, visible).map(([key, child]) => <li key={key}><strong>{key}</strong> <LargeJsonTree value={child} /></li>)}{visible < entries.length && <li><button type="button" onClick={() => setVisible((count) => count + 50)}>Show more ({entries.length - visible} remaining)</button></li>}</ul>}</details>;
}

function ResultView({ value }: { value: unknown }) {
  const [mode, setMode] = useState<ResultViewMode>("tree");
  const serialized = JSON.stringify(value);
  const isLarge = (serialized?.length ?? 0) > 100_000;
  const rows: Array<[string, unknown]> = value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [["value", value]];
  return (
    <div className="result-view">
      <div className="result-view__tabs" role="tablist" aria-label="Execution output format">
        {(["tree", "table", "raw"] as ResultViewMode[]).map((view) => <button key={view} className={mode === view ? "result-view__tab result-view__tab--active" : "result-view__tab"} type="button" onClick={() => setMode(view)}>{view === "raw" ? "Raw JSON" : view === "tree" ? "Tree" : "Table"}</button>)}
      </div>
      {mode === "tree" && (isLarge ? <><p>Large output: expand individual sections to explore. Raw JSON contains the complete data.</p><LargeJsonTree value={value} initiallyOpen /></> : <JsonTree value={value} />)}
      {mode === "table" && <div className="result-view__table-wrap"><table><tbody>{rows.map(([key, item]) => <tr key={key}><th>{key}</th><td>{typeof item === "string" ? item : JSON.stringify(item)}</td></tr>)}</tbody></table></div>}
      {mode === "raw" && <pre>{JSON.stringify(value, null, 2)}</pre>}
    </div>
  );
}

function JsonConfigEditor({ config, onApply, draft, onDraftChange, otherPending }: { config: Record<string, unknown>; onApply: (config: Record<string, unknown>) => void; draft?: StagedText; onDraftChange: (draft: StagedText | undefined) => void; otherPending: boolean }) {
  const baseline = JSON.stringify(config, null, 2);
  const text = draft?.text ?? baseline;
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    try {
      if (otherPending) throw new Error("Apply or discard the other pending edits for this node first.");
      if (draft && draft.baseline !== baseline) throw new Error("Configuration changed elsewhere. Discard this edit and try again to avoid overwriting it.");
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Configuration must be a JSON object.");
      onApply(parsed as Record<string, unknown>);
      onDraftChange(undefined);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Configuration is not valid JSON.");
    }
  };

  return <section className="json-config-editor"><div className="section-label">JSON CONFIGURATION</div><textarea value={text} onChange={(event) => onDraftChange(event.target.value === baseline ? undefined : { text: event.target.value, baseline: draft?.baseline ?? baseline })} rows={7} aria-label="Node JSON configuration" /><button className="ghost-button" type="button" onClick={apply}>Apply JSON</button>{draft && <button className="ghost-button" type="button" onClick={() => { onDraftChange(undefined); setError(null); }}>Discard JSON changes</button>}{error && <p role="alert">{error}</p>}</section>;
}

function TestDataEditor({ value, onApply, draft, onDraftChange }: { value: unknown; onApply: (value: Record<string, unknown>) => void; draft?: StagedText; onDraftChange: (draft: StagedText | undefined) => void }) {
  const baseline = JSON.stringify(value ?? {}, null, 2);
  const text = draft?.text ?? baseline;
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    try {
      if (draft && draft.baseline !== baseline) throw new Error("Test data changed elsewhere. Discard this edit and try again.");
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Test data must be a JSON object.");
      onApply(parsed as Record<string, unknown>);
      onDraftChange(undefined);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Test data is not valid JSON.");
    }
  };
  return <section className="json-config-editor"><div className="section-label">TEST DATA FOR MOCK RUN</div><textarea value={text} onChange={(event) => onDraftChange(event.target.value === baseline ? undefined : { text: event.target.value, baseline: draft?.baseline ?? baseline })} rows={6} aria-label="Manual trigger test data" /><button className="ghost-button" type="button" onClick={apply}>Apply test data</button>{draft && <button className="ghost-button" type="button" onClick={() => { onDraftChange(undefined); setError(null); }}>Discard test data changes</button>}{error && <p role="alert">{error}</p>}</section>;
}

function ExpressionSuggestions({ suggestions, possible }: { suggestions: string[]; possible: string[] }) {
  const [notice, setNotice] = useState("");
  if (!suggestions.length && !possible.length) return null;
  const copy = async (suggestion: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(suggestion);
      setNotice("Path copied.");
    } catch {
      setNotice("Could not copy. Allow clipboard access and try again.");
    }
  };
  return <section className="expression-suggestions"><div className="section-label">EXPRESSION SUGGESTIONS</div><p>Click a path to copy it. Fields depend on the selected operation and on which branches run.</p>{suggestions.length > 0 && <><strong>From the last run</strong><div>{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { void copy(suggestion); }}>{suggestion}</button>)}</div></>}{possible.length > 0 && <><strong>Possible fields</strong><div>{possible.map((suggestion) => <button key={suggestion} type="button" onClick={() => { void copy(suggestion); }}>{suggestion}</button>)}</div></>}{notice && <small>{notice}</small>}</section>;
}

function SwitchCaseEditor({ cases, onChange }: { cases: unknown; onChange: (cases: Array<{ value: string }>) => void }) {
  const normalized = Array.isArray(cases)
    ? cases.flatMap((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof (candidate as Record<string, unknown>).value === "string" ? [{ value: (candidate as Record<string, unknown>).value as string }] : [])
    : [];
  const update = (index: number, value: string) => onChange(normalized.map((candidate, candidateIndex) => candidateIndex === index ? { value } : candidate));
  return <section className="switch-case-editor"><div className="section-label">SWITCH CASES</div><p>Each case branch is assigned to the next unused value when you connect it.</p>{normalized.map((candidate, index) => <div key={`${candidate.value}-${index}`}><input aria-label={`Switch case ${index + 1}`} value={candidate.value} onChange={(event) => update(index, event.target.value)} /><button type="button" onClick={() => onChange(normalized.filter((_, candidateIndex) => candidateIndex !== index))}>Remove</button></div>)}<button className="ghost-button" type="button" onClick={() => onChange([...normalized, { value: `case-${normalized.length + 1}` }])}>Add case</button></section>;
}

function WorkflowHistoryPanel({ versions, loading, onClose }: { versions: WorkflowVersionSummary[]; loading: boolean; onClose: () => void }) {
  return <Dialog label="Workflow version history" className="workflow-history" modal={false} onClose={onClose}><DialogHeader eyebrow="VERSION HISTORY" title="Immutable releases" onClose={onClose} closeLabel="Close workflow history" />{loading ? <p>Loading versions…</p> : <ol>{versions.map((version) => <li key={version.id}><strong>v{version.version} · {version.status.toLowerCase()}</strong><span>{version.nodeCount} nodes · {version.publishedAt ? `published ${new Date(version.publishedAt).toLocaleString()}` : `draft ${new Date(version.createdAt).toLocaleString()}`}</span></li>)}</ol>}</Dialog>;
}

function GraphValidationPanel({ issues, onClose }: { issues: ReturnType<typeof validateWorkflowGraph>; onClose: () => void }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return (
    <Dialog label="Workflow validation details" className="graph-validation-panel" modal={false} onClose={onClose}>
      <div className="credential-panel__heading">
        <div>
          <p className="section-label">LIVE VALIDATION</p>
          <h2>{errors.length ? "Fix these before saving" : "Graph checks"}</h2>
        </div>
        <IconButton label="Close validation details" className="icon-button" onClick={onClose}>×</IconButton>
      </div>
      {errors.length === 0 && warnings.length === 0 ? <p className="graph-validation-panel__ready">Your graph is ready for a test run.</p> : <>
        {errors.length > 0 && <div className="graph-validation-panel__group"><strong>{errors.length} error{errors.length === 1 ? "" : "s"}</strong><ul>{errors.map((issue, index) => <li key={`error-${index}`} className="graph-validation-panel__issue graph-validation-panel__issue--error">{issue.message}</li>)}</ul></div>}
        {warnings.length > 0 && <div className="graph-validation-panel__group"><strong>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</strong><ul>{warnings.map((issue, index) => <li key={`warning-${index}`} className="graph-validation-panel__issue graph-validation-panel__issue--warning">{issue.message}</li>)}</ul></div>}
      </>}
    </Dialog>
  );
}

function LiveReadinessBlockers({ readiness, onOpenCredentials, activation = false }: { readiness: LiveReadiness; onOpenCredentials: () => void; activation?: boolean }) {
  const blockers = readiness.requirements.filter((requirement) => !requirement.ready);
  const unavailable = readiness.unavailableNodes ?? [];
  return <div className="go-live-panel__blockers">
    {unavailable.length > 0 && <><Status tone="error" className="go-live-panel__readiness">Remove unavailable nodes and publish a new version before going live.</Status><ul>{unavailable.map((node) => <li key={node.nodeId}><strong>{node.type}</strong><span>Node {node.nodeId} is not available yet.</span></li>)}</ul></>}
    {blockers.length > 0 && <><Status tone="error" className="go-live-panel__readiness">{activation ? "Activation is blocked until these integrations are configured." : "Live execution is blocked until these integrations are configured."}</Status><ul>{blockers.map((requirement) => <li key={requirement.nodeId}><strong>{providerLabel(requirement.provider)}</strong><span>{reasonLabel(requirement.reason)}</span></li>)}</ul><Button variant="ghost" onClick={onOpenCredentials}>Open credentials</Button></>}
  </div>;
}

function GoLivePanel({ workflow, isRunning, readiness, loading, error, onConfirm, onClose, onRefresh, onOpenCredentials }: { workflow: ApiWorkflow; isRunning: boolean; readiness: LiveReadiness | null; loading: boolean; error: string | null; onConfirm: () => void; onClose: () => void; onRefresh: () => void; onOpenCredentials: () => void }) {
  const canRun = Boolean(workflow.published && readiness?.ready && !loading && !error && !isRunning);
  return <Dialog label="Confirm live execution" className="go-live-panel" onClose={onClose}><DialogHeader eyebrow="LIVE EXECUTION" title="Run the published workflow?" onClose={onClose} closeLabel="Close live execution confirmation" /><p>This will call real providers and may send messages, write data, or create external side effects. The editor will run <strong>published version {workflow.published?.version ?? "—"}</strong>, never unsaved draft changes.</p>{!workflow.published && <p className="go-live-panel__warning">Publish this workflow first. Test runs stay safe and use deterministic mock providers.</p>}{loading && <Status tone="info" className="go-live-panel__readiness" aria-busy="true"><LoaderCircle className="ui-spinner" size={15} /> Checking live credentials…</Status>}{error && <Status tone="error" className="go-live-panel__readiness">{error} <Button variant="ghost" onClick={onRefresh}>Retry check</Button></Status>}{!loading && !error && readiness?.ready && <Status tone="success" className="go-live-panel__readiness">Required live credentials are configured.</Status>}{!loading && !error && readiness && !readiness.ready && <LiveReadinessBlockers readiness={readiness} onOpenCredentials={onOpenCredentials} />}<div className="go-live-panel__actions"><Button variant="ghost" className="ghost-button" onClick={onClose}>Cancel</Button><Button variant="secondary" className="go-live-button" disabled={!canRun} onClick={onConfirm}>{isRunning ? "Starting…" : "Run live now"}</Button></div></Dialog>;
}

function RetryExecutionPanel({ execution, isRetrying, onConfirm, onClose }: { execution: ApiExecution; isRetrying: boolean; onConfirm: () => void; onClose: () => void }) {
  const isLive = execution.mode === "live";
  return <Dialog label={isLive ? "Confirm live retry" : "Retry execution"} className="go-live-panel" onClose={onClose}><DialogHeader eyebrow="RETRY EXECUTION" title={isLive ? "Retry this live execution?" : "Retry this test execution?"} onClose={onClose} closeLabel="Close retry confirmation" /><p>This creates a new execution from the original immutable workflow version and its original redacted trigger data.</p>{isLive ? <p className="go-live-panel__warning">This calls real providers again. A previous request may already have been accepted before the failure was recorded, so external delivery can be duplicated.</p> : <Status tone="info" className="go-live-panel__readiness">This remains a deterministic mock run and will not call an external provider.</Status>}<div className="go-live-panel__actions"><Button variant="ghost" className="ghost-button" disabled={isRetrying} onClick={onClose}>Cancel</Button><Button variant={isLive ? "secondary" : "primary"} disabled={isRetrying} onClick={onConfirm}>{isRetrying ? "Starting…" : isLive ? "Retry live run" : "Retry test run"}</Button></div></Dialog>;
}

function WorkflowActivationPanel({ workflow, isSaving, readiness, loading, error, onConfirm, onClose, onRefresh, onOpenCredentials }: { workflow: ApiWorkflow; isSaving: boolean; readiness: LiveReadiness | null; loading: boolean; error: string | null; onConfirm: () => void; onClose: () => void; onRefresh: () => void; onOpenCredentials: () => void }) {
  const isDeactivation = workflow.isActive;
  const canConfirm = isDeactivation || Boolean(workflow.published && readiness?.ready && !loading && !error && !isSaving);
  const hasGmailTrigger = workflow.published?.graph.nodes.some((node) => node.type === "trigger.gmail");
  const hasRssTrigger = workflow.published?.graph.nodes.some((node) => node.type === "trigger.rss.new-item");
  const hasVercelTrigger = workflow.published?.graph.nodes.some((node) => node.type === "trigger.vercel.deployment");
  const hasTrelloTrigger = workflow.published?.graph.nodes.some((node) => node.type === "trigger.trello.board-action");
  const hasSentryTrigger = workflow.published?.graph.nodes.some((node) => node.type === "trigger.sentry.issue-created");
  const hasTelegramTrigger = workflow.published?.graph.nodes.some((node) => node.type === "trigger.telegram.update");
  return <Dialog label={isDeactivation ? "Deactivate workflow" : "Activate workflow"} className="go-live-panel" onClose={onClose}><DialogHeader eyebrow="WORKFLOW ACTIVATION" title={isDeactivation ? "Deactivate this workflow?" : "Activate this workflow?"} onClose={onClose} closeLabel="Close workflow activation" />{isDeactivation ? <p>Scheduled checks and incoming webhook triggers stop accepting new work. Already accepted executions may still start or finish.</p> : <p>Activation enables the published trigger, including schedules, polling, or webhooks where configured. It does not start a manual run now; use <strong>Run live</strong> for an immediate provider call.</p>}{hasGmailTrigger && <p>{isDeactivation ? "When reactivated, Gmail may process messages received while inactive if its saved history is available." : "The first activation starts from the current Gmail checkpoint. Reactivation resumes the saved checkpoint when available."}</p>}{hasRssTrigger && <p>{isDeactivation ? "RSS items that disappear from the feed while inactive may be missed." : "The first activation records the current RSS feed; existing items do not start a run. Reactivation resumes the saved checkpoint when available."}</p>}{!isDeactivation && !workflow.published && <p className="go-live-panel__warning">Publish this workflow first.</p>}{!isDeactivation && loading && <Status tone="info" className="go-live-panel__readiness" aria-busy="true"><LoaderCircle className="ui-spinner" size={15} /> Checking live credentials…</Status>}{!isDeactivation && error && <Status tone="error" className="go-live-panel__readiness">{error} <Button variant="ghost" onClick={onRefresh}>Retry check</Button></Status>}{!isDeactivation && !loading && !error && readiness?.ready && <Status tone="success" className="go-live-panel__readiness">Required live credentials are configured.</Status>}{!isDeactivation && hasTelegramTrigger && <Status tone="info" className="go-live-panel__readiness">Telegram delivery requires a Fluxora endpoint and a webhook configured on the bot. Fluxora does not register or verify that webhook. Telegram allows one webhook per bot; configuring a new one replaces the existing webhook.</Status>}{!isDeactivation && hasVercelTrigger && <Status tone="info" className="go-live-panel__readiness">Vercel delivery also requires a matching account webhook and signing secret. Fluxora cannot verify the remote webhook; check its setup and delivery status in Vercel.</Status>}{!isDeactivation && hasTrelloTrigger && <Status tone="info" className="go-live-panel__readiness">Trello delivery requires the app secret and an externally registered webhook for the selected board. Fluxora cannot verify the remote webhook; check its setup in Trello.</Status>}{!isDeactivation && hasSentryTrigger && <Status tone="info" className="go-live-panel__readiness">Sentry delivery requires a custom integration with a matching installation and client secret. Fluxora cannot verify the remote integration.</Status>}{!isDeactivation && !loading && !error && readiness && !readiness.ready && <LiveReadinessBlockers readiness={readiness} onOpenCredentials={onOpenCredentials} activation />}<div className="go-live-panel__actions"><Button variant="ghost" className="ghost-button" onClick={onClose} disabled={isSaving}>Cancel</Button><Button variant={isDeactivation ? "danger" : "primary"} disabled={!canConfirm} onClick={onConfirm}>{isSaving ? "Working…" : isDeactivation ? "Deactivate workflow" : "Activate workflow"}</Button></div></Dialog>;
}

function WebhookEndpointPanel({ workflow, config, isGitHub, isUptimeKuma, isTelegram, isVercel, isTrello, isSentry, canRegister, onClose }: { workflow: ApiWorkflow; config: Record<string, unknown>; isGitHub: boolean; isUptimeKuma: boolean; isTelegram: boolean; isVercel: boolean; isTrello: boolean; isSentry: boolean; canRegister: boolean; onClose: () => void }) {
  const [path, setPath] = useState(() => readConfigText(config, "path") || (isTelegram || isVercel || isTrello || isSentry ? `${isTelegram ? "telegram" : isVercel ? "vercel" : isTrello ? "trello" : "sentry"}-${workflow.id.replace(/[^a-z0-9-]/gi, "").slice(0, 60)}` : ""));
  const [signingSecret, setSigningSecret] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [secretRequired, setSecretRequired] = useState(config.secretRequired !== false);
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState("Loading endpoint status…");
  const [isSaving, setIsSaving] = useState(false);
  const [endpointLoading, setEndpointLoading] = useState(true);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [endpointRetry, setEndpointRetry] = useState(0);
  const [providerWebhook, setProviderWebhook] = useState<ProviderWebhookStatus | null>(null);
  const [providerWebhookError, setProviderWebhookError] = useState<string | null>(null);
  const [providerWebhookAction, setProviderWebhookAction] = useState<"connect" | "disconnect" | "reconcile" | null>(null);
  const [confirmProviderDisconnect, setConfirmProviderDisconnect] = useState(false);
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [writeUncertain, setWriteUncertain] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const endpointUrl = `${apiUrl}/webhooks/${path}`;
  const validPath = /^[a-z0-9][a-z0-9-]{2,80}$/i.test(path);
  const trelloCallback = callbackUrl || (endpointUrl.startsWith("https://") ? endpointUrl : "");
  let validTrelloCallback = false;
  try { const url = new URL(trelloCallback); validTrelloCallback = url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash && url.toString() === trelloCallback && url.pathname.endsWith(`/webhooks/${path}`); } catch { /* The callback is incomplete. */ }
  const githubEvent = readConfigText(config, "event") || "issues";
  const githubAction = readConfigText(config, "action");
  const githubEventLabel = githubAction ? `${githubEvent}.${githubAction}` : githubEvent;

  useEffect(() => {
    let isCurrent = true;
    setEndpointLoading(true);
    setEndpointError(null);
    const providerRequest = isGitHub ? apiRequest<{ providerWebhook: ProviderWebhookStatus }>(`/workflows/${workflow.id}/provider-webhook`) : Promise.resolve(null);
    void Promise.all([apiRequest<{ endpoint: WebhookEndpoint | null }>(`/workflows/${workflow.id}/webhook-endpoint`), providerRequest])
      .then(([response, providerResponse]) => { if (isCurrent) { setEndpoint(response.endpoint); if (response.endpoint) { setPath(response.endpoint.path); if (isTrello && response.endpoint.callbackUrl) setCallbackUrl(response.endpoint.callbackUrl); } setProviderWebhook(providerResponse?.providerWebhook ?? null); setProviderWebhookError(null); setNotice(response.endpoint ? isGitHub && response.endpoint.signingMode === "legacy" ? "Existing registration uses the connection’s legacy secret. It will keep working until you rotate it." : "An active endpoint is pinned to a published version." : "No endpoint has been created yet."); } })
      .catch((reason) => { if (isCurrent) setEndpointError(reason instanceof Error ? reason.message : "Unable to load webhook status."); })
      .finally(() => { if (isCurrent) setEndpointLoading(false); });
    return () => { isCurrent = false; };
  }, [workflow.id, isGitHub, isTrello, endpointRetry]);

  const createEndpoint = async () => {
    setIsSaving(true);
    setCreatedSecret(null);
    setWriteError(null);
    try {
      const response = await apiRequest<{ endpoint: { id: string; path: string; secret: string | null; workflowVersionId: string; createdAt: string; updatedAt: string } }>(`/workflows/${workflow.id}/webhook-endpoint`, {
        method: "POST",
        body: JSON.stringify({ path, secretRequired: isUptimeKuma || isTelegram || isVercel || isTrello || isSentry || secretRequired, publishedVersionId: workflow.published?.id, expectedEndpoint: endpoint ? { id: endpoint.id, updatedAt: endpoint.updatedAt } : null, ...(isVercel || isTrello || isSentry ? { signingSecret } : {}), ...(isTrello ? { callbackUrl: trelloCallback } : {}) }),
      });
      setEndpoint({ id: response.endpoint.id, path: response.endpoint.path, secretRequired: isVercel || isTrello || isSentry || response.endpoint.secret !== null, workflowVersionId: response.endpoint.workflowVersionId, createdAt: response.endpoint.createdAt, updatedAt: response.endpoint.updatedAt, ...(isTrello ? { callbackUrl: trelloCallback } : {}) });
      setCreatedSecret(response.endpoint.secret);
      setSigningSecret("");
      setWriteUncertain(false);
      setNotice(isTrello ? "App secret saved. Create the matching board webhook in Trello using the exact callback URL." : isSentry ? "Client secret saved. Configure the matching custom integration in Sentry." : isVercel ? "Signing secret saved. Confirm the matching webhook is configured in Vercel." : response.endpoint.secret ? "Endpoint created. Copy the secret now; it will not be shown again." : "Endpoint created without a secret header.");
    } catch (reason) {
      setWriteUncertain(true);
      setWriteError(reason instanceof Error ? reason.message : "Unable to create the webhook endpoint.");
      setEndpointLoading(true);
      setEndpointRetry((value) => value + 1);
    } finally {
      setIsSaving(false);
    }
  };

  const connectProviderWebhook = async () => {
    setProviderWebhookAction("connect");
    setProviderWebhookError(null);
    try {
      const response = await apiRequest<{ providerWebhook: ProviderWebhookStatus }>(`/workflows/${workflow.id}/provider-webhook`, { method: "POST" });
      setProviderWebhook(response.providerWebhook);
      setNotice(response.providerWebhook.registration?.state === "ACTIVE" ? "GitHub webhook connected. Delivery is managed by Fluxora." : "GitHub webhook operation recorded.");
    } catch (reason) {
      setProviderWebhookError(reason instanceof Error ? reason.message : "Unable to connect the GitHub webhook.");
    } finally {
      setProviderWebhookAction(null);
    }
  };

  const disconnectProviderWebhook = async () => {
    setProviderWebhookAction("disconnect");
    setProviderWebhookError(null);
    try {
      const response = await apiRequest<{ providerWebhook: ProviderWebhookStatus }>(`/workflows/${workflow.id}/provider-webhook`, { method: "DELETE" });
      setProviderWebhook(response.providerWebhook);
      setConfirmProviderDisconnect(false);
      setNotice("GitHub webhook disconnected. The manual endpoint remains available.");
    } catch (reason) {
      setProviderWebhookError(reason instanceof Error ? reason.message : "Unable to disconnect the GitHub webhook.");
    } finally {
      setProviderWebhookAction(null);
    }
  };

  const reconcileProviderWebhook = async () => {
    setProviderWebhookAction("reconcile");
    setProviderWebhookError(null);
    try {
      const response = await apiRequest<{ providerWebhook: ProviderWebhookStatus }>(`/workflows/${workflow.id}/provider-webhook/reconcile`, { method: "POST" });
      setProviderWebhook(response.providerWebhook);
      setNotice(response.providerWebhook.reconciliation?.message ?? "GitHub webhook status checked.");
    } catch (reason) {
      setProviderWebhookError(reason instanceof Error ? reason.message : "Unable to verify the GitHub webhook.");
    } finally {
      setProviderWebhookAction(null);
    }
  };

  const registrationIsBusy = providerWebhook?.registration?.state === "CREATING" || providerWebhook?.registration?.state === "CREATE_DISPATCHING" || providerWebhook?.registration?.state === "DELETING";
  const reconciliationTone = providerWebhook?.reconciliation?.outcome === "MATCHED" ? "success" : providerWebhook?.reconciliation ? providerWebhook.reconciliation.outcome === "UNKNOWN" || providerWebhook.reconciliation.outcome === "MANUAL_REQUIRED" ? "warning" : "error" : "info";

  return <Dialog label="Webhook endpoint" className="webhook-endpoint-panel" modal={false} onClose={onClose}>
    <div className="credential-panel__heading"><div><p className="section-label">INBOUND WEBHOOK</p><h2>{isGitHub ? "GitHub webhook registration" : "Webhook endpoint"}</h2></div><IconButton label="Close webhook endpoint" className="icon-button" onClick={onClose}><X size={16} aria-hidden="true" /></IconButton></div>
    <p>Setup uses the published workflow, not unsaved changes. Each registration is pinned to a published version.</p>
    {endpoint && workflow.published && endpoint.workflowVersionId !== workflow.published.id && <Status tone="warning">This endpoint still uses an older published version. Rotate it to apply the setup shown here to the current published version.</Status>}
    <ConfigField label="Public path" value={path} onChange={setPath} />
    <small className="webhook-endpoint-panel__warning">Use 3–81 letters, numbers or hyphens. Changing the path requires updating the external webhook.</small>
    {isGitHub ? <Status tone={providerWebhook?.registration?.state === "ACTIVE" ? "success" : "info"} className="webhook-endpoint-panel__help">{providerWebhook?.registration?.state === "ACTIVE" ? <>GitHub manages <code>{providerWebhook.registration.repository}</code> automatically for <code>{githubEventLabel}</code>. The manual endpoint stays available as a compatibility path.</> : <>Add this URL and signing secret in your repository’s GitHub webhook settings for <code>{githubEventLabel}</code>. You can connect it automatically when provider registration is enabled.</>}</Status> : isUptimeKuma ? <Status tone="info" className="webhook-endpoint-panel__help">In Uptime Kuma, choose a Webhook notification with POST and JSON. In Additional Headers, enter <code>{'{"x-workflow-secret":"YOUR_SECRET"}'}</code> and replace YOUR_SECRET with the generated secret. Use a URL reachable from Uptime Kuma and assign the notification to your monitor. Uptime Kuma’s Test button checks the connection without starting a workflow run; an actual monitor alert starts one when the workflow is active.</Status> : isTelegram ? <Status tone="warning" className="webhook-endpoint-panel__help">Telegram allows one webhook per bot. This endpoint does not register or change it automatically. Before configuring <code>setWebhook</code>, check the bot’s existing webhook: setting a new one replaces it. Provide the HTTPS URL and the one-time secret as <code>secret_token</code>. Never put the bot token or secret in a shared URL or screenshot. <a href="https://core.telegram.org/bots/api#setwebhook" target="_blank" rel="noopener noreferrer">Telegram setup documentation</a></Status> : isSentry ? <Status tone="info" className="webhook-endpoint-panel__help">Create a Sentry custom integration, subscribe to issue events, and configure its public webhook URL. Enter its client secret here and its installation UUID in the node. Project service hooks use a different protocol. This setup does not create or verify the Sentry integration. Only issue-created events are supported. <a href="https://sentry-blog.sentry.dev/customize-your-sentry-workflow-a-sample-internal-integration/" target="_blank" rel="noopener noreferrer">Sentry setup guidance</a></Status> : isTrello ? <Status tone="info" className="webhook-endpoint-panel__help">Enter the Trello app secret and the exact public HTTPS callback below. Save this endpoint first; then register a webhook for the selected board in Trello using that exact URL. Trello validates the endpoint with HEAD. Fluxora does not create or verify the remote webhook. <a href="https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/" target="_blank" rel="noopener noreferrer">Trello setup documentation</a></Status> : isVercel ? <Status tone="info" className="webhook-endpoint-panel__help">Create an account webhook in Vercel using the public HTTPS URL below and select the published event and project. Paste the one-time signing secret from Vercel here; it is separate from your API token. This setup does not create or verify the remote webhook. Account webhooks require an eligible Vercel plan. <a href="https://vercel.com/docs/webhooks" target="_blank" rel="noopener noreferrer">Vercel setup documentation</a></Status> : <label className="checkbox-field"><input type="checkbox" checked={secretRequired} onChange={(event) => setSecretRequired(event.target.checked)} /> Require <code>x-workflow-secret</code> header</label>}
    {(isVercel || isTrello || isSentry) && <label className="config-field"><span>{isTrello ? "Trello app secret" : isSentry ? "Sentry integration client secret" : "Vercel webhook signing secret"}</span><input type="password" autoComplete="off" value={signingSecret} onChange={(event) => setSigningSecret(event.target.value)} /></label>}
    {isTrello && <ConfigField label="Exact public callback URL" value={trelloCallback} onChange={setCallbackUrl} />}
    {isTrello && <small className="webhook-endpoint-panel__warning">Use HTTPS on port 443 with no query string. Copy this exact URL to Trello; changing it requires updating both registrations.</small>}
    {isGitHub && <div className="webhook-endpoint-panel__provider"><div><span className="webhook-endpoint-panel__provider-label">GITHUB CONNECTION</span><strong>{providerWebhook?.registration ? providerWebhookStateLabel(providerWebhook.registration.state) : providerWebhook?.enabled ? "Not connected" : "Manual setup"}</strong><small>{providerWebhook?.registration ? `${providerWebhook.registration.repository} · ${providerWebhook.registration.event}` : providerWebhook?.enabled ? "Use the connector credential to register this repository webhook." : "Automatic registration is disabled until the public HTTPS origin is configured."}</small></div><div className="webhook-endpoint-panel__provider-actions">{providerWebhook?.enabled && providerWebhook?.registration && !registrationIsBusy && <Button variant="ghost" disabled={providerWebhookAction !== null} onClick={() => void reconcileProviderWebhook()}>{providerWebhookAction === "reconcile" ? "Checking…" : providerWebhook.registration.state === "ACTIVE" ? "Verify remote" : "Reconcile"}</Button>}{providerWebhook?.enabled && providerWebhook?.registration?.state === "ACTIVE" ? <Button variant="ghost" disabled={providerWebhookAction !== null} onClick={() => setConfirmProviderDisconnect(true)}>{providerWebhookAction === "disconnect" ? "Disconnecting…" : "Disconnect"}</Button> : providerWebhook?.enabled && (!providerWebhook?.registration || providerWebhook.registration.state === "CREATE_REJECTED" || providerWebhook.registration.state === "REMOVED") ? <Button variant="secondary" disabled={!canRegister || providerWebhookAction !== null || endpointLoading || Boolean(endpointError)} onClick={() => void connectProviderWebhook()}>{providerWebhookAction === "connect" ? "Connecting…" : providerWebhook?.registration ? "Retry connection" : "Connect GitHub"}</Button> : null}</div></div>}
    {providerWebhook?.reconciliation && <Status tone={reconciliationTone} className="webhook-endpoint-panel__reconciliation">{providerWebhook.reconciliation.message}</Status>}
    <div className="webhook-endpoint-panel__url"><span>POST URL</span><code>{isTrello ? trelloCallback || "Enter a public callback URL" : endpointUrl}</code><Button variant="ghost" disabled={isTrello && !validTrelloCallback} onClick={() => void navigator.clipboard.writeText(isTrello ? trelloCallback : endpointUrl)}>Copy URL</Button></div>
    {endpoint && path !== endpoint.path && <Status tone="warning">This is the new URL. The current URL remains active until you rotate the registration; update the provider after rotating.</Status>}
    {createdSecret && <div className="webhook-endpoint-panel__secret"><strong>Copy this secret now</strong><code>{createdSecret}</code><Button variant="ghost" onClick={() => void navigator.clipboard.writeText(createdSecret)}>Copy secret</Button><small>{isGitHub ? "It is displayed only once. Store it securely and paste it into GitHub." : isTelegram ? "It is displayed only once. Store it securely and configure it as Telegram’s secret_token." : "It is displayed only once. Store it securely and send it in the x-workflow-secret header."}</small></div>}
    {writeError && <Status tone="error">{writeError}</Status>}
    {providerWebhookError && <Status tone="error">{providerWebhookError}</Status>}
    {writeUncertain && <Status tone="warning">The request did not complete. The endpoint may have changed even if no secret was displayed. Check its status; if you do not have the current secret, rotate it again and update the external webhook.</Status>}
    <Status tone={endpointError ? "error" : "info"} className="webhook-endpoint-panel__notice">{endpointError ?? notice}</Status>
    {endpointError && <Button variant="ghost" onClick={() => setEndpointRetry((value) => value + 1)}>Retry status check</Button>}
    {confirmRotation && <div className="webhook-endpoint-panel__confirmation"><Status tone="warning">Rotating immediately replaces the secret. Update the external webhook with the new secret to resume delivery.</Status><Button variant="ghost" onClick={() => setConfirmRotation(false)}>Cancel</Button><Button variant="primary" disabled={isSaving} onClick={() => { setConfirmRotation(false); void createEndpoint(); }}>Confirm rotation</Button></div>}
    {confirmProviderDisconnect && <div className="webhook-endpoint-panel__confirmation"><Status tone="warning">This removes only the GitHub-managed remote webhook. The Fluxora endpoint and manual setup remain available.</Status><Button variant="ghost" disabled={providerWebhookAction !== null} onClick={() => setConfirmProviderDisconnect(false)}>Cancel</Button><Button variant="primary" disabled={providerWebhookAction !== null} onClick={() => void disconnectProviderWebhook()}>{providerWebhookAction === "disconnect" ? "Disconnecting…" : "Confirm disconnect"}</Button></div>}
    <Button variant="primary" className="run-button" onClick={() => endpoint ? setConfirmRotation(true) : void createEndpoint()} disabled={!canRegister || isSaving || endpointLoading || Boolean(endpointError) || !validPath || confirmRotation || ((isVercel || isTrello || isSentry) && !/^[\x21-\x7e]{1,1024}$/.test(signingSecret)) || (isTrello && !validTrelloCallback)}>{endpointLoading ? "Checking registration…" : isSaving ? "Creating…" : endpoint ? "Rotate registration" : "Create registration"}</Button>
    {!canRegister && <small className="webhook-endpoint-panel__warning">Publish a version containing this webhook trigger before creating its endpoint.</small>}
  </Dialog>;
}

function WorkflowLibraryPanel({ initialWorkspaces, activeWorkflowId, activeWorkspaceId, onOpen, onWorkspaceCreated, onClose }: { initialWorkspaces: WorkspaceSummary[]; activeWorkflowId: string | undefined; activeWorkspaceId: string | undefined; onOpen: (workflow: ApiWorkflow) => void; onWorkspaceCreated: (workspace: WorkspaceSummary) => void; onClose: () => void }) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(activeWorkspaceId ?? initialWorkspaces[0]?.id ?? "");
  const [workflows, setWorkflows] = useState<ApiWorkflow[]>([]);
  const [newWorkflowName, setNewWorkflowName] = useState("Untitled workflow");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [notice, setNotice] = useState("Loading workflows…");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastCreateTemplate, setLastCreateTemplate] = useState<string | undefined>(undefined);
  const activeWorkspaceRef = useRef(workspaceId);
  const abortRef = useRef<AbortController | null>(null);

  const loadWorkflows = async (targetWorkspaceId: string) => {
    if (!targetWorkspaceId) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    activeWorkspaceRef.current = targetWorkspaceId;

    setIsLoadingWorkflows(true);
    setLoadError(null);
    setWorkflows([]);
    try {
      const response = await apiRequest<{ workflows: ApiWorkflow[] }>(
        `/workspaces/${targetWorkspaceId}/workflows`,
        { signal: controller.signal }
      );
      if (activeWorkspaceRef.current !== targetWorkspaceId) return;
      setWorkflows(response.workflows);
      setNotice(response.workflows.length ? "Choose a workflow or create a new one." : "No workflows yet. Start blank or use the Steam template.");
    } catch (reason) {
      if (controller.signal.aborted || activeWorkspaceRef.current !== targetWorkspaceId) return;
      const message = reason instanceof Error ? reason.message : "Unable to load workflows.";
      setLoadError(message);
      setNotice(message);
    } finally {
      if (activeWorkspaceRef.current === targetWorkspaceId) {
        setIsLoadingWorkflows(false);
      }
    }
  };

  useEffect(() => {
    void loadWorkflows(workspaceId);
  }, []);

  const switchWorkspace = (nextWorkspaceId: string) => {
    setWorkspaceId(nextWorkspaceId);
    void loadWorkflows(nextWorkspaceId);
  };

  const createWorkflow = async (templateSlug?: string) => {
    if (!workspaceId || (!templateSlug && !newWorkflowName.trim())) return;
    setIsSaving(true);
    setCreateError(null);
    setLastCreateTemplate(templateSlug);
    try {
      const response = templateSlug
        ? await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspaceId}/workflows/from-template/${templateSlug}`, { method: "POST" })
        : await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspaceId}/workflows`, { method: "POST", body: JSON.stringify({ name: newWorkflowName.trim() }) });
      onOpen(response.workflow);
      setNotice(templateSlug ? "Steam daily report created from template." : "Blank workflow created.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to create workflow.";
      setCreateError(message);
      setNotice(message);
    } finally {
      setIsSaving(false);
    }
  };

  const createWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setIsSaving(true);
    try {
      const response = await apiRequest<{ workspace: WorkspaceSummary }>("/workspaces", { method: "POST", body: JSON.stringify({ name: newWorkspaceName.trim() }) });
      setWorkspaces((current) => [response.workspace, ...current]);
      onWorkspaceCreated(response.workspace);
      setWorkspaceId(response.workspace.id);
      setNewWorkspaceName("");
      setWorkflows([]);
      setNotice("Workspace created. Create its first workflow.");
      void loadWorkflows(response.workspace.id);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to create workspace.");
    } finally {
      setIsSaving(false);
    }
  };

  return <Dialog label="Workflow library" className="workflow-library" modal={false} onClose={onClose}><div className="credential-panel__heading"><div><p className="section-label">WORKSPACE LIBRARY</p><h2>Workflows</h2></div><button className="icon-button" type="button" aria-label="Close workflow library" onClick={onClose}>×</button></div><label className="workflow-library__field"><span>Workspace</span><select value={workspaceId} onChange={(event) => switchWorkspace(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><div className="workflow-library__create"><input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} placeholder="New workspace name" /><button className="ghost-button" type="button" onClick={() => void createWorkspace()} disabled={isSaving || !newWorkspaceName.trim()}>Create workspace</button></div><div className="workflow-library__list">{workflows.map((candidate) => <button key={candidate.id} className={candidate.id === activeWorkflowId ? "workflow-library__item workflow-library__item--active" : "workflow-library__item"} type="button" onClick={() => onOpen(candidate)}><strong>{candidate.name}</strong><span>{candidate.published ? `Published v${candidate.published.version}` : "Draft only"}</span></button>)}</div><div className="workflow-library__new"><p className="section-label">CREATE WORKFLOW</p><input value={newWorkflowName} onChange={(event) => setNewWorkflowName(event.target.value)} aria-label="New workflow name" /><div><button className="run-button" type="button" onClick={() => void createWorkflow()} disabled={isSaving || !workspaceId || !newWorkflowName.trim()}>{isSaving && !lastCreateTemplate ? "Creating…" : "Start blank"}</button><button className="ghost-button" type="button" onClick={() => void createWorkflow("steam-daily-report")} disabled={isSaving || !workspaceId}>{isSaving && lastCreateTemplate ? "Creating…" : "Use Steam template"}</button></div>{createError && <p className="workflow-library__error" role="alert">{createError} <button type="button" className="ghost-button" onClick={() => void createWorkflow(lastCreateTemplate)}>Retry</button></p>}</div>{isLoadingWorkflows && <p className="workflow-library__notice" aria-live="polite">Loading workflows…</p>}{loadError && <p className="workflow-library__notice workflow-library__notice--error" role="alert">{loadError} <button type="button" className="ghost-button" onClick={() => void loadWorkflows(workspaceId)}>Retry</button></p>}{!isLoadingWorkflows && !loadError && <p className="workflow-library__notice">{notice}</p>}</Dialog>;
}

function GmailTriggerStatus({ workflowId, nodeId }: { workflowId: string; nodeId: string }) {
  const [status, setStatus] = useState<{ active: boolean; checkpoints: Array<{ nodeId: string; state: string; lastErrorCode: string | null }> } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  useEffect(() => {
    if (!workflowId) return;
    let current = true;
    const load = () => { void apiRequest<{ active: boolean; checkpoints: Array<{ nodeId: string; state: string; lastErrorCode: string | null }> }>(`/workflows/${encodeURIComponent(workflowId)}/gmail-trigger-status`).then((data) => { if (current) { setStatus(data); setUnavailable(false); } }).catch(() => { if (current) setUnavailable(true); }); };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { current = false; window.clearInterval(timer); };
  }, [workflowId, refresh]);
  const checkpoint = status?.checkpoints.find((item) => item.nodeId === nodeId);
  const error = checkpoint?.lastErrorCode;
  return <Status tone={checkpoint?.state === "ERROR" || unavailable ? "warning" : "info"} className="inspector-note">
    <strong>Gmail polling</strong>
    <span>{unavailable ? "Trigger status is unavailable. Try refreshing." : checkpoint?.state === "ERROR" ? error === "GMAIL_CHECKPOINT_MISSING" ? "This trigger has no checkpoint and is not checking mail. Deactivate and reactivate to begin from the current inbox; earlier messages may be missed." : `${error === "GMAIL_MAILBOX_CHANGED" ? "The connection now belongs to a different mailbox." : error === "GMAIL_EXECUTION_MISSING" ? "A pending execution is no longer available." : error === "GMAIL_MESSAGE_MISSING" ? "A message in the saved history is no longer available." : "Gmail history is no longer available."} Deactivate, then review the reset option.` : error ? "The last check failed. Check the Gmail connection and permissions; Fluxora will retry without advancing the checkpoint." : status?.active && checkpoint ? "Active. Checks for messages on the selected schedule; delivery may be delayed." : checkpoint ? "Inactive. Reactivating resumes from the saved checkpoint and may process messages received while inactive." : "Publish and activate to begin checking new messages. Existing messages are not processed."}</span>
    <span>Message contents may be retained in execution history.</span>
    <span>When messages exceed the per-check limit, remaining messages are processed in later checks until caught up.</span>
    <span>Inbox and label filters use the message's labels when it is checked.</span>
    <Button type="button" variant="ghost" onClick={() => setRefresh((value) => value + 1)}>Refresh status</Button>
    {!status?.active && checkpoint && <Button type="button" variant="ghost" onClick={() => { setResetError(""); setResetOpen(true); }}>Reset checkpoint…</Button>}
    {resetOpen && <Dialog label="Reset Gmail checkpoint" onClose={() => { if (!resetting) setResetOpen(false); }}><DialogHeader title="Start from the current inbox?" onClose={() => { if (!resetting) setResetOpen(false); }} closeLabel="Close reset confirmation" /><p>Messages since the saved checkpoint, including pending deliveries, may be permanently missed. Already running executions may still finish. This cannot be undone.</p>{resetError && <Status tone="error" role="alert">{resetError}</Status>}<div className="dialog-actions"><Button variant="secondary" type="button" disabled={resetting} onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="primary" type="button" disabled={resetting} onClick={() => { setResetting(true); setResetError(""); void apiRequest(`/workflows/${encodeURIComponent(workflowId)}/gmail-trigger-reset`, { method: "POST", body: JSON.stringify({ confirmDataGap: true }) }).then(() => { setResetOpen(false); setRefresh((value) => value + 1); }).catch((reason: unknown) => setResetError(reason instanceof Error ? reason.message : "Could not reset the checkpoint." )).finally(() => setResetting(false)); }}>{resetting ? "Resetting…" : "Reset checkpoint"}</Button></div></Dialog>}
  </Status>;
}

function RssTriggerStatus({ workflowId, nodeId }: { workflowId: string; nodeId: string }) {
  const [status, setStatus] = useState<{ active: boolean; checkpoints: Array<{ nodeId: string; state: string; lastErrorCode: string | null }> } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  useEffect(() => {
    if (!workflowId) return;
    let current = true;
    const load = () => { void apiRequest<{ active: boolean; checkpoints: Array<{ nodeId: string; state: string; lastErrorCode: string | null }> }>(`/workflows/${encodeURIComponent(workflowId)}/rss-trigger-status`).then((data) => { if (current) { setStatus(data); setUnavailable(false); } }).catch(() => { if (current) setUnavailable(true); }); };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { current = false; window.clearInterval(timer); };
  }, [workflowId, refresh]);
  const checkpoint = status?.checkpoints.find((item) => item.nodeId === nodeId);
  const error = checkpoint?.lastErrorCode;
  return <Status tone={checkpoint?.state === "ERROR" || unavailable ? "warning" : "info"} className="inspector-note">
    <strong>RSS polling</strong>
    <span>Use a public feed URL. Do not put passwords, API keys or tokens in the URL.</span>
    <span>Status and reset refer to the published workflow, not unsaved draft changes.</span>
    <span>{unavailable ? "Trigger status is unavailable. Try refreshing." : checkpoint?.state === "ERROR" ? error === "RSS_SNAPSHOT_GAP" ? "The feed no longer overlaps the previous snapshot, so some items may have been missed. Deactivate and review the reset option." : error === "RSS_NOT_READY" ? "A required connection is unavailable. Deactivate, fix the connection and publish changes if needed, then activate again. The saved checkpoint will be retained." : "The trigger needs attention. Deactivate and review the reset option." : error ? "The last check failed. Fluxora will retry without advancing the checkpoint." : status?.active && checkpoint ? "Active. New items are checked on the selected schedule." : checkpoint ? "Inactive. Reactivating resumes the saved checkpoint." : "Publish and activate to start checking. Existing items are not processed."}</span>
    <span>Items that appear and disappear between checks can be missed. History is bounded; an older item may be delivered again after its receipt expires.</span>
    <Button type="button" variant="ghost" onClick={() => setRefresh((value) => value + 1)}>Refresh status</Button>
    {!status?.active && checkpoint && <Button type="button" variant="ghost" onClick={() => { setResetError(""); setResetOpen(true); }}>Reset checkpoint…</Button>}
    {resetOpen && <Dialog label="Reset RSS checkpoint" onClose={() => { if (!resetting) setResetOpen(false); }}><DialogHeader title="Start from the current feed?" onClose={() => { if (!resetting) setResetOpen(false); }} closeLabel="Close reset confirmation" /><p>Items since the saved checkpoint and queued deliveries that have not started may be missed. Running executions may still finish. This cannot be undone.</p>{resetError && <Status tone="error" role="alert">{resetError}</Status>}<div className="dialog-actions"><Button variant="secondary" type="button" disabled={resetting} onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="primary" type="button" disabled={resetting} onClick={() => { setResetting(true); setResetError(""); void apiRequest(`/workflows/${encodeURIComponent(workflowId)}/rss-trigger-reset`, { method: "POST", body: JSON.stringify({ confirmDataGap: true }) }).then(() => { setResetOpen(false); setRefresh((value) => value + 1); }).catch((reason: unknown) => setResetError(reason instanceof Error ? reason.message : "Could not reset the checkpoint.")).finally(() => setResetting(false)); }}>{resetting ? "Resetting…" : "Reset checkpoint"}</Button></div></Dialog>}
  </Status>;
}

// Identity changes on every config replacement, including undo/redo and graph reloads.
const relationalConfigIds = new WeakMap<object, number>();
let nextRelationalConfigId = 0;
function relationalContext(workspaceId: string, workflowId: string, node: WorkflowCanvasNode, provider: RelationalProvider) {
  let id = relationalConfigIds.get(node.data.config);
  if (id === undefined) { id = ++nextRelationalConfigId; relationalConfigIds.set(node.data.config, id); }
  return JSON.stringify([workspaceId, workflowId, node.id, node.data.nodeType, provider, node.data.config.credentialId, node.data.config.schema, node.data.config.table, id]);
}
function relationalProjection(config: Record<string, unknown>, provider: RelationalProvider): RelationalSelection {
  const result: RelationalSelection = {};
  for (const key of relationalSelectionKeys[provider]) if (Object.hasOwn(config, key)) result[key] = config[key];
  return result;
}

function RelationalNodeField({ node, workspaceId, workflowId, owner, credentials, draft, onDraftChange, jsonPending }: {
  node: WorkflowCanvasNode; workspaceId: string; workflowId: string; owner: boolean; credentials: CredentialSummary[];
  draft?: RelationalDraft; onDraftChange: (draft: RelationalDraft | undefined) => void; jsonPending: boolean;
}) {
  const provider: RelationalProvider = node.data.nodeType === "action.postgres.select" ? "postgres" : "supabase";
  const config = node.data.config;
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  const table = typeof config.table === "string" ? config.table : "";
  const schema = typeof config.schema === "string" ? config.schema : "";
  const { metadata } = useRelationalMetadata({ provider, workspaceId, workflowId, nodeId: node.id, owner, credentials, credentialId, table, schema });
  const contextKey = relationalContext(workspaceId, workflowId, node, provider);
  const apply = (selection: RelationalSelection, baseline: RelationalBaseline) => {
    if (jsonPending) return false;
    // Zustand reads and commits synchronously in this event; there is no await between compare and update.
    const state = useWorkflowEditorStore.getState();
    const latest = state.nodes.find((candidate) => candidate.id === node.id);
    if (!latest || latest.data.nodeType !== node.data.nodeType || !isRelationalBaselineCurrent(baseline, relationalProjection(latest.data.config, provider), relationalContext(workspaceId, workflowId, latest, provider), provider)) return false;
    if (Object.keys(selection).some((key) => !relationalSelectionKeys[provider].includes(key))) return false;
    const next = { ...latest.data.config };
    for (const key of relationalSelectionKeys[provider]) delete next[key];
    Object.assign(next, selection);
    state.updateNodeData(node.id, { config: next });
    return true;
  };
  return <RelationalSelectionField provider={provider} value={relationalProjection(config, provider)} contextKey={contextKey} metadata={metadata} draft={draft} applyBlockedReason={jsonPending ? "Apply or discard the node JSON edits before applying this selection." : undefined} onDraftChange={onDraftChange} onApply={apply} />;
}

function NodeInspector({ node, execution, credentials, workspaceId, workflowId, owner, onResolveApproval, onDebugNode, onOpenWebhook, webhookContext, isDebugging, isDrawerOpen, onCloseDrawer, draft, onDraftChange, onApplySheets, hasPending }: { node: WorkflowCanvasNode | undefined; execution: ApiExecution | null; credentials: CredentialSummary[]; workspaceId: string; workflowId: string; owner: boolean; onResolveApproval: (approvalId: string, decision: "approved" | "rejected") => void; onDebugNode: (node: WorkflowCanvasNode) => void; onOpenWebhook: () => void; webhookContext: "published" | "different" | "draft" | "other-draft"; isDebugging: boolean; isDrawerOpen: boolean; onCloseDrawer: () => void; draft: InspectorDraft; onDraftChange: UpdateInspectorDraft; onApplySheets: (draft: SheetsMappingDraft) => boolean; hasPending: boolean }) {
  const updateNodeData = useWorkflowEditorStore((state) => state.updateNodeData);
  const graphNodes = useWorkflowEditorStore((state) => state.nodes);
  const graphEdges = useWorkflowEditorStore((state) => state.edges);
  const inspectorRef = useDialogFocus<HTMLElement>({ active: isDrawerOpen, trapFocus: true, onClose: onCloseDrawer, restoreFocus: false });

  useSurfaceMotion(inspectorRef, isDrawerOpen);

  const drawerProps = isDrawerOpen ? { "aria-label": "Node inspector", "aria-modal": true, role: "dialog" as const, tabIndex: -1 } : {};

  if (!node) {
    return (
      <aside id="node-inspector" ref={inspectorRef} className={`inspector inspector--empty${isDrawerOpen ? " inspector--drawer-open" : ""}`} {...drawerProps}>
        {isDrawerOpen ? <IconButton className="inspector__close" label="Close node inspector" onClick={onCloseDrawer}><X size={16} /></IconButton> : null}
        <Layers3 size={22} />
        <h2>Configure a node</h2>
        <p>Select a node on the canvas to inspect its setup, test data, and runtime output.</p>
      </aside>
    );
  }

  const effectiveNodeType = node.data.nodeType;
  const definition = getNodeDefinition(effectiveNodeType);
  const nodeExecution = execution?.nodeExecutions.find((item) => item.nodeId === node.id);
  const recordedNode = execution?.graph?.nodes.find((item) => item.id === node.id && item.type === nodeExecution?.nodeType);
  const pagination = recordedNode && nodeExecution?.status === "SUCCEEDED" && !nodeExecution.error
    ? executionPagination(nodeExecution.nodeType, nodeExecution.input, nodeExecution.output) : undefined;
  const approvalId = nodeExecution?.output && typeof nodeExecution.output === "object" && !Array.isArray(nodeExecution.output) && typeof (nodeExecution.output as Record<string, unknown>).approvalRequestId === "string"
    ? (nodeExecution.output as Record<string, unknown>).approvalRequestId as string
    : null;
  const updateConfig = (key: string, value: unknown) => {
    const config = effectiveNodeType === "action.google-drive" ? resetDrivePageToken(node.data.config, key, value) : { ...node.data.config, [key]: value };
    if (value === undefined) delete config[key];
    if (effectiveNodeType.startsWith("action.telegram.") && key === "destinationType" && value !== "supergroup" && "messageThreadId" in config) config.messageThreadId = "";
    if (["action.google-chat.oauth", "action.google-chat.reply", "action.google-chat.edit-message"].includes(effectiveNodeType) && node.data.config[key] !== value) {
      if (key === "credentialId") config.space = "";
      if ((key === "credentialId" || key === "space") && "threadName" in config) config.threadName = "";
      if ((key === "credentialId" || key === "space") && "messageName" in config) config.messageName = "";
    }
    if (effectiveNodeType.startsWith("action.google-calendar.") && node.data.config[key] !== value) {
      if (key === "credentialId") { config.calendarId = "primary"; config.eventId = ""; }
      else if (key === "calendarId") config.eventId = "";
      if (effectiveNodeType === "action.google-calendar.list-events" && ["credentialId", "calendarId", "limit", "timeMin"].includes(key) && "pageToken" in config) config.pageToken = "";
    }
    if (["action.google-drive", "action.google-drive.get-file", "action.google-drive.create-folder"].includes(effectiveNodeType) && key === "credentialId" && node.data.config.credentialId !== value) { if ("fileId" in config) config.fileId = ""; if ("parentId" in config) config.parentId = ""; }
    if (effectiveNodeType === "action.google-sheets" && key === "credentialId" && node.data.config.credentialId !== value) config.spreadsheetId = "";
    if (effectiveNodeType === "trigger.gmail" && key === "credentialId" && node.data.config.credentialId !== value) config.labelId = "";
    if (["action.gmail.reply", "action.gmail.modify-label"].includes(effectiveNodeType) && key === "credentialId" && node.data.config.credentialId !== value) {
      config.messageId = "";
      if ("labelId" in config) config.labelId = "";
    }
    if (effectiveNodeType === "action.gmail.update-draft" && key === "credentialId" && node.data.config.credentialId !== value) config.draftId = "";
    if (effectiveNodeType === "action.gmail.read" && node.data.config[key] !== value && ["credentialId", "mailbox", "query", "limit"].includes(key) && "pageToken" in config) config.pageToken = "";
    if (effectiveNodeType === "trigger.trello.board-action" && key === "credentialId" && node.data.config.credentialId !== value) config.boardId = "";
    if (effectiveNodeType.startsWith("action.trello.") && node.data.config[key] !== value) {
      if (key === "credentialId") for (const dependent of ["boardId", "sourceBoardId", "listId", "cardId", "before"]) { if (dependent in config) config[dependent] = ""; }
      else if (key === "sourceBoardId" && "cardId" in config) config.cardId = "";
      else if (key === "boardId") { if ("listId" in config) config.listId = ""; if ("before" in config) config.before = ""; }
      else if (effectiveNodeType === "action.trello.list-cards" && ["filter", "limit"].includes(key) && "before" in config) config.before = "";
      if (effectiveNodeType === "action.trello.find-cards" && ["credentialId", "boardId", "query", "limit"].includes(key) && "page" in config) config.page = 0;
      if (effectiveNodeType === "action.trello.find-cards" && key === "searchPagination" && value === "pages") config.page = 0;
    }
    if (effectiveNodeType.startsWith("action.notion.") && node.data.config[key] !== value) {
      if (key === "credentialId") {
        for (const dependent of ["pageId", "parentPageId", "blockId", "propertyId", "dataSourceId", "filterProperty", "cursor"]) { if (dependent in config) config[dependent] = ""; }
        if (effectiveNodeType === "action.notion.query-data-source" && config.filterMode !== "checkbox" && "filterValue" in config) config.filterValue = "";
      }
      else if (["query", "pageId", "blockId", "propertyId", "dataSourceId", "pageSize"].includes(key)) { if ("cursor" in config) config.cursor = ""; if (key === "pageId" && "propertyId" in config) config.propertyId = ""; if (key === "dataSourceId" && "filterProperty" in config) { config.filterProperty = ""; if ("filterValue" in config && config.filterMode !== "checkbox") config.filterValue = ""; } }
      else if (effectiveNodeType === "action.notion.query-data-source" && ["sort", "editedAfter", "filterMode", "filterProperty", "filterValue"].includes(key)) { if ("cursor" in config) config.cursor = ""; if (key === "filterProperty" && config.filterMode !== "checkbox") config.filterValue = ""; if (key === "filterMode") { config.filterProperty = ""; config.filterValue = value === "checkbox" ? "true" : ""; } }
    }
    if ((effectiveNodeType === "action.github" || effectiveNodeType.startsWith("action.github.")) && node.data.config[key] !== value) {
      if (key === "credentialId" && "repository" in config) config.repository = "";
      if (key === "credentialId" || key === "repository") for (const dependent of ["issueNumber", "pullRequestNumber"]) { if (dependent in config) config[dependent] = ""; }
      if (["credentialId", "repository", "state", "pageSize"].includes(key) && "page" in config) config.page = 1;
    }
    if (effectiveNodeType === "trigger.sentry.issue-created" && node.data.config[key] !== value) {
      if (key === "credentialId" || key === "organization") { config.project = ""; config.installationId = ""; }
      if (key === "credentialId") config.organization = "";
    }
    if (effectiveNodeType.startsWith("action.sentry.") && node.data.config[key] !== value) {
      if (key === "credentialId") { config.organization = ""; config.project = ""; }
      else if (key === "organization") config.project = "";
      if (["credentialId", "organization", "project"].includes(key) && "issueId" in config) config.issueId = "";
      if (effectiveNodeType === "action.sentry.list-issues" && ["credentialId", "organization", "project", "status", "limit"].includes(key) && "cursor" in config) config.cursor = "";
    }
    if (effectiveNodeType.startsWith("action.vercel.") && node.data.config[key] !== value) {
      if (key === "credentialId") { config.team = "personal"; if ("project" in config) config.project = ""; }
      else if (key === "team" && "project" in config) config.project = "";
      if (["credentialId", "team"].includes(key) && "deploymentId" in config) config.deploymentId = "";
      if (effectiveNodeType === "action.vercel.list-deployments" && ["credentialId", "team", "project", "limit"].includes(key) && "cursor" in config) config.cursor = "";
    }
    if (effectiveNodeType === "action.postgres.select" && node.data.config[key] !== value) {
      if (key === "credentialId") { config.schema = ""; config.table = ""; }
      else if (key === "schema") config.table = "";
    }
    if (["action.mongodb", "action.mongodb.insert"].includes(effectiveNodeType) && node.data.config[key] !== value) {
      if (key === "credentialId") { config.database = ""; config.collection = ""; }
      else if (key === "database") config.collection = "";
    }
    if ((effectiveNodeType === "action.supabase.select" || effectiveNodeType === "action.supabase.insert-row") && key === "credentialId" && node.data.config.credentialId !== value) config.table = "";
    if (effectiveNodeType === "action.supabase.insert-row" && (key === "credentialId" || key === "table") && node.data.config[key] !== value) config.fields = [];
    if ((effectiveNodeType === "action.steam" || effectiveNodeType === "action.riot-lol" || effectiveNodeType === "action.riot-tft") && key === "operation") {
      const previous = getNodeDefinitionForConfig(effectiveNodeType, node.data.config);
      const next = getNodeDefinitionForConfig(effectiveNodeType, config);
      if (next && (node.data.label === previous?.label || node.data.label === getNodeDefinition(effectiveNodeType)?.label)) {
        updateNodeData(node.id, { config, label: next.label, description: next.description });
        return;
      }
    }
    updateNodeData(node.id, { config });
  };
  const upstream = upstreamNodeIds(node.id, graphEdges);
  const currentTypes = new Map(graphNodes.map((item) => [item.id, item.data.nodeType]));
  const recordedTypes = new Map(execution?.graph?.nodes.map((item) => [item.id, item.type]) ?? []);
  const suggestions = buildExpressionSuggestions(execution?.nodeExecutions.filter((item) => item.status === "SUCCEEDED" && upstream.has(item.nodeId) && currentTypes.get(item.nodeId) === item.nodeType && recordedTypes.get(item.nodeId) === item.nodeType).map((item) => ({ nodeId: item.nodeId, output: item.output })) ?? []);
  const possible = buildPossibleExpressionSuggestions(graphNodes, upstream).filter((item) => !suggestions.includes(item));

  return (
    <aside id="node-inspector" ref={inspectorRef} className={`inspector${isDrawerOpen ? " inspector--drawer-open" : ""}`} {...drawerProps}>
      <div className="inspector__heading">
        {isDrawerOpen ? <IconButton className="inspector__close" label="Close node inspector" onClick={onCloseDrawer}><X size={16} /></IconButton> : null}
        <span className="inspector__category">{node.data.category}</span>
        <div className="inspector__identity">{definition && <span className="inspector__app-icon"><NodeIcon name={definition.icon} size={22} /></span>}<h2>{node.data.label}</h2></div>
        <p>{node.data.description}</p>
      </div>
      <InspectorSection title="Setup">
        <ConfigField
          label="Display name"
          value={node.data.label}
          onChange={(label) => updateNodeData(node.id, { label })}
        />
      </InspectorSection>
      <InspectorSection title="Configuration">
      {(effectiveNodeType === "action.riot-lol" || effectiveNodeType === "action.riot-tft") && <Status tone="warning" className="inspector-note"><strong>Riot API prototype</strong><span>Live execution on production is unavailable while Riot approval is pending. Use a key authorized for this game and product on a private prototype. Player data can appear in execution history.{effectiveNodeType === "action.riot-tft" ? " TFT is for post-game analysis; do not use it for live scouting or gameplay advice." : ""}</span></Status>}
      {effectiveNodeType === "trigger.uptime-kuma.alert" && <Status tone="info" className="inspector-note">Leave Monitor ID empty for all monitors. Repeated notifications may start multiple runs unless the sender supplies an Idempotency-Key. Matching keys are remembered while execution history is retained for this published version.</Status>}
      {definition?.configurationFields && <NodeConfigurationFields key={`configuration-${node.id}`} fields={definition.configurationFields} config={node.data.config} credentials={credentials} workspaceId={workspaceId} workflowId={workflowId} nodeId={node.id} owner={owner} allowExpressions={!effectiveNodeType.startsWith("trigger.")} onChange={updateConfig} draft={draft} onDraftChange={onDraftChange} />}
      {effectiveNodeType === "action.reddit.list-posts" && <Status tone="warning" className="inspector-note"><strong>Reddit access is changing</strong><span>New public Data API access requests stopped on October 31, 2026. Existing approved access is being phased out; availability depends on Reddit. <a href="https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026" target="_blank" rel="noopener noreferrer">Read Reddit's migration timeline</a>.</span></Status>}
      {["action.rss.read", "trigger.rss.new-item"].includes(effectiveNodeType) && isRedditFeed(node.data.config.url) && <Status tone="warning" className="inspector-note"><strong>Reddit RSS support is ending</strong><span>Reddit announced RSS support ends November 13, 2026. This feed may stop working. <a href="https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026" target="_blank" rel="noopener noreferrer">See Reddit's announcement</a>.</span></Status>}
      {["action.openai", "action.gemini"].includes(effectiveNodeType) && <Status tone="info" className="inspector-note">Generation may incur provider charges, including after a timeout. Limits apply per request; an administrator may set lower ceilings for output and prompt size. Model and structured-output support depend on the provider.</Status>}
      {["action.openai", "action.gemini"].includes(effectiveNodeType) && !readConfigText(node.data.config, "model").trim() && <Status tone="warning" className="inspector-note">Choose a model or enter its ID before testing this node.</Status>}
      {["action.openai", "action.gemini"].includes(effectiveNodeType) && (node.data.config.maxOutputTokens === "" || (typeof node.data.config.maxOutputTokens === "number" && (!Number.isInteger(node.data.config.maxOutputTokens) || node.data.config.maxOutputTokens < 1 || node.data.config.maxOutputTokens > 8192))) && <Status tone="warning" className="inspector-note">Max output tokens must be a whole number from 1 to 8,192. Your administrator may set a lower limit.</Status>}
      {["action.openai", "action.gemini"].includes(effectiveNodeType) && (node.data.config.timeoutMs === "" || (typeof node.data.config.timeoutMs === "number" && (!Number.isInteger(node.data.config.timeoutMs) || node.data.config.timeoutMs < 1000 || node.data.config.timeoutMs > 120000))) && <Status tone="warning" className="inspector-note">Timeout must be a whole number between 1,000 and 120,000 milliseconds.</Status>}
      {effectiveNodeType === "action.google-sheets" && <GoogleSheetsMappingField key={`sheets-mapping-${node.id}`} workspaceId={workspaceId} config={node.data.config} draft={draft.sheetsMapping} onDraftChange={(next) => onDraftChange("sheetsMapping", next)} applyBlockedReason={draft.json ? "Apply or discard the node JSON edits before applying this preview." : undefined} onApply={onApplySheets} />}
      {["action.postgres.select", "action.supabase.select"].includes(effectiveNodeType) && <RelationalNodeField key={`relational-${node.id}`} node={node} workspaceId={workspaceId} workflowId={workflowId} owner={owner} credentials={credentials} draft={draft.relational} onDraftChange={(next) => onDraftChange("relational", next)} jsonPending={draft.json !== undefined} />}
      {effectiveNodeType === "action.trello.create-card" && <Status tone="info" className="inspector-note">Card creation can be duplicated if a run is repeated. If the result is uncertain, check Trello before retrying.</Status>}
      {effectiveNodeType === "action.github.merge-pull-request" && <Status tone="info" className="inspector-note">For a guarded merge, provide the full head SHA from an earlier GitHub pull request step. GitHub rejects the merge if the head changes. Leave it empty to retain the original behavior.</Status>}
      {effectiveNodeType === "action.google-chat.reply" && <Status tone="info" className="inspector-note">Use the threadName output of a thread-aware send in this space. If a thread is unavailable, the reply fails rather than starting a new thread.</Status>}
      {effectiveNodeType === "action.google-chat.edit-message" && <Status tone="info" className="inspector-note">Reconnect Google Chat with message management enabled. Use the messageId output of a previous Chat step in this space. If the update is unconfirmed, check the message before retrying.</Status>}
      {effectiveNodeType === "trigger.telegram.update" && <Status tone="info" className="inspector-note">Use a separate workflow and endpoint for each bot. Only the selected event and chats start a run. Telegram delivers updates through a manually configured webhook; it cannot use polling at the same time.</Status>}
      {effectiveNodeType === "trigger.sentry.issue-created" && <Status tone="info" className="inspector-note">Select a project and enter the UUID of the installed Sentry custom integration. Its client secret is configured separately in the webhook endpoint. Only newly created issues are supported.</Status>}
      {effectiveNodeType === "trigger.trello.board-action" && <Status tone="info" className="inspector-note">Select the board and register its webhook using the Trello app secret and exact callback URL. The connection helps find boards; it is not the webhook signing secret. Trello registration is manual.</Status>}
      {effectiveNodeType === "trigger.vercel.deployment" && <Status tone="info" className="inspector-note">The connection is used to choose a project; webhook signing uses a separate secret. Configure a matching webhook in Vercel after publishing. Vercel documents <code>deployment.ready</code> for integration checks; <code>deployment.succeeded</code> can depend on registered checks. Confirm the event is offered by your webhook and plan. Duplicate event IDs are recognized while their execution history and the encryption key are retained.</Status>}
      {["action.gmail.send", "action.gmail.reply", "action.gmail.create-draft", "action.gmail.update-draft", "action.gmail.modify-label"].includes(effectiveNodeType) && <Status tone="info" className="inspector-note">{effectiveNodeType === "action.gmail.update-draft" ? "Requires Gmail draft permission. This replaces the complete existing draft, including any attachments." : effectiveNodeType === "action.gmail.create-draft" ? "Requires Gmail draft permission." : effectiveNodeType === "action.gmail.modify-label" ? "Requires Gmail modify-mailbox permission." : "Requires Gmail send permission."} Reconnect the selected account if needed. Test runs are simulated. A repeated live run can repeat the change; if the result is uncertain, check Gmail before trying again.</Status>}
      {["action.telegram.reply", "action.telegram.edit-message"].includes(effectiveNodeType) && <Status tone="info" className="inspector-note">Use the message ID returned by an earlier Telegram step. If Telegram does not confirm the result, check the chat before retrying.</Status>}
      {["action.trello.update-card", "action.trello.move-card", "action.trello.archive-card"].includes(effectiveNodeType) && <Status tone="info" className="inspector-note">This changes the selected card. If the result is uncertain, check Trello before running it again.</Status>}
      {effectiveNodeType === "action.notion.retrieve-page" && <Status tone="info" className="inspector-note">Some Notion properties may be incomplete. Use Get page property for paginated values. Sensitive values are redacted from execution data.</Status>}
      {effectiveNodeType === "action.notion.search-pages" && node.data.config.collectPages === true && <Status tone="info" className="inspector-note">Fetch up to the selected maximum using at most five Notion requests. Check <code>hasMore</code> and <code>nextCursor</code> in the result; changing pages may affect results.</Status>}
      {effectiveNodeType === "action.google-drive" && ["list", "search"].includes(String(node.data.config.operation ?? "list")) && node.data.config.collectPages === true && <Status tone="info" className="inspector-note">Fetch up to 100 files using at most five Drive requests. Check <code>nextPageToken</code> for more results; changes in Drive can affect pagination.</Status>}
      {effectiveNodeType === "action.gmail.read" && node.data.config.collectPages === true && <Status tone="info" className="inspector-note">Fetch up to the selected maximum using at most five Gmail list requests, plus one request per message. Check <code>hasMore</code> and <code>nextPageToken</code> for more results.</Status>}
      {effectiveNodeType === "action.google-drive.create-folder" && <Status tone="info" className="inspector-note">Leave the parent folder empty to create it in My Drive. If creation is unconfirmed, check Drive before retrying to avoid duplicate folders.</Status>}
      {effectiveNodeType === "action.notion.create-page" && <Status tone="info" className="inspector-note">Creates a page inside the selected page. If delivery is uncertain, check Notion before running it again to avoid duplicates.</Status>}
      {effectiveNodeType === "action.notion.update-title" && <Status tone="info" className="inspector-note">Updates only the title. Changes made by someone else at the same time can be overwritten; check Notion before retrying an uncertain result.</Status>}
      {effectiveNodeType === "action.notion.list-children" && <Status tone="info" className="inspector-note">Returns direct child blocks only. Nested blocks require a separate request.</Status>}
      {effectiveNodeType === "action.trello.find-cards" && <Status tone="info" className="inspector-note">Search uses Trello syntax. To page through results, choose “Choose a page”, keep the same connection, board, query and limit, then enter nextPage from the previous output. Results can shift as cards change; overlapping pages stop continuation, and a full page 100 cannot confirm further results.</Status>}
      {["action.sentry.list-issues", "action.sentry.get-issue"].includes(effectiveNodeType) && <Status tone="info" className="inspector-note">Issue titles and metadata can be stored in execution history.</Status>}
      {["action.sentry.get-issue", "action.sentry.list-issues", "action.vercel.list-deployments"].includes(effectiveNodeType) && <Status tone="info" className="inspector-note">Only selected metadata is returned; check partial and continuation fields before treating a page as complete.</Status>}
      {effectiveNodeType === "action.vercel.public-deployment-lookup" && <Status tone="info" className="inspector-note">A public lookup can return deployments outside the selected account. It does not verify ownership.</Status>}
      {(effectiveNodeType === "action.supabase.select") && <Status tone="info" className="inspector-note">Results may appear in execution history. Access depends on the connection key, any user access token, and your Supabase policies.</Status>}
      {effectiveNodeType === "action.supabase.select" && node.data.config.rejectUnsafeNumbers === true && <Status tone="info" className="inspector-note">If an exact number cannot be represented safely, the run stops. Return that value as text from a database view to preserve it.</Status>}
      {effectiveNodeType === "action.gmail.get-message" && <Status tone="info" className="inspector-note">Message content can be stored in execution history and passed to later steps. Check bodyStatus for partial or unsupported content.</Status>}
      {["action.github.list-issues", "action.github.get-issue", "action.github.list-pull-requests", "action.github.get-pull-request"].includes(effectiveNodeType) && <Status tone="info" className="inspector-note">Issue and pull request content can be stored in execution history and passed to later steps. Check bodyTruncated before using a description as complete.</Status>}
      {effectiveNodeType === "action.github.update-issue" && <Status tone="warning" className="inspector-note">Updates can overwrite someone else's concurrent change. If the result is uncertain, check GitHub before retrying.</Status>}
      {effectiveNodeType === "trigger.gmail" && <GmailTriggerStatus workflowId={workflowId} nodeId={node.id} />}
      {effectiveNodeType === "trigger.rss.new-item" && <RssTriggerStatus workflowId={workflowId} nodeId={node.id} />}
      {effectiveNodeType === "trigger.manual" && <TestDataEditor key={`test-data-${node.id}`} value={node.data.config.testData} onApply={(testData) => updateConfig("testData", testData)} draft={draft.testData} onDraftChange={(next) => onDraftChange("testData", next)} />}
      {effectiveNodeType === "trigger.cron" && (
        <>
          <ConfigField label="Cron expression" value={readConfigText(node.data.config, "expression")} onChange={(value) => updateConfig("expression", value)} />
          <ConfigField label="Timezone" value={readConfigText(node.data.config, "timezone")} onChange={(value) => updateConfig("timezone", value)} />
        </>
      )}
      {effectiveNodeType === "trigger.webhook" && (
        <>
          <ConfigField label="Public path" value={readConfigText(node.data.config, "path")} onChange={(value) => updateConfig("path", value)} />
          <label className="checkbox-field"><input type="checkbox" checked={node.data.config.secretRequired !== false} onChange={(event) => updateConfig("secretRequired", event.target.checked)} /> Require <code>x-workflow-secret</code> header</label>
        </>
      )}
      {(isGitHubWebhookTrigger(effectiveNodeType) || effectiveNodeType === "trigger.webhook" || effectiveNodeType === "trigger.telegram.update" || effectiveNodeType === "trigger.vercel.deployment" || effectiveNodeType === "trigger.trello.board-action" || effectiveNodeType === "trigger.sentry.issue-created" || isUptimeKumaTrigger(effectiveNodeType)) && <div className="inspector-webhook-setup"><Status tone={webhookContext === "different" || webhookContext === "other-draft" ? "warning" : "info"} className="inspector-note"><strong>Webhook setup</strong><span>{webhookContext === "different" ? "The published workflow uses a different webhook trigger. This setup manages that published trigger, not this draft node." : webhookContext === "other-draft" ? "This draft has multiple webhook triggers. Keep one trigger and publish before setting up its endpoint." : webhookContext === "published" ? "Setup uses the published workflow. Publish draft changes before applying them." : "Publish this workflow to set up its endpoint."}</span></Status>{webhookContext !== "other-draft" && <Button type="button" variant="ghost" className="inspector-webhook-setup__action" onClick={onOpenWebhook}>{webhookContext === "different" ? "Manage published webhook" : "Configure webhook"}</Button>}</div>}
      {["action.telegram.message", "action.telegram.reply", "action.telegram.edit-message"].includes(effectiveNodeType) && (
        <>
          <CredentialField label="Telegram credential" value={readConfigText(node.data.config, "credentialId")} providers={["TELEGRAM_BOT"]} credentials={credentials} onChange={(value) => updateConfig("credentialId", value)} />
          {(() => {
            const destinationType = readConfigText(node.data.config, "destinationType") || "dm";
            const destinationLabels: Record<string, string> = {
              dm: "Direct message (DM)",
              group: "Group",
              supergroup: "Supergroup",
              channel: "Channel",
            };
            const destinationHints: Record<string, string> = {
              dm: "Use the positive numeric chat ID from a private conversation where the user has started the bot.",
              group: "Use the negative numeric chat ID of the group.",
              supergroup: "Use the migrated -100… chat ID. The old group ID no longer works after migration.",
              channel: "Use a negative numeric ID or a public @channel username; the bot must be allowed to post.",
            };
            const destinationLabel = destinationLabels[destinationType] ?? destinationLabels.dm;
            return (
              <>
                <Field label="Destination type" className="config-field">
                  <Select aria-label="Telegram destination type" value={destinationType} onChange={(event) => updateConfig("destinationType", event.target.value)}>
                    <option value="dm">Direct message (DM)</option>
                    <option value="group">Group</option>
                    <option value="supergroup">Supergroup</option>
                    <option value="channel">Channel</option>
                  </Select>
                  <small>{destinationHints[destinationType] ?? destinationHints.dm}</small>
                </Field>
                <ConfigField label={effectiveNodeType === "action.telegram.message" ? `${destinationLabel} chat ID (legacy credential chatId is deprecated)` : `${destinationLabel} chat ID`} value={readConfigText(node.data.config, "chatId")} onChange={(value) => updateConfig("chatId", value)} />
                {destinationType === "supergroup" && effectiveNodeType !== "action.telegram.edit-message" && <ConfigField label="Topic / thread ID (optional)" value={readConfigText(node.data.config, "messageThreadId")} onChange={(value) => updateConfig("messageThreadId", value)} />}
              </>
            );
          })()}
          {effectiveNodeType !== "action.telegram.message" && <ConfigField label="Message ID" value={readConfigText(node.data.config, "messageId")} onChange={(value) => updateConfig("messageId", value)} />}
          <ConfigField label="Message text" value={readConfigText(node.data.config, "text") || readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("text", value)} multiline />
          <Field label="Parse mode" className="config-field"><Select aria-label="Telegram parse mode" value={readConfigText(node.data.config, "parseMode")} onChange={(event) => updateConfig("parseMode", event.target.value)}><option value="">Plain text</option><option value="Markdown">Markdown</option><option value="HTML">HTML</option><option value="MarkdownV2">MarkdownV2</option></Select></Field>
          {readConfigText(node.data.config, "parseMode") && <small>Telegram applies formatting to the entire message, including values from previous steps. Escape special characters in those values to avoid a formatting error.</small>}
        </>
      )}
      {effectiveNodeType === "condition.if" && (
        <>
          <ConfigField label="Left value" value={readConfigText(node.data.config, "left")} onChange={(value) => updateConfig("left", value)} />
          <Field label="Operator" className="config-field"><Select aria-label="Condition operator" value={readConfigText(node.data.config, "operator") || "equals"} onChange={(event) => updateConfig("operator", event.target.value)}><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="contains">Contains</option><option value="exists">Exists</option></Select></Field>
          <ConfigField label="Right value" value={readConfigText(node.data.config, "right")} onChange={(value) => updateConfig("right", value)} />
        </>
      )}
      {effectiveNodeType === "condition.switch" && (
        <>
          <ConfigField label="Value to evaluate" value={readConfigText(node.data.config, "value")} onChange={(value) => updateConfig("value", value)} />
          <SwitchCaseEditor cases={node.data.config.cases} onChange={(cases) => updateConfig("cases", cases)} />
        </>
      )}
      {effectiveNodeType === "approval.request" && <>
        <ConfigField label="Approval message" value={readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("message", value)} multiline />
        <Field label="Notification provider" className="config-field"><Select aria-label="Approval notification provider" value={readConfigText(node.data.config, "notificationProvider") || "google_chat"} onChange={(event) => updateConfig("notificationProvider", event.target.value)}><option value="google_chat">Google Chat</option><option value="http_webhook">HTTP webhook</option></Select></Field>
        <CredentialField label="Notification credential (optional)" value={readConfigText(node.data.config, "notificationCredentialId")} providers={readConfigText(node.data.config, "notificationProvider") === "http_webhook" ? ["HTTP"] : ["GOOGLE_CHAT_WEBHOOK"]} credentials={credentials} onChange={(value) => updateConfig("notificationCredentialId", value)} optional />
      </>}
      {definition && !definition.available && <p className="planned-note">This node is visible for roadmap clarity, but cannot run in the MVP.</p>}
      </InspectorSection>
      <InspectorSection title="Test & debug">
        <section className="node-debug-panel">
          <div><p className="section-label">NODE DEBUG</p><p>Runs only this node with mock providers. No live request or downstream node will run.</p></div>
          <Button variant="secondary" className="node-debug-panel__button" disabled={!definition?.available || effectiveNodeType === "approval.request" || isDebugging || hasPending} title={hasPending ? "Apply or discard pending edits first." : effectiveNodeType === "approval.request" ? "Approval nodes are tested in a full workflow run." : undefined} onClick={() => onDebugNode(node)}><Play size={14} />{isDebugging ? "Running node…" : "Run node"}</Button>
        </section>
        <section className="input-preview">
          <div className="section-label">INPUT PREVIEW</div>
          <pre>{JSON.stringify(node.data.config, null, 2)}</pre>
        </section>
      </InspectorSection>
      <InspectorSection title="Advanced">
        <JsonConfigEditor key={node.id} config={node.data.config} onApply={(config) => updateNodeData(node.id, { config })} draft={draft.json} onDraftChange={(next) => onDraftChange("json", next)} otherPending={draft.filter !== undefined || draft.filterRaw !== undefined || draft.testData !== undefined || draft.structuredOutput !== undefined || draft.relational !== undefined || draft.sheetsMapping !== undefined} />
        <ExpressionSuggestions suggestions={suggestions} possible={possible} />
      </InspectorSection>
      {nodeExecution && (
        <InspectorSection title="Last execution">
          <section className="input-preview">
            <div className="section-label">{nodeExecution.status} · ATTEMPT {nodeExecution.attempt} · {nodeExecution.durationMs ?? 0}MS</div>
            <div className="execution-inspector__section"><strong>Redacted input</strong><ResultView value={nodeExecution.input} /></div>
            <div className="execution-inspector__section"><strong>{nodeExecution.error ? "Normalized error" : "Output"}</strong><ResultView value={nodeExecution.error ?? nodeExecution.output} /></div>
            {pagination && <details className="execution-pagination"><summary>Pagination</summary>
              {pagination.kind === "offset" ? <p>To inspect another page, adjust <code>{pagination.input}</code> and keep the same connection, sorting and filters.</p> : pagination.available ? <p>The output contains <code>{pagination.next}</code>. Use it as <code>{pagination.input}</code> for another page, keeping the same connection and other settings.</p> : <p>No usable <code>{pagination.next}</code> was returned. This does not guarantee the result is complete.</p>}
              {pagination.caveat && <p>{pagination.caveat}</p>}
            </details>}
            {!nodeExecution.error && outputHasList(nodeExecution.output) && <Status tone="info" className="inspector-note">Lists stay together in this output. Connected nodes run at most once per execution, not once for each list item.</Status>}
            {nodeExecution.status === "WAITING" && approvalId && (
              <div className="approval-actions">
                <button className="run-button" type="button" disabled={hasPending} onClick={() => onResolveApproval(approvalId, "approved")}>Approve &amp; resume</button>
                <button className="ghost-button" type="button" onClick={() => onResolveApproval(approvalId, "rejected")}>Reject</button>
              </div>
            )}
          </section>
        </InspectorSection>
      )}
    </aside>
  );
}

export function WorkflowEditor() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<WorkflowCanvasNode, WorkflowCanvasEdge> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nodeLibraryRef = useRef<NodeLibraryHandle>(null);
  const paletteReopenRef = useRef<HTMLButtonElement>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState("Loading your workflow…");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [workflow, setWorkflow] = useState<ApiWorkflow | null>(null);
  const workflowRef = useRef<ApiWorkflow | null>(null);
  workflowRef.current = workflow;
  const [inspectorDrafts, setInspectorDrafts] = useState<Record<string, InspectorDraft>>({});
  const inspectorDraftsRef = useRef<Record<string, InspectorDraft>>({});
  const [execution, setExecution] = useState<ApiExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeOperation, setActiveOperation] = useState<"saving" | "publishing" | "running" | "debugging" | "retrying" | "activating" | "deactivating" | "live" | "cloning" | null>(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [executionDetailsOpen, setExecutionDetailsOpen] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const [gmailPublishWarningOpen, setGmailPublishWarningOpen] = useState(false);
  const [rssPublishWarningOpen, setRssPublishWarningOpen] = useState(false);
  const [liveReadiness, setLiveReadiness] = useState<LiveReadiness | null>(null);
  const [liveReadinessLoading, setLiveReadinessLoading] = useState(false);
  const [liveReadinessError, setLiveReadinessError] = useState<string | null>(null);
  const [versions, setVersions] = useState<WorkflowVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [approvalLinkId, setApprovalLinkId] = useState<string | null | undefined>(undefined);
  const [workflowLinkId, setWorkflowLinkId] = useState<string | null | undefined>(undefined);
  const [executionLinkId, setExecutionLinkId] = useState<string | null | undefined>(undefined);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const nodes = useWorkflowEditorStore((state) => state.nodes);
  const edges = useWorkflowEditorStore((state) => state.edges);
  const selectedNodeId = useWorkflowEditorStore((state) => state.selectedNodeId);
  const historyIndex = useWorkflowEditorStore((state) => state.historyIndex);
  const history = useWorkflowEditorStore((state) => state.history);
  const addNode = useWorkflowEditorStore((state) => state.addNode);
  const selectNode = useWorkflowEditorStore((state) => state.selectNode);
  const applyNodesChange = useWorkflowEditorStore((state) => state.applyNodesChange);
  const applyEdgesChange = useWorkflowEditorStore((state) => state.applyEdgesChange);
  const connect = useWorkflowEditorStore((state) => state.connect);
  const autoLayout = useWorkflowEditorStore((state) => state.autoLayout);
  const duplicateNode = useWorkflowEditorStore((state) => state.duplicateNode);
  const deleteNode = useWorkflowEditorStore((state) => state.deleteNode);
  const undo = useWorkflowEditorStore((state) => state.undo);
  const redo = useWorkflowEditorStore((state) => state.redo);
  const loadGraph = useWorkflowEditorStore((state) => state.loadGraph);
  const issues = useMemo(() => validateWorkflowGraph(nodes, edges), [nodes, edges]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const pendingNode = nodes.find((node) => Object.keys(inspectorDrafts[node.id] ?? {}).length > 0);
  const hasPending = Boolean(pendingNode);
  const publishedNodes = workflow?.published?.graph.nodes ?? [];
  const publishedWebhook = publishedNodes.find((node) => isGitHubWebhookTrigger(node.type)) ?? publishedNodes.find((node) => node.type === "trigger.webhook" || node.type === "trigger.telegram.update" || node.type === "trigger.vercel.deployment" || node.type === "trigger.trello.board-action" || node.type === "trigger.sentry.issue-created" || isUptimeKumaTrigger(node.type));
  const draftWebhook = nodes.find((node) => isGitHubWebhookTrigger(node.data.nodeType)) ?? nodes.find((node) => node.data.nodeType === "trigger.webhook" || node.data.nodeType === "trigger.telegram.update" || node.data.nodeType === "trigger.vercel.deployment" || node.data.nodeType === "trigger.trello.board-action" || node.data.nodeType === "trigger.sentry.issue-created" || isUptimeKumaTrigger(node.data.nodeType));
  const webhookContext = publishedWebhook ? (selectedNode?.id === publishedWebhook.id && selectedNode.data.nodeType === publishedWebhook.type ? "published" : "different") : selectedNode?.id === draftWebhook?.id ? "draft" : "other-draft";
  const webhookTrigger = publishedWebhook ? { type: publishedWebhook.type, config: publishedWebhook.config } : draftWebhook ? { type: draftWebhook.data.nodeType, config: draftWebhook.data.config } : null;
  const isNarrowEditorLayout = useNarrowEditorLayout();
  const isInspectorDrawerOpen = isNarrowEditorLayout && inspectorDrawerOpen;

  const setInspectorDraft: (nodeId: string, kind: InspectorDraftKind, value: MongoFilterRow[] | StagedText | StructuredOutputDraft | RelationalDraft | SheetsMappingDraft | undefined) => void = (nodeId, kind, value) => {
    const current = inspectorDraftsRef.current;
    const draft = { ...current[nodeId] };
    if (value === undefined) delete draft[kind];
    else if (kind === "filter" && Array.isArray(value)) draft.filter = value;
    else if (kind === "relational" && !Array.isArray(value) && "mode" in value) draft.relational = value;
    else if (kind === "sheetsMapping" && !Array.isArray(value) && "kind" in value && value.kind === "sheets") draft.sheetsMapping = value;
    else if (kind === "structuredOutput" && !Array.isArray(value) && "kind" in value && value.kind !== "sheets") draft.structuredOutput = value;
    else if (kind === "filterRaw" && !Array.isArray(value) && "text" in value && ! ("kind" in value) && !("mode" in value)) draft.filterRaw = value;
    else if (kind === "json" && !Array.isArray(value) && "text" in value && !("kind" in value) && !("mode" in value)) draft.json = value;
    else if (kind === "testData" && !Array.isArray(value) && "text" in value && !("kind" in value) && !("mode" in value)) draft.testData = value;
    const next = { ...current };
    if (Object.keys(draft).length) next[nodeId] = draft;
    else delete next[nodeId];
    inspectorDraftsRef.current = next;
    setInspectorDrafts(next);
  };
  const reviewPending = () => {
    if (!pendingNode) return;
    selectNode(pendingNode.id);
    if (isNarrowEditorLayout) setInspectorDrawerOpen(true);
    setNotice(`Apply or discard edits in ${pendingNode.data.label} before continuing.`);
  };
  const allowNavigation = () => {
    const pending = useWorkflowEditorStore.getState().nodes.find((node) => Object.keys(inspectorDraftsRef.current[node.id] ?? {}).length > 0);
    if (!pending) return true;
    selectNode(pending.id);
    if (isNarrowEditorLayout) setInspectorDrawerOpen(true);
    setNotice(`Apply or discard edits in ${pending.data.label} before continuing.`);
    return false;
  };

  // Graph replacement must not carry drafts keyed by node IDs into another graph.
  // Check again after asynchronous loads, then clear state and ref together.
  const replaceEditorGraph = (graph: Parameters<typeof loadGraph>[0]) => {
    if (!allowNavigation()) return false;
    inspectorDraftsRef.current = {};
    setInspectorDrafts({});
    loadGraph(graph);
    return true;
  };

  useEffect(() => {
    if (!hasPending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasPending]);

  const closeInspectorDrawer = () => {
    setInspectorDrawerOpen(false);
    window.requestAnimationFrame(() => inspectorTriggerRef.current?.focus());
  };

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setApprovalLinkId(search.get("approval"));
    setWorkflowLinkId(search.get("workflow"));
    setExecutionLinkId(search.get("execution"));
  }, []);

  useEffect(() => {
    const focusNodeSearch = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement
        && (target.matches("input, textarea, select") || target.isContentEditable);
      if (event.key === "/" && !isEditing) {
        event.preventDefault();
        setPaletteOpen(true);
        requestAnimationFrame(() => nodeLibraryRef.current?.focusSearch());
      }
    };
    window.addEventListener("keydown", focusNodeSearch);
    return () => window.removeEventListener("keydown", focusNodeSearch);
  }, []);

  useEffect(() => {
    if (!execution) return;
    let isCurrent = true;
    const refresh = async () => {
      try {
        const response = await apiRequest<{ execution: ApiExecution }>(`/executions/${execution.id}`);
        if (isCurrent) setExecution(response.execution);
      } catch {
        // A closed session is handled by the next authenticated editor request.
      }
    };
    const source = new EventSource(`${apiUrl}/executions/${execution.id}/events`, { withCredentials: true });
    source.onmessage = () => { void refresh(); };
    void refresh();
    return () => { isCurrent = false; source.close(); };
  }, [execution?.id]);

  useEffect(() => {
    if (approvalLinkId === undefined || workflowLinkId === undefined || executionLinkId === undefined) return;
    let isCurrent = true;
    const load = async () => {
      try {
        await apiRequest<{ user: { id: string } }>("/auth/me");
        const workspaceResponse = await apiRequest<{ workspaces: WorkspaceSummary[] }>("/workspaces");
        if (!isCurrent) return;
        setWorkspaces(workspaceResponse.workspaces);
        const linkedApproval = approvalLinkId ? (await apiRequest<{ approval: ApiApproval }>(`/approvals/${approvalLinkId}`)).approval : null;
        const resolvedExecutionId = executionLinkId ?? linkedApproval?.executionId ?? null;
        const linkedExecution = resolvedExecutionId ? (await apiRequest<{ execution: ApiExecution }>(`/executions/${resolvedExecutionId}`)).execution : null;
        let loadedWorkflow: ApiWorkflow;
        if (linkedExecution) {
          loadedWorkflow = (await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${linkedExecution.workflowId}`)).workflow;
        } else if (workflowLinkId) {
          loadedWorkflow = (await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflowLinkId}`)).workflow;
        } else {
          const workspace = workspaceResponse.workspaces[0];
          if (!workspace) throw new Error("No workspace is available for this account.");
          const workflowsResponse = await apiRequest<{ workflows: ApiWorkflow[] }>(`/workspaces/${workspace.id}/workflows`);
          loadedWorkflow = workflowsResponse.workflows[0] ?? (await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspace.id}/workflows/from-template/steam-daily-report`, { method: "POST" })).workflow;
        }
        const graph = linkedExecution?.graph ?? loadedWorkflow.draft?.graph ?? loadedWorkflow.published?.graph;
        if (!graph) throw new Error("The workflow has no editable version.");
        if (!isCurrent) return;
        if (!replaceEditorGraph(graphFromApi(graph))) return;
        setWorkflow(loadedWorkflow);
        if (linkedExecution) {
          setExecution(linkedExecution);
          const focusNode = linkedExecution.nodeExecutions.find((node) => ["FAILED", "RUNNING", "WAITING"].includes(node.status)) ?? linkedExecution.nodeExecutions.find((node) => node.status === "SUCCEEDED");
          if (focusNode) selectNode(focusNode.nodeId);
          setNotice(linkedApproval?.status === "PENDING" ? "Approval request loaded. Review and choose an action in the selected node." : `Execution detail loaded · ${linkedExecution.mode === "live" ? "Live run" : "Test run"} v${linkedExecution.workflowVersion}.`);
        } else {
          setNotice("Draft loaded from your workspace.");
        }
      } catch (reason) {
        if (!isCurrent) return;
        const message = reason instanceof Error ? reason.message : "Unable to load this workspace.";
        if (message === "Sign in is required." || message === "Your session has expired.") {
          router.replace("/login");
          return;
        }
        setNotice(message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };
    void load();
    return () => { isCurrent = false; };
  }, [approvalLinkId, executionLinkId, workflowLinkId, loadGraph, router, selectNode]);

  const refreshCredentials = async (workspaceId = workflow?.workspaceId) => {
    if (!workspaceId) {
      setCredentials([]);
      return;
    }
    try {
      const response = await apiRequest<{ credentials: CredentialSummary[] }>(`/workspaces/${workspaceId}/credentials`);
      setCredentials(response.credentials);
    } catch {
      setCredentials([]);
    }
  };

  useEffect(() => { void refreshCredentials(); }, [workflow?.workspaceId]);

  const addDefinition = (definition: NodeDefinition, position?: { x: number; y: number }) => {
    addNode(definition, position);
    setNotice(`${definition.label} added to the draft.`);
  };

  const startConnection = () => {
    setIsConnecting(true);
    setContextMenu(null);
    setNotice("Drag to a highlighted node input to connect.");
  };

  const finishConnection = () => {
    setIsConnecting(false);
  };

  const handleConnect = (connection: Connection) => {
    connect(connection);
    setIsConnecting(false);
    setNotice("Connection added to the draft.");
  };

  const openWorkflow = (nextWorkflow: ApiWorkflow) => {
    if (!allowNavigation()) return;
    const graph = nextWorkflow.draft?.graph ?? nextWorkflow.published?.graph;
    if (!graph) {
      setNotice("The selected workflow has no editable version.");
      return;
    }
    if (!replaceEditorGraph(graphFromApi(graph))) return;
    setWorkflow(nextWorkflow);
    setExecution(null);
    void refreshCredentials(nextWorkflow.workspaceId);
    selectNode(null);
    setLibraryOpen(false);
    setNotice(`Opened ${nextWorkflow.name}.`);
  };

  const arrangeGraph = () => {
    autoLayout();
    requestAnimationFrame(() => fitCanvas(false));
    setNotice("Workflow arranged from trigger to actions.");
  };

  const fitCanvas = (announce = true) => {
    flowRef.current?.fitView({ duration: 260, padding: 0.18 });
    if (announce) setNotice("Canvas fitted to the workflow.");
  };

  const zoomCanvas = (direction: "in" | "out") => {
    if (direction === "in") flowRef.current?.zoomIn({ duration: 180 });
    else flowRef.current?.zoomOut({ duration: 180 });
    setNotice(direction === "in" ? "Canvas zoomed in." : "Canvas zoomed out.");
  };

  const centerSelectedNode = () => {
    const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null;
    if (!selectedNode || !flowRef.current) return;
    const measured = selectedNode.measured;
    const width = measured?.width ?? 218;
    const height = measured?.height ?? 110;
    flowRef.current.setCenter(selectedNode.position.x + width / 2, selectedNode.position.y + height / 2, { duration: 260, zoom: 1 });
    setNotice(`Centered on ${selectedNode.data.label}.`);
  };

  const openHistory = async () => {
    if (!workflow) return;
    setHistoryOpen(true);
    setVersionsLoading(true);
    try {
      const response = await apiRequest<{ versions: WorkflowVersionSummary[] }>(`/workflows/${workflow.id}/versions`);
      setVersions(response.versions);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to load workflow history.");
    } finally {
      setVersionsLoading(false);
    }
  };

  const cloneWorkflow = async () => {
    if (!workflow || !allowNavigation()) return;
    setActiveOperation("cloning");
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/clone`, { method: "POST" });
      const graph = response.workflow.draft?.graph ?? response.workflow.published?.graph;
      if (!graph) throw new Error("The cloned workflow has no graph.");
      if (!replaceEditorGraph(graphFromApi(graph))) { setNotice("The copy was created. Apply or discard pending edits before opening it."); return; }
      setWorkflow(response.workflow);
      setExecution(null);
      void refreshCredentials(response.workflow.workspaceId);
      setNotice("Workflow cloned. You are editing the independent copy.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to clone workflow.");
    } finally {
      setActiveOperation(null);
    }
  };

  const copyNode = (nodeId = selectedNodeId) => {
    if (!nodeId) return;
    setCopiedNodeId(nodeId);
    setNotice("Node copied. Paste it from the toolbar or with Ctrl/Cmd + V.");
  };

  const pasteNode = () => {
    if (!copiedNodeId) return;
    duplicateNode(copiedNodeId);
    setNotice("Copied node pasted into the workflow.");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (hasPending || !(event.metaKey || event.ctrlKey) || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === "c" && selectedNodeId) { event.preventDefault(); copyNode(selectedNodeId); }
      if (event.key.toLowerCase() === "v" && copiedNodeId) { event.preventDefault(); pasteNode(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copiedNodeId, selectedNodeId, hasPending]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedNodeId || hasPending || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteNode(selectedNodeId);
        setNotice("Node and its connections removed.");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteNode, selectedNodeId, hasPending]);

  const onDragStart = (event: DragEvent<HTMLButtonElement>, definition: NodeDefinition) => {
    event.dataTransfer.setData("application/workflow-node", libraryDefinitionId(definition));
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/workflow-node");
    const definition = getLibraryDefinition(type);
    if (!definition || !wrapperRef.current) return;
    const bounds = wrapperRef.current.getBoundingClientRect();
    addDefinition(definition, { x: event.clientX - bounds.left - 110, y: event.clientY - bounds.top - 48 });
  };

  const exportGraph = () => {
    if (!allowNavigation()) return;
    const data = JSON.stringify(parseWorkflowCanvasGraph({ nodes, edges }), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "steam-daily-report.workflow.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Workflow JSON exported.");
  };

  const importGraph = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!allowNavigation()) { event.target.value = ""; return; }
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!replaceEditorGraph(parseWorkflowCanvasGraph(parsed))) return;
      setNotice("Workflow JSON imported into a fresh local draft.");
    } catch {
      setNotice("Import failed. Choose a workflow JSON export from this app.");
    } finally {
      event.target.value = "";
    }
  };

  const saveDraft = async (operation: "saving" | "publishing" | "running" | "debugging" = "saving", keepProgress = false): Promise<boolean> => {
    if (!workflow) return false;
    if (!allowNavigation()) return false;
    const currentGraph = useWorkflowEditorStore.getState();
    const errors = validateWorkflowGraph(currentGraph.nodes, currentGraph.edges).filter((issue) => issue.severity === "error");
    if (errors.length) {
      setNotice("Resolve graph errors before saving this draft.");
      return false;
    }
    setActiveOperation(operation);
    setIsSaving(true);
    try {
      // Snapshot the exact graph sent to the server, not a stale render closure.
      const savedGraph = JSON.stringify(graphForApi(currentGraph));
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/draft`, {
        method: "PATCH",
        body: JSON.stringify({ name: workflow.name, description: workflow.description, graph: JSON.parse(savedGraph) }),
      });
      if (workflowRef.current?.id !== workflow.id || workflowRef.current.workspaceId !== workflow.workspaceId) {
        setNotice("The previous workflow was saved, but the active workflow changed. Start the action again.");
        return false;
      }
      setWorkflow(response.workflow);
      if (!allowNavigation()) return false;
      let unchanged = false;
      try { unchanged = JSON.stringify(graphForApi(useWorkflowEditorStore.getState())) === savedGraph; } catch { /* An invalid current graph cannot be the saved graph. */ }
      if (!unchanged) {
        setNotice("An earlier graph was saved, but the workflow changed while saving. Save again before publishing or running.");
        return false;
      }
      setNotice("Draft saved to your workspace.");
      return true;
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to save the draft.");
      return false;
    } finally {
      setIsSaving(false);
      if (!keepProgress) setActiveOperation(null);
    }
  };

  const publish = async (confirmDiscardGmail = false, confirmDiscardRss = false) => {
    if (!workflow) return;
    const saved = await saveDraft("publishing", true);
    if (!saved) {
      setActiveOperation(null);
      return;
    }
    if (!allowNavigation()) { setActiveOperation(null); return; }
    setIsSaving(true);
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/publish`, { method: "POST", body: JSON.stringify({ confirmDiscardGmail, confirmDiscardRss }) });
      setGmailPublishWarningOpen(false);
      setRssPublishWarningOpen(false);
      setWorkflow(response.workflow);
      setNotice(`Version ${response.workflow.published?.version ?? ""} published. A new editable draft is ready.`);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.code === "GMAIL_PUBLISH_GAP_CONFIRMATION") setGmailPublishWarningOpen(true);
      else if (reason instanceof ApiClientError && reason.code === "RSS_PUBLISH_GAP_CONFIRMATION") setRssPublishWarningOpen(true);
      else setNotice(reason instanceof Error ? reason.message : "Unable to publish the workflow.");
    } finally {
      setIsSaving(false);
      setActiveOperation(null);
    }
  };

  const runTest = async () => {
    if (!workflow) return;
    const saved = await saveDraft("running", true);
    if (!saved) {
      setActiveOperation(null);
      return;
    }
    if (!allowNavigation()) { setActiveOperation(null); return; }
    setIsSaving(true);
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/workflows/${workflow.id}/executions`, {
        method: "POST",
        body: JSON.stringify({ mock: true, triggerData: manualTriggerTestData(useWorkflowEditorStore.getState().nodes) }),
      });
      setExecution(response.execution);
      setNotice(`Mock execution ${response.execution.status.toLowerCase()} — sample data does not verify live connections or all inputs.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to start the mock execution.");
    } finally {
      setIsSaving(false);
      setActiveOperation(null);
    }
  };

  const runNodeDebug = async (node: WorkflowCanvasNode) => {
    if (!workflow) return;
    const saved = await saveDraft("debugging", true);
    if (!saved) {
      setActiveOperation(null);
      return;
    }
    if (!allowNavigation()) { setActiveOperation(null); return; }
    setIsSaving(true);
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/workflows/${workflow.id}/executions`, {
        method: "POST",
        body: JSON.stringify({ mock: true, nodeId: node.id, triggerData: manualTriggerTestData(useWorkflowEditorStore.getState().nodes) }),
      });
      setExecution(response.execution);
      setNotice(`Mock node debug ${response.execution.status.toLowerCase()} — only ${node.data.label} ran. Sample data does not verify live connections or all inputs.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to run the selected node in mock mode.");
    } finally {
      setIsSaving(false);
      setActiveOperation(null);
    }
  };

  const checkLiveReadiness = async () => {
    if (!workflow?.published) return;
    setLiveReadinessLoading(true);
    setLiveReadinessError(null);
    try {
      const response = await apiRequest<{ readiness: LiveReadiness }>(`/workflows/${workflow.id}/live-readiness`);
      setLiveReadiness(response.readiness);
    } catch (reason) {
      setLiveReadiness(null);
      setLiveReadinessError(reason instanceof Error ? reason.message : "Unable to check live readiness.");
    } finally {
      setLiveReadinessLoading(false);
    }
  };

  const openLivePanel = () => {
    if (!allowNavigation()) return;
    if (!workflow?.published) {
      setNotice("Publish the workflow before going live.");
      return;
    }
    if (!workflow.isActive) {
      setActivationOpen(true);
      void checkLiveReadiness();
      return;
    }
    setLiveConfirmOpen(true);
    void checkLiveReadiness();
  };

  const updateActivation = async () => {
    if (!workflow) return;
    const activating = !workflow.isActive;
    if (activating && !allowNavigation()) return;
    setActivationOpen(false);
    setActiveOperation(activating ? "activating" : "deactivating");
    setIsSaving(true);
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/${activating ? "activate" : "deactivate"}`, { method: "POST" });
      setWorkflow(response.workflow);
      setNotice(activating ? "Workflow is active. Its published trigger can now accept work." : "Workflow is inactive. New triggers are disabled; existing executions may continue.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to update workflow activation.");
    } finally {
      setIsSaving(false);
      setActiveOperation(null);
    }
  };

  const runLive = async () => {
    if (!workflow?.published) return;
    setLiveConfirmOpen(false);
    setActiveOperation("live");
    if (!allowNavigation()) { setActiveOperation(null); return; }
    setIsSaving(true);
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/workflows/${workflow.id}/executions`, {
        method: "POST",
        body: JSON.stringify({ mock: false, confirmLive: true, triggerData: {} }),
      });
      setExecution(response.execution);
      setNotice(`Live execution ${response.execution.status.toLowerCase()} — inspect each node for progress and output.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to start the live execution.");
    } finally {
      setIsSaving(false);
      setActiveOperation(null);
    }
  };

  const resolveApproval = async (approvalId: string, decision: "approved" | "rejected") => {
    if (decision === "approved" && !allowNavigation()) return;
    try {
      const result = await apiRequest<{ approval: { executionId: string; resumed: boolean; dispatchStatus?: "not_required" | "submitted" | "unconfirmed" } }>(`/approvals/${approvalId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      // The decision is already saved even if refreshing the execution fails.
      try {
        const response = await apiRequest<{ execution: ApiExecution }>(`/executions/${result.approval.executionId}`);
        setExecution(response.execution);
      } catch { /* Keep the saved-decision message and let the user refresh. */ }
      setNotice(decision === "rejected" ? "Approval rejected; execution stopped." : !result.approval.resumed ? "Approval saved; execution finished." : result.approval.dispatchStatus === "unconfirmed" ? "Approval saved. Continuation could not be confirmed; check execution status." : "Approval saved. Continuation submitted; check execution status for progress.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to resolve approval.");
    }
  };

  const cancelExecution = async () => {
    if (!execution) return;
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/executions/${execution.id}/cancel`, { method: "POST" });
      setExecution(response.execution);
      setNotice("Execution cancelled. Pending work will not continue. Requests already sent may still complete; check the provider before retrying.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to cancel execution.");
    }
  };

  const retryExecution = async () => {
    if (!execution || execution.status !== "FAILED" || !allowNavigation()) return;
    setRetryConfirmOpen(false);
    setActiveOperation("retrying");
    setIsSaving(true);
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/executions/${execution.id}/retry`, {
        method: "POST",
        body: JSON.stringify(execution.mode === "live" ? { confirmLive: true } : {}),
      });
      setExecution(response.execution);
      setNotice(`${execution.mode === "live" ? "Live" : "Mock"} retry ${response.execution.status.toLowerCase()} — using the original version ${execution.workflowVersion}.`);
      router.replace(`/editor?workflow=${encodeURIComponent(response.execution.workflowId)}&execution=${encodeURIComponent(response.execution.id)}`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to retry this execution.");
    } finally {
      setIsSaving(false);
      setActiveOperation(null);
    }
  };

  if (isLoading) {
    return <main className="editor-page editor-loading" aria-busy="true"><div className="editor-loading__card" role="status" aria-live="polite"><LoaderCircle className="ui-spinner" size={20} aria-hidden="true" /><strong>Preparing your workspace</strong><span>Loading workflow, credentials, and the editor canvas…</span><div className="editor-loading__progress" /></div></main>;
  }

  const progressLabel = activeOperation === "saving" ? "Saving draft" : activeOperation === "publishing" ? "Publishing workflow" : activeOperation === "running" ? "Starting test run" : activeOperation === "debugging" ? "Running node debug" : activeOperation === "retrying" ? "Retrying execution" : activeOperation === "activating" ? "Activating workflow" : activeOperation === "deactivating" ? "Deactivating workflow" : activeOperation === "live" ? "Starting live execution" : activeOperation === "cloning" ? "Creating workflow copy" : null;

  return (
    <main className="editor-page">
      <AppShellHeader workspaces={workspaces} workspaceId={workflow?.workspaceId ?? ""} onWorkspaceChange={(nextWorkspaceId) => router.push(`/dashboard?workspace=${encodeURIComponent(nextWorkspaceId)}`)} onBeforeNavigate={allowNavigation} active="editor" />
      <header className="editor-header editor-toolbar">
        <div className="editor-header__title">
          <div>
            <p>WORKFLOW / DRAFT</p>
            <h1>{workflow?.name ?? "Steam daily report"}</h1>
          </div>
        </div>
        <div className="editor-header__actions">
          <Button variant="ghost" className="ghost-button" onClick={() => { if (allowNavigation()) router.push(`/dashboard?workspace=${encodeURIComponent(workflow?.workspaceId ?? "")}`); }}>Back to dashboard</Button>
          <ActionMenu label="Edit">
            <button type="button" onClick={undo} disabled={hasPending || historyIndex === 0}><ChevronLeft size={15} /> Undo</button>
            <button type="button" onClick={redo} disabled={hasPending || historyIndex === history.length - 1}>Redo <ChevronRight size={15} /></button>
            <button type="button" onClick={arrangeGraph}><LayoutDashboard size={15} /> Auto layout</button>
            <span className="action-menu__divider" />
            <button type="button" onClick={() => copyNode()} disabled={!selectedNodeId || hasPending}>Copy selected node</button>
            <button type="button" onClick={pasteNode} disabled={!copiedNodeId || hasPending}>Paste node</button>
          </ActionMenu>
          <ActionMenu label="Manage">
            <button type="button" onClick={() => setLibraryOpen(true)} disabled={!workflow || hasPending}>Workflows</button>
            <button type="button" onClick={() => void openHistory()} disabled={!workflow}><History size={15} /> Version history</button>
            <button type="button" onClick={() => setCredentialsOpen(true)} disabled={!workflow}><KeyRound size={15} /> Credentials</button>
            {webhookTrigger && <button type="button" onClick={() => setWebhookOpen(true)} disabled={!workflow}>Webhook endpoint</button>}
            {workflow?.isActive && <button type="button" onClick={() => setActivationOpen(true)} disabled={isSaving}>Deactivate workflow</button>}
            <span className="action-menu__divider" />
            <button type="button" onClick={exportGraph} disabled={hasPending}><Download size={15} /> Export JSON</button>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={hasPending}><Upload size={15} /> Import JSON</button>
            <button type="button" onClick={() => void cloneWorkflow()} disabled={!workflow || hasPending}>Clone workflow</button>
          </ActionMenu>
          <input ref={inputRef} className="visually-hidden" type="file" accept="application/json" onChange={importGraph} />
          <Button variant="secondary" className="save-button" onClick={() => void saveDraft()} disabled={!workflow || isSaving || hasPending || activeOperation === "cloning"}>{activeOperation === "saving" ? <LoaderCircle className="ui-spinner" size={16} /> : <Save size={16} />} {activeOperation === "saving" ? "Saving…" : "Save draft"}</Button>
          <Button variant="ghost" className="ghost-button" onClick={() => void publish()} disabled={!workflow || isSaving || hasPending || activeOperation === "cloning"}>{activeOperation === "publishing" ? <LoaderCircle className="ui-spinner" size={16} /> : <Check size={16} />} {activeOperation === "publishing" ? "Publishing…" : "Publish"}</Button>
          <Button variant="primary" className="run-button" onClick={() => void runTest()} disabled={!workflow || isSaving || hasPending || activeOperation === "cloning"}>{activeOperation === "running" ? <LoaderCircle className="ui-spinner" size={16} /> : <Play size={16} />} {activeOperation === "running" ? "Starting…" : "Run test"}</Button>
          <Button variant="secondary" className="go-live-button" onClick={openLivePanel} disabled={!workflow?.published || isSaving || hasPending} title={hasPending ? "Apply or discard pending edits first." : !workflow?.published ? "Publish this workflow before going live" : isSaving ? "Wait for the current operation to finish" : undefined}>{activeOperation === "live" || activeOperation === "activating" ? <LoaderCircle className="ui-spinner" size={16} /> : null} {workflow?.isActive ? "Run live" : "Go live"}</Button>
          {execution && ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(execution.status) && <button className="ghost-button" type="button" onClick={() => void cancelExecution()}>Cancel run</button>}
          {execution?.status === "FAILED" && <Button variant="ghost" className="ghost-button" disabled={isSaving || hasPending} onClick={() => setRetryConfirmOpen(true)}><RotateCcw size={15} /> Retry {execution.mode === "live" ? "live" : "test"}</Button>}
          {execution && <Button variant="ghost" className="ghost-button" onClick={() => setExecutionDetailsOpen(true)}><History size={15} /> Run details</Button>}
        </div>
      </header>
      {progressLabel && <div className="editor-progress" role="status" aria-live="polite"><LoaderCircle className="ui-spinner" size={14} /> <span>{progressLabel}…</span><i /></div>}
      {hasPending && <div className="editor-pending" role="status">Unapplied node edits — apply or discard them before saving or running. <button type="button" onClick={reviewPending}>Review edits</button></div>}
      {executionLinkId && execution && <section className="execution-detail-banner" aria-label="Execution detail"><div><p className="section-label">EXECUTION DETAIL</p><strong>Execution detail</strong><span>{execution.mode === "live" ? "Live run" : "Test run"} · Version {execution.workflowVersion} · {execution.status.toLowerCase()}</span></div><div className="execution-detail-banner__actions"><Button variant="secondary" onClick={() => setExecutionDetailsOpen(true)}><History size={14} /> Timeline</Button><Button variant="secondary" className="execution-detail-banner__return" onClick={() => { setExecution(null); router.replace(`/editor?workflow=${encodeURIComponent(execution.workflowId)}`); }}>Return to workflow</Button></div></section>}

      <div className={paletteOpen ? "editor-shell" : "editor-shell editor-shell--palette-closed"}>
        {paletteOpen && (
          <NodeLibrary ref={nodeLibraryRef} onAdd={addDefinition} onDragStart={onDragStart} onCollapse={() => { setPaletteOpen(false); requestAnimationFrame(() => paletteReopenRef.current?.focus()); }} />
        )}
        <section className={`canvas-region${isConnecting ? " canvas-region--connecting" : ""}`} ref={wrapperRef} onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          {!paletteOpen && <Button ref={paletteReopenRef} className="palette-reopen" variant="secondary" aria-controls="node-library" aria-expanded="false" onClick={() => { setPaletteOpen(true); requestAnimationFrame(() => nodeLibraryRef.current?.focusSearch()); }}><Plus size={15} aria-hidden="true" />Add node</Button>}
          {isNarrowEditorLayout && <button ref={inspectorTriggerRef} className="inspector-reopen" type="button" aria-controls="node-inspector" aria-expanded={isInspectorDrawerOpen} onClick={() => setInspectorDrawerOpen(true)}><Layers3 size={15} /> Inspector</button>}
          <div className="canvas-navigation" role="group" aria-label="Canvas navigation">
            <span className="canvas-navigation__label">Canvas</span>
            <IconButton className="canvas-navigation__button" label="Fit canvas" onClick={() => fitCanvas()}><Maximize2 size={15} aria-hidden="true" /></IconButton>
            <IconButton className="canvas-navigation__button" label="Zoom out" onClick={() => zoomCanvas("out")}><Minus size={15} aria-hidden="true" /></IconButton>
            <IconButton className="canvas-navigation__button" label="Zoom in" onClick={() => zoomCanvas("in")}><Plus size={15} aria-hidden="true" /></IconButton>
            <IconButton className="canvas-navigation__button" label="Center selected node" onClick={centerSelectedNode} disabled={!selectedNodeId}><Crosshair size={15} aria-hidden="true" /></IconButton>
            <Button className="canvas-navigation__minimap" variant="ghost" aria-pressed={minimapOpen} onClick={() => setMinimapOpen((open) => !open)}>{minimapOpen ? "Hide minimap" : "Show minimap"}</Button>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(changes) => applyNodesChange(hasPending ? changes.filter((change) => change.type !== "remove") : changes)}
            onEdgesChange={applyEdgesChange}
            onConnect={handleConnect}
            onConnectStart={startConnection}
            onConnectEnd={finishConnection}
            onNodeClick={(_, node) => { selectNode(node.id); if (isNarrowEditorLayout) setInspectorDrawerOpen(true); }}
            onNodeContextMenu={(event, node) => { event.preventDefault(); setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY }); }}
            onPaneClick={() => { selectNode(null); setContextMenu(null); if (isNarrowEditorLayout) setInspectorDrawerOpen(false); }}
            onInit={(instance) => { flowRef.current = instance; }}
            selectionOnDrag
            multiSelectionKeyCode={["Meta", "Control"]}
            fitView
            defaultEdgeOptions={{ animated: true }}
          >
            <Background gap={18} size={1} />
            {minimapOpen && <MiniMap zoomable pannable />}
          </ReactFlow>
          <div className="canvas-status" role="status" aria-live="polite">
            <CirclePlay size={16} /> {notice}
          </div>
          <button className={`validation-summary validation-summary--${issues.some((issue) => issue.severity === "error") ? "error" : "ready"}`} type="button" onClick={() => setValidationOpen(true)} aria-haspopup="dialog">
            <Check size={15} />
            {issues.length === 0 ? "Graph is ready for a test run" : `View ${issues.length} validation notice${issues.length === 1 ? "" : "s"}`}
          </button>
        </section>
        {isInspectorDrawerOpen && <button className="inspector-backdrop" type="button" aria-label="Dismiss node inspector" onClick={closeInspectorDrawer} />}
        <NodeInspector node={selectedNode} execution={execution} credentials={credentials} workspaceId={workflow?.workspaceId ?? ""} workflowId={workflow?.id ?? ""} owner={workspaces.some((workspace) => workspace.id === workflow?.workspaceId && workspace.role === "OWNER")} onResolveApproval={resolveApproval} onDebugNode={(node) => void runNodeDebug(node)} onOpenWebhook={() => { if (isNarrowEditorLayout) setInspectorDrawerOpen(false); setWebhookOpen(true); }} webhookContext={webhookContext} isDebugging={activeOperation === "debugging"} isDrawerOpen={isInspectorDrawerOpen} onCloseDrawer={closeInspectorDrawer} draft={selectedNode ? inspectorDrafts[selectedNode.id] ?? {} : {}} onDraftChange={(kind, value) => { if (selectedNode) setInspectorDraft(selectedNode.id, kind, value); }} onApplySheets={(sheetDraft) => {
          if (!selectedNode) return false;
          const pending = inspectorDraftsRef.current[selectedNode.id];
          if (pending?.sheetsMapping !== sheetDraft || pending.json) return false;
          const state = useWorkflowEditorStore.getState();
          const latest = state.nodes.find((node) => node.id === selectedNode.id);
          if (!latest || latest.data.nodeType !== "action.google-sheets") return false;
          const config = applySheetsMapping(workflow?.workspaceId ?? "", latest.data.config, sheetDraft);
          state.updateNodeData(latest.id, { config });
          return true;
        }} hasPending={hasPending} />
      </div>
      {contextMenu && <div className="node-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onMouseLeave={() => setContextMenu(null)}>
        <button type="button" disabled={hasPending} onClick={() => { copyNode(contextMenu.nodeId); setContextMenu(null); }}>Copy node</button>
        <button type="button" disabled={hasPending} onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); setNotice("Node duplicated."); }}>Duplicate</button>
        <button className="node-context-menu__danger" type="button" disabled={hasPending} onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); setNotice("Node and its connections removed."); }}>Delete</button>
      </div>}
      {historyOpen && <WorkflowHistoryPanel versions={versions} loading={versionsLoading} onClose={() => setHistoryOpen(false)} />}
      {validationOpen && <GraphValidationPanel issues={issues} onClose={() => setValidationOpen(false)} />}
      {webhookOpen && workflow && webhookTrigger && <WebhookEndpointPanel workflow={workflow} config={webhookTrigger.config} isGitHub={isGitHubWebhookTrigger(webhookTrigger.type)} isUptimeKuma={isUptimeKumaTrigger(webhookTrigger.type)} isTelegram={webhookTrigger.type === "trigger.telegram.update"} isVercel={webhookTrigger.type === "trigger.vercel.deployment"} isTrello={webhookTrigger.type === "trigger.trello.board-action"} isSentry={webhookTrigger.type === "trigger.sentry.issue-created"} canRegister={Boolean(publishedWebhook)} onClose={() => setWebhookOpen(false)} />}
      {activationOpen && workflow && <WorkflowActivationPanel workflow={workflow} isSaving={activeOperation === "activating" || activeOperation === "deactivating"} readiness={liveReadiness} loading={liveReadinessLoading} error={liveReadinessError} onConfirm={() => void updateActivation()} onRefresh={() => void checkLiveReadiness()} onOpenCredentials={() => { setActivationOpen(false); setCredentialsOpen(true); }} onClose={() => setActivationOpen(false)} />}
      {liveConfirmOpen && workflow && <GoLivePanel workflow={workflow} isRunning={activeOperation === "live"} readiness={liveReadiness} loading={liveReadinessLoading} error={liveReadinessError} onConfirm={() => void runLive()} onRefresh={() => void checkLiveReadiness()} onOpenCredentials={() => { setLiveConfirmOpen(false); setCredentialsOpen(true); }} onClose={() => setLiveConfirmOpen(false)} />}
      {gmailPublishWarningOpen && <Dialog label="Confirm Gmail trigger change" onClose={() => setGmailPublishWarningOpen(false)}><DialogHeader title="Change the Gmail trigger?" onClose={() => setGmailPublishWarningOpen(false)} closeLabel="Close confirmation" /><p>Changing or removing the mailbox trigger discards its saved progress. Some messages and pending deliveries may be missed; already running executions may still finish.</p><div className="dialog-actions"><Button type="button" variant="secondary" onClick={() => setGmailPublishWarningOpen(false)}>Cancel</Button><Button type="button" variant="primary" disabled={isSaving} onClick={() => void publish(true)}>Publish and discard progress</Button></div></Dialog>}
      {rssPublishWarningOpen && <Dialog label="Confirm RSS trigger change" onClose={() => setRssPublishWarningOpen(false)}><DialogHeader title="Change the RSS trigger?" onClose={() => setRssPublishWarningOpen(false)} closeLabel="Close confirmation" /><p>Changing or removing the feed discards its saved progress. Some items and queued deliveries may be missed; already running executions may still finish.</p><div className="dialog-actions"><Button type="button" variant="secondary" onClick={() => setRssPublishWarningOpen(false)}>Cancel</Button><Button type="button" variant="primary" disabled={isSaving} onClick={() => void publish(false, true)}>Publish and discard progress</Button></div></Dialog>}
      {retryConfirmOpen && execution && <RetryExecutionPanel execution={execution} isRetrying={activeOperation === "retrying"} onConfirm={() => void retryExecution()} onClose={() => setRetryConfirmOpen(false)} />}
      {executionDetailsOpen && execution && <ExecutionDetailsPanel executionId={execution.id} onSelectNode={(nodeId) => { selectNode(nodeId); setExecutionDetailsOpen(false); if (isNarrowEditorLayout) setInspectorDrawerOpen(true); }} onClose={() => setExecutionDetailsOpen(false)} />}
      {libraryOpen && <WorkflowLibraryPanel initialWorkspaces={workspaces} activeWorkflowId={workflow?.id} activeWorkspaceId={workflow?.workspaceId} onOpen={openWorkflow} onWorkspaceCreated={(workspace) => setWorkspaces((current) => [workspace, ...current])} onClose={() => setLibraryOpen(false)} />}
      {credentialsOpen && workflow && <CredentialPanel workspaceId={workflow.workspaceId} onClose={() => setCredentialsOpen(false)} onSaved={setCredentials} />}
    </main>
  );
}
