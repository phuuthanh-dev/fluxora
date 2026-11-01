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
  FileUp,
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
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, apiUrl } from "../api/api-client";
import { validateWorkflowGraph } from "./graph-validation";
import {
  createNodeData,
  getNodeDefinition,
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
import { buildExpressionSuggestions } from "./expression-suggestions";
import { manualTriggerTestData } from "./test-data";
import { NodeIcon } from "./node-icon";
import { NodeLibrary, type NodeLibraryHandle } from "./node-library";
import { Button, Dialog, DialogHeader, Field, IconButton, Menu, Select, Status, useDialogFocus } from "../../components/ui";
import { useSurfaceMotion } from "../../components/ui/ui-motion";
import { AppShellHeader } from "../app-shell/app-shell-header";
import { ExecutionDetailsPanel, type ApiExecution } from "./execution-observability";
import { ResourcePicker } from "./resource-picker";
import { MongoFilterField } from "./mongodb-filter-field";
import type { InspectorDraft, InspectorDraftKind, StagedText, UpdateInspectorDraft } from "./inspector-drafts";
import type { MongoFilterRow } from "./mongodb-filter";

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode };

type WorkflowVersionSummary = { id: string; version: number; status: "DRAFT" | "PUBLISHED"; createdAt: string; publishedAt: string | null; nodeCount: number };
type WebhookEndpoint = { id: string; path: string; secretRequired: boolean; signingMode?: "registration" | "legacy"; workflowVersionId: string; createdAt: string; updatedAt: string };
type ProviderWebhookState = "CREATING" | "CREATE_DISPATCHING" | "CREATE_UNCERTAIN" | "CREATE_REJECTED" | "ACTIVE" | "DELETING" | "DELETE_UNCERTAIN" | "REMOVED";
type ProviderWebhookStatus = { enabled: boolean; endpoint: { id: string; path: string; workflowVersionId: string; updatedAt: string } | null; registration: { provider: string; repository: string; event: string; workflowVersionId: string; state: ProviderWebhookState; createdAt: string; updatedAt: string } | null; reconciliation?: { outcome: "MATCHED" | "DRIFTED" | "UNKNOWN" | "MANUAL_REQUIRED"; message: string } };
type ApiApproval = { id: string; status: string; expiresAt: string; executionId: string; workflowId: string };
type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type LiveReadinessRequirement = { nodeId: string; provider: CredentialProvider; credentialId: string | null; ready: boolean; reason: "MISSING_CREDENTIAL" | "CREDENTIAL_NOT_FOUND" | "CREDENTIAL_PROVIDER_MISMATCH" | null };
type LiveReadiness = { ready: boolean; requirements: LiveReadinessRequirement[] };

function readConfigText(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function isGitHubWebhookTrigger(nodeType: string) {
  return nodeType === "trigger.github.issue-opened" || nodeType === "trigger.github.pull-request-opened" || nodeType === "trigger.github.push" || nodeType === "trigger.github.workflow-run-completed";
}

function providerLabel(provider: CredentialProvider) {
  const labels: Record<CredentialProvider, string> = {
    GOOGLE_CHAT_WEBHOOK: "Google Chat",
    DISCORD_WEBHOOK: "Discord",
    TELEGRAM_BOT: "Telegram",
    GOOGLE: "Google",
    GITHUB: "GitHub",
    STEAM: "Steam",
    SMTP: "SMTP email",
    GEMINI: "Gemini",
    OPENAI: "OpenAI",
    MONGODB: "MongoDB",
    GOOGLE_CHAT_OAUTH: "Google Chat OAuth",
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

function ConfigField({ label, value, onChange, multiline = false, inputMode }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  inputMode?: "number";
}) {
  return (
    <Field label={label} className="config-field">
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} />
      ) : (
        <input type={inputMode} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
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

function NodeConfigurationFields({ fields, config, credentials, workspaceId, allowExpressions, onChange, draft, onDraftChange }: {
  fields: NodeConfigurationField[];
  config: Record<string, unknown>;
  credentials: CredentialSummary[];
  workspaceId: string;
  allowExpressions: boolean;
  onChange: (key: string, value: unknown) => void;
  draft: InspectorDraft;
  onDraftChange: UpdateInspectorDraft;
}) {
  return <>
    {fields.map((field) => {
      const expectedValue = field.visibleWhen?.equals;
      const currentValue = field.visibleWhen ? config[field.visibleWhen.key] : undefined;
      if (expectedValue !== undefined && !(Array.isArray(expectedValue) ? expectedValue.includes(currentValue as never) : currentValue === expectedValue)) return null;
      const value = readConfigurationFieldValue(config, field);
      if (field.kind === "credential") {
        return <CredentialField key={field.key} label={field.label} value={value} providers={field.providers} credentials={credentials} onChange={(nextValue) => onChange(field.key, nextValue)} optional={field.optional} />;
      }
      if (field.kind === "boolean") {
        return <label key={field.key} className="checkbox-field"><input type="checkbox" checked={config[field.key] !== false} onChange={(event) => onChange(field.key, event.target.checked)} /> {field.label}</label>;
      }
      if (field.kind === "resource") {
        return <ResourcePicker key={field.key} workspaceId={workspaceId} resource={field.resource} credentialId={readConfigText(config, field.credentialKey)} dependencyValue={field.dependencyKey ? readConfigText(config, field.dependencyKey) : undefined} label={field.label} value={value} placeholder={field.placeholder} allowExpression={allowExpressions} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      }
      if (field.kind === "select") {
        return <Field key={field.key} label={field.label} className="config-field"><Select aria-label={field.label} value={value} onChange={(event) => onChange(field.key, event.target.value)}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>;
      }
      if (field.kind === "key-value") {
        return <KeyValueField key={field.key} label={field.label} value={config[field.key]} keyPlaceholder={field.keyPlaceholder} valuePlaceholder={field.valuePlaceholder} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      }
      if (field.kind === "table") {
        return <TableField key={field.key} label={field.label} value={config[field.key]} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      }
      if (field.kind === "mongo-filter") return <MongoFilterField key={field.key} value={value} draft={draft.filter} onDraftChange={(next) => onDraftChange("filter", next)} rawDraft={draft.filterRaw} onRawDraftChange={(next) => onDraftChange("filterRaw", next)} onChange={(nextValue) => onChange(field.key, nextValue)} />;
      return <ConfigField
        key={field.key}
        label={field.label}
        value={value}
        multiline={field.kind === "textarea"}
        inputMode={field.kind === "number" ? "number" : undefined}
        onChange={(nextValue) => onChange(field.key, field.kind === "number" ? Number(nextValue) || field.fallbackValue : nextValue)}
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

function ResultView({ value }: { value: unknown }) {
  const [mode, setMode] = useState<ResultViewMode>("tree");
  const rows: Array<[string, unknown]> = value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [["value", value]];
  return (
    <div className="result-view">
      <div className="result-view__tabs" role="tablist" aria-label="Execution output format">
        {(["tree", "table", "raw"] as ResultViewMode[]).map((view) => <button key={view} className={mode === view ? "result-view__tab result-view__tab--active" : "result-view__tab"} type="button" onClick={() => setMode(view)}>{view === "raw" ? "Raw JSON" : view === "tree" ? "Tree" : "Table"}</button>)}
      </div>
      {mode === "tree" && <JsonTree value={value} />}
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

function ExpressionSuggestions({ suggestions }: { suggestions: string[] }) {
  const [notice, setNotice] = useState("");
  if (!suggestions.length) return null;
  const copy = async (suggestion: string) => {
    await navigator.clipboard?.writeText(suggestion);
    setNotice(`${suggestion} copied.`);
  };
  return <section className="expression-suggestions"><div className="section-label">EXPRESSION SUGGESTIONS</div><p>Use in any text field. Click to copy a safe data path.</p><div>{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { void copy(suggestion); }}>{suggestion}</button>)}</div>{notice && <small>{notice}</small>}</section>;
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

function GoLivePanel({ workflow, isRunning, readiness, loading, error, onConfirm, onClose, onRefresh, onOpenCredentials }: { workflow: ApiWorkflow; isRunning: boolean; readiness: LiveReadiness | null; loading: boolean; error: string | null; onConfirm: () => void; onClose: () => void; onRefresh: () => void; onOpenCredentials: () => void }) {
  const canRun = Boolean(workflow.published && readiness?.ready && !loading && !error && !isRunning);
  const blockers = readiness?.requirements.filter((requirement) => !requirement.ready) ?? [];
  return <Dialog label="Confirm live execution" className="go-live-panel" onClose={onClose}><DialogHeader eyebrow="LIVE EXECUTION" title="Run the published workflow?" onClose={onClose} closeLabel="Close live execution confirmation" /><p>This will call real providers and may send messages, write data, or create external side effects. The editor will run <strong>published version {workflow.published?.version ?? "—"}</strong>, never unsaved draft changes.</p>{!workflow.published && <p className="go-live-panel__warning">Publish this workflow first. Test runs stay safe and use deterministic mock providers.</p>}{loading && <Status tone="info" className="go-live-panel__readiness" aria-busy="true"><LoaderCircle className="ui-spinner" size={15} /> Checking live credentials…</Status>}{error && <Status tone="error" className="go-live-panel__readiness">{error} <Button variant="ghost" onClick={onRefresh}>Retry check</Button></Status>}{!loading && !error && readiness?.ready && <Status tone="success" className="go-live-panel__readiness">All live integrations are configured.</Status>}{!loading && !error && readiness && !readiness.ready && <div className="go-live-panel__blockers"><Status tone="error" className="go-live-panel__readiness">Live execution is blocked until these integrations are configured.</Status><ul>{blockers.map((requirement) => <li key={requirement.nodeId}><strong>{providerLabel(requirement.provider)}</strong><span>{reasonLabel(requirement.reason)}</span></li>)}</ul><Button variant="ghost" onClick={onOpenCredentials}>Open credentials</Button></div>}<div className="go-live-panel__actions"><Button variant="ghost" className="ghost-button" onClick={onClose}>Cancel</Button><Button variant="secondary" className="go-live-button" disabled={!canRun} onClick={onConfirm}>{isRunning ? "Starting…" : "Run live now"}</Button></div></Dialog>;
}

function RetryExecutionPanel({ execution, isRetrying, onConfirm, onClose }: { execution: ApiExecution; isRetrying: boolean; onConfirm: () => void; onClose: () => void }) {
  const isLive = execution.mode === "live";
  return <Dialog label={isLive ? "Confirm live retry" : "Retry execution"} className="go-live-panel" onClose={onClose}><DialogHeader eyebrow="RETRY EXECUTION" title={isLive ? "Retry this live execution?" : "Retry this test execution?"} onClose={onClose} closeLabel="Close retry confirmation" /><p>This creates a new execution from the original immutable workflow version and its original redacted trigger data.</p>{isLive ? <p className="go-live-panel__warning">This calls real providers again. A previous request may already have been accepted before the failure was recorded, so external delivery can be duplicated.</p> : <Status tone="info" className="go-live-panel__readiness">This remains a deterministic mock run and will not call an external provider.</Status>}<div className="go-live-panel__actions"><Button variant="ghost" className="ghost-button" disabled={isRetrying} onClick={onClose}>Cancel</Button><Button variant={isLive ? "secondary" : "primary"} disabled={isRetrying} onClick={onConfirm}>{isRetrying ? "Starting…" : isLive ? "Retry live run" : "Retry test run"}</Button></div></Dialog>;
}

function WorkflowActivationPanel({ workflow, isSaving, readiness, loading, error, onConfirm, onClose, onRefresh, onOpenCredentials }: { workflow: ApiWorkflow; isSaving: boolean; readiness: LiveReadiness | null; loading: boolean; error: string | null; onConfirm: () => void; onClose: () => void; onRefresh: () => void; onOpenCredentials: () => void }) {
  const isDeactivation = workflow.isActive;
  const blockers = readiness?.requirements.filter((requirement) => !requirement.ready) ?? [];
  const canConfirm = isDeactivation || Boolean(workflow.published && readiness?.ready && !loading && !error && !isSaving);
  return <Dialog label={isDeactivation ? "Deactivate workflow" : "Activate workflow"} className="go-live-panel" onClose={onClose}><DialogHeader eyebrow="WORKFLOW ACTIVATION" title={isDeactivation ? "Deactivate this workflow?" : "Activate this workflow?"} onClose={onClose} closeLabel="Close workflow activation" />{isDeactivation ? <p>Scheduled and webhook triggers will stop accepting new work. Existing executions are not cancelled.</p> : <p>Activation enables published Cron and Webhook triggers. It does not send a manual run now; use <strong>Run live</strong> when you want an immediate provider call.</p>}{!isDeactivation && !workflow.published && <p className="go-live-panel__warning">Publish this workflow first.</p>}{!isDeactivation && loading && <Status tone="info" className="go-live-panel__readiness" aria-busy="true"><LoaderCircle className="ui-spinner" size={15} /> Checking live credentials…</Status>}{!isDeactivation && error && <Status tone="error" className="go-live-panel__readiness">{error} <Button variant="ghost" onClick={onRefresh}>Retry check</Button></Status>}{!isDeactivation && !loading && !error && readiness?.ready && <Status tone="success" className="go-live-panel__readiness">All live integrations are configured.</Status>}{!isDeactivation && !loading && !error && readiness && !readiness.ready && <div className="go-live-panel__blockers"><Status tone="error" className="go-live-panel__readiness">Activation is blocked until these integrations are configured.</Status><ul>{blockers.map((requirement) => <li key={requirement.nodeId}><strong>{providerLabel(requirement.provider)}</strong><span>{reasonLabel(requirement.reason)}</span></li>)}</ul><Button variant="ghost" onClick={onOpenCredentials}>Open credentials</Button></div>}<div className="go-live-panel__actions"><Button variant="ghost" className="ghost-button" onClick={onClose} disabled={isSaving}>Cancel</Button><Button variant={isDeactivation ? "danger" : "primary"} disabled={!canConfirm} onClick={onConfirm}>{isSaving ? "Working…" : isDeactivation ? "Deactivate workflow" : "Activate workflow"}</Button></div></Dialog>;
}

function WebhookEndpointPanel({ workflow, config, isGitHub, canRegister, onClose }: { workflow: ApiWorkflow; config: Record<string, unknown>; isGitHub: boolean; canRegister: boolean; onClose: () => void }) {
  const [path, setPath] = useState(readConfigText(config, "path"));
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
  const endpointUrl = `${apiUrl}/webhooks/${endpoint?.path ?? path}`;
  const githubEvent = readConfigText(config, "event") || "issues";
  const githubAction = readConfigText(config, "action");
  const githubEventLabel = githubAction ? `${githubEvent}.${githubAction}` : githubEvent;

  useEffect(() => {
    let isCurrent = true;
    setEndpointLoading(true);
    setEndpointError(null);
    const providerRequest = isGitHub ? apiRequest<{ providerWebhook: ProviderWebhookStatus }>(`/workflows/${workflow.id}/provider-webhook`) : Promise.resolve(null);
    void Promise.all([apiRequest<{ endpoint: WebhookEndpoint | null }>(`/workflows/${workflow.id}/webhook-endpoint`), providerRequest])
      .then(([response, providerResponse]) => { if (isCurrent) { setEndpoint(response.endpoint); if (response.endpoint) setPath(response.endpoint.path); setProviderWebhook(providerResponse?.providerWebhook ?? null); setProviderWebhookError(null); setNotice(response.endpoint ? isGitHub && response.endpoint.signingMode === "legacy" ? "Existing registration uses the connection’s legacy secret. It will keep working until you rotate it." : "An active endpoint is pinned to a published version." : "No endpoint has been created yet."); } })
      .catch((reason) => { if (isCurrent) setEndpointError(reason instanceof Error ? reason.message : "Unable to load webhook status."); })
      .finally(() => { if (isCurrent) setEndpointLoading(false); });
    return () => { isCurrent = false; };
  }, [workflow.id, isGitHub, endpointRetry]);

  const createEndpoint = async () => {
    setIsSaving(true);
    setCreatedSecret(null);
    setWriteError(null);
    try {
      const response = await apiRequest<{ endpoint: { id: string; path: string; secret: string | null; workflowVersionId: string; createdAt: string; updatedAt: string } }>(`/workflows/${workflow.id}/webhook-endpoint`, {
        method: "POST",
        body: JSON.stringify({ path, secretRequired, publishedVersionId: workflow.published?.id, expectedEndpoint: endpoint ? { id: endpoint.id, updatedAt: endpoint.updatedAt } : null }),
      });
      setEndpoint({ id: response.endpoint.id, path: response.endpoint.path, secretRequired: response.endpoint.secret !== null, workflowVersionId: response.endpoint.workflowVersionId, createdAt: response.endpoint.createdAt, updatedAt: response.endpoint.updatedAt });
      setCreatedSecret(response.endpoint.secret);
      setWriteUncertain(false);
      setNotice(response.endpoint.secret ? "Endpoint created. Copy the secret now; it will not be shown again." : "Endpoint created without a secret header.");
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
    {isGitHub ? <Status tone={providerWebhook?.registration?.state === "ACTIVE" ? "success" : "info"} className="webhook-endpoint-panel__help">{providerWebhook?.registration?.state === "ACTIVE" ? <>GitHub manages <code>{providerWebhook.registration.repository}</code> automatically for <code>{githubEventLabel}</code>. The manual endpoint stays available as a compatibility path.</> : <>Add this URL and signing secret in your repository’s GitHub webhook settings for <code>{githubEventLabel}</code>. You can connect it automatically when provider registration is enabled.</>}</Status> : <label className="checkbox-field"><input type="checkbox" checked={secretRequired} onChange={(event) => setSecretRequired(event.target.checked)} /> Require <code>x-workflow-secret</code> header</label>}
    {isGitHub && <div className="webhook-endpoint-panel__provider"><div><span className="webhook-endpoint-panel__provider-label">GITHUB CONNECTION</span><strong>{providerWebhook?.registration ? providerWebhookStateLabel(providerWebhook.registration.state) : providerWebhook?.enabled ? "Not connected" : "Manual setup"}</strong><small>{providerWebhook?.registration ? `${providerWebhook.registration.repository} · ${providerWebhook.registration.event}` : providerWebhook?.enabled ? "Use the connector credential to register this repository webhook." : "Automatic registration is disabled until the public HTTPS origin is configured."}</small></div><div className="webhook-endpoint-panel__provider-actions">{providerWebhook?.enabled && providerWebhook?.registration && !registrationIsBusy && <Button variant="ghost" disabled={providerWebhookAction !== null} onClick={() => void reconcileProviderWebhook()}>{providerWebhookAction === "reconcile" ? "Checking…" : providerWebhook.registration.state === "ACTIVE" ? "Verify remote" : "Reconcile"}</Button>}{providerWebhook?.enabled && providerWebhook?.registration?.state === "ACTIVE" ? <Button variant="ghost" disabled={providerWebhookAction !== null} onClick={() => setConfirmProviderDisconnect(true)}>{providerWebhookAction === "disconnect" ? "Disconnecting…" : "Disconnect"}</Button> : providerWebhook?.enabled && (!providerWebhook?.registration || providerWebhook.registration.state === "CREATE_REJECTED" || providerWebhook.registration.state === "REMOVED") ? <Button variant="secondary" disabled={!canRegister || providerWebhookAction !== null || endpointLoading || Boolean(endpointError)} onClick={() => void connectProviderWebhook()}>{providerWebhookAction === "connect" ? "Connecting…" : providerWebhook?.registration ? "Retry connection" : "Connect GitHub"}</Button> : null}</div></div>}
    {providerWebhook?.reconciliation && <Status tone={reconciliationTone} className="webhook-endpoint-panel__reconciliation">{providerWebhook.reconciliation.message}</Status>}
    <div className="webhook-endpoint-panel__url"><span>POST URL</span><code>{endpointUrl}</code><Button variant="ghost" onClick={() => void navigator.clipboard.writeText(endpointUrl)}>Copy URL</Button></div>
    {createdSecret && <div className="webhook-endpoint-panel__secret"><strong>Copy this secret now</strong><code>{createdSecret}</code><Button variant="ghost" onClick={() => void navigator.clipboard.writeText(createdSecret)}>Copy secret</Button><small>{isGitHub ? "It is displayed only once. Store it securely and paste it into GitHub." : "It is displayed only once. Store it securely and send it in the x-workflow-secret header."}</small></div>}
    {writeError && <Status tone="error">{writeError}</Status>}
    {providerWebhookError && <Status tone="error">{providerWebhookError}</Status>}
    {writeUncertain && <Status tone="warning">The request did not complete. The endpoint may have changed even if no secret was displayed. Check its status; if you do not have the current secret, rotate it again and update the external webhook.</Status>}
    <Status tone={endpointError ? "error" : "info"} className="webhook-endpoint-panel__notice">{endpointError ?? notice}</Status>
    {endpointError && <Button variant="ghost" onClick={() => setEndpointRetry((value) => value + 1)}>Retry status check</Button>}
    {confirmRotation && <div className="webhook-endpoint-panel__confirmation"><Status tone="warning">Rotating immediately replaces the secret. Update the external webhook with the new secret to resume delivery.</Status><Button variant="ghost" onClick={() => setConfirmRotation(false)}>Cancel</Button><Button variant="primary" disabled={isSaving} onClick={() => { setConfirmRotation(false); void createEndpoint(); }}>Confirm rotation</Button></div>}
    {confirmProviderDisconnect && <div className="webhook-endpoint-panel__confirmation"><Status tone="warning">This removes only the GitHub-managed remote webhook. The Fluxora endpoint and manual setup remain available.</Status><Button variant="ghost" disabled={providerWebhookAction !== null} onClick={() => setConfirmProviderDisconnect(false)}>Cancel</Button><Button variant="primary" disabled={providerWebhookAction !== null} onClick={() => void disconnectProviderWebhook()}>{providerWebhookAction === "disconnect" ? "Disconnecting…" : "Confirm disconnect"}</Button></div>}
    <Button variant="primary" className="run-button" onClick={() => endpoint ? setConfirmRotation(true) : void createEndpoint()} disabled={!canRegister || isSaving || endpointLoading || Boolean(endpointError) || !path.trim() || confirmRotation}>{endpointLoading ? "Checking registration…" : isSaving ? "Creating…" : endpoint ? "Rotate registration" : "Create registration"}</Button>
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

function NodeInspector({ node, execution, credentials, workspaceId, onResolveApproval, onDebugNode, onOpenWebhook, webhookContext, isDebugging, isDrawerOpen, onCloseDrawer, draft, onDraftChange, hasPending }: { node: WorkflowCanvasNode | undefined; execution: ApiExecution | null; credentials: CredentialSummary[]; workspaceId: string; onResolveApproval: (approvalId: string, decision: "approved" | "rejected") => void; onDebugNode: (node: WorkflowCanvasNode) => void; onOpenWebhook: () => void; webhookContext: "published" | "different" | "draft" | "other-draft"; isDebugging: boolean; isDrawerOpen: boolean; onCloseDrawer: () => void; draft: InspectorDraft; onDraftChange: UpdateInspectorDraft; hasPending: boolean }) {
  const updateNodeData = useWorkflowEditorStore((state) => state.updateNodeData);
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

  const definition = getNodeDefinition(node.data.nodeType);
  const nodeExecution = execution?.nodeExecutions.find((item) => item.nodeId === node.id);
  const approvalId = nodeExecution?.output && typeof nodeExecution.output === "object" && !Array.isArray(nodeExecution.output) && typeof (nodeExecution.output as Record<string, unknown>).approvalRequestId === "string"
    ? (nodeExecution.output as Record<string, unknown>).approvalRequestId as string
    : null;
  const updateConfig = (key: string, value: unknown) => {
    updateNodeData(node.id, { config: { ...node.data.config, [key]: value } });
  };
  const suggestions = buildExpressionSuggestions(execution?.nodeExecutions.map((item) => ({ nodeId: item.nodeId, output: item.output })) ?? []);

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
      {definition?.configurationFields && <NodeConfigurationFields key={node.id} fields={definition.configurationFields} config={node.data.config} credentials={credentials} workspaceId={workspaceId} allowExpressions={!node.data.nodeType.startsWith("trigger.")} onChange={updateConfig} draft={draft} onDraftChange={onDraftChange} />}
      {node.data.nodeType === "trigger.manual" && <TestDataEditor key={node.id} value={node.data.config.testData} onApply={(testData) => updateConfig("testData", testData)} draft={draft.testData} onDraftChange={(next) => onDraftChange("testData", next)} />}
      {node.data.nodeType === "trigger.cron" && (
        <>
          <ConfigField label="Cron expression" value={readConfigText(node.data.config, "expression")} onChange={(value) => updateConfig("expression", value)} />
          <ConfigField label="Timezone" value={readConfigText(node.data.config, "timezone")} onChange={(value) => updateConfig("timezone", value)} />
        </>
      )}
      {node.data.nodeType === "trigger.webhook" && (
        <>
          <ConfigField label="Public path" value={readConfigText(node.data.config, "path")} onChange={(value) => updateConfig("path", value)} />
          <label className="checkbox-field"><input type="checkbox" checked={node.data.config.secretRequired !== false} onChange={(event) => updateConfig("secretRequired", event.target.checked)} /> Require <code>x-workflow-secret</code> header</label>
        </>
      )}
      {(isGitHubWebhookTrigger(node.data.nodeType) || node.data.nodeType === "trigger.webhook") && <div className="inspector-webhook-setup"><Status tone={webhookContext === "different" || webhookContext === "other-draft" ? "warning" : "info"} className="inspector-note"><strong>Webhook setup</strong><span>{webhookContext === "different" ? "The published workflow uses a different webhook trigger. This setup manages that published trigger, not this draft node." : webhookContext === "other-draft" ? "This draft has multiple webhook triggers. Keep one trigger and publish before setting up its endpoint." : webhookContext === "published" ? "Setup uses the published workflow. Publish draft changes before applying them." : "Publish this workflow to set up its endpoint."}</span></Status>{webhookContext !== "other-draft" && <Button type="button" variant="ghost" className="inspector-webhook-setup__action" onClick={onOpenWebhook}>{webhookContext === "different" ? "Manage published webhook" : "Configure webhook"}</Button>}</div>}
      {node.data.nodeType === "action.telegram.message" && (
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
                <ConfigField label={`${destinationLabel} chat ID (legacy credential chatId is deprecated)`} value={readConfigText(node.data.config, "chatId")} onChange={(value) => updateConfig("chatId", value)} />
                {destinationType === "supergroup" && <ConfigField label="Topic / thread ID (optional)" value={readConfigText(node.data.config, "messageThreadId")} onChange={(value) => updateConfig("messageThreadId", value)} />}
              </>
            );
          })()}
          <ConfigField label="Message text" value={readConfigText(node.data.config, "text") || readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("text", value)} multiline />
          <Field label="Parse mode" className="config-field"><Select aria-label="Telegram parse mode" value={readConfigText(node.data.config, "parseMode")} onChange={(event) => updateConfig("parseMode", event.target.value)}><option value="">Plain text</option><option value="Markdown">Markdown</option><option value="HTML">HTML</option><option value="MarkdownV2">MarkdownV2</option></Select></Field>
        </>
      )}
      {node.data.nodeType === "condition.if" && (
        <>
          <ConfigField label="Left value" value={readConfigText(node.data.config, "left")} onChange={(value) => updateConfig("left", value)} />
          <Field label="Operator" className="config-field"><Select aria-label="Condition operator" value={readConfigText(node.data.config, "operator") || "equals"} onChange={(event) => updateConfig("operator", event.target.value)}><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="contains">Contains</option><option value="exists">Exists</option></Select></Field>
          <ConfigField label="Right value" value={readConfigText(node.data.config, "right")} onChange={(value) => updateConfig("right", value)} />
        </>
      )}
      {node.data.nodeType === "condition.switch" && (
        <>
          <ConfigField label="Value to evaluate" value={readConfigText(node.data.config, "value")} onChange={(value) => updateConfig("value", value)} />
          <SwitchCaseEditor cases={node.data.config.cases} onChange={(cases) => updateConfig("cases", cases)} />
        </>
      )}
      {node.data.nodeType === "approval.request" && <>
        <ConfigField label="Approval message" value={readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("message", value)} multiline />
        <Field label="Notification provider" className="config-field"><Select aria-label="Approval notification provider" value={readConfigText(node.data.config, "notificationProvider") || "google_chat"} onChange={(event) => updateConfig("notificationProvider", event.target.value)}><option value="google_chat">Google Chat</option><option value="http_webhook">HTTP webhook</option></Select></Field>
        <CredentialField label="Notification credential (optional)" value={readConfigText(node.data.config, "notificationCredentialId")} providers={readConfigText(node.data.config, "notificationProvider") === "http_webhook" ? ["HTTP"] : ["GOOGLE_CHAT_WEBHOOK"]} credentials={credentials} onChange={(value) => updateConfig("notificationCredentialId", value)} optional />
      </>}
      {definition && !definition.available && <p className="planned-note">This node is visible for roadmap clarity, but cannot run in the MVP.</p>}
      </InspectorSection>
      <InspectorSection title="Test & debug">
        <section className="node-debug-panel">
          <div><p className="section-label">NODE DEBUG</p><p>Runs only this node with mock providers. No live request or downstream node will run.</p></div>
          <Button variant="secondary" className="node-debug-panel__button" disabled={!definition?.available || node.data.nodeType === "approval.request" || isDebugging || hasPending} title={hasPending ? "Apply or discard pending edits first." : node.data.nodeType === "approval.request" ? "Approval nodes are tested in a full workflow run." : undefined} onClick={() => onDebugNode(node)}><Play size={14} />{isDebugging ? "Running node…" : "Run node"}</Button>
        </section>
        <section className="input-preview">
          <div className="section-label">INPUT PREVIEW</div>
          <pre>{JSON.stringify(node.data.config, null, 2)}</pre>
        </section>
      </InspectorSection>
      <InspectorSection title="Advanced">
        <JsonConfigEditor key={node.id} config={node.data.config} onApply={(config) => updateNodeData(node.id, { config })} draft={draft.json} onDraftChange={(next) => onDraftChange("json", next)} otherPending={draft.filter !== undefined || draft.filterRaw !== undefined || draft.testData !== undefined} />
        <ExpressionSuggestions suggestions={suggestions} />
      </InspectorSection>
      {nodeExecution && (
        <InspectorSection title="Last execution">
          <section className="input-preview">
            <div className="section-label">{nodeExecution.status} · ATTEMPT {nodeExecution.attempt} · {nodeExecution.durationMs ?? 0}MS</div>
            <div className="execution-inspector__section"><strong>Redacted input</strong><ResultView value={nodeExecution.input} /></div>
            <div className="execution-inspector__section"><strong>{nodeExecution.error ? "Normalized error" : "Output"}</strong><ResultView value={nodeExecution.error ?? nodeExecution.output} /></div>
            {nodeExecution.status === "WAITING" && approvalId && (
              <div className="approval-actions">
                <button className="run-button" type="button" onClick={() => onResolveApproval(approvalId, "approved")}>Approve &amp; resume</button>
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
  const [inspectorDrafts, setInspectorDrafts] = useState<Record<string, InspectorDraft>>({});
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
  const publishedWebhook = publishedNodes.find((node) => isGitHubWebhookTrigger(node.type)) ?? publishedNodes.find((node) => node.type === "trigger.webhook");
  const draftWebhook = nodes.find((node) => isGitHubWebhookTrigger(node.data.nodeType)) ?? nodes.find((node) => node.data.nodeType === "trigger.webhook");
  const webhookContext = publishedWebhook ? (selectedNode?.id === publishedWebhook.id && selectedNode.data.nodeType === publishedWebhook.type ? "published" : "different") : selectedNode?.id === draftWebhook?.id ? "draft" : "other-draft";
  const webhookTrigger = publishedWebhook ? { type: publishedWebhook.type, config: publishedWebhook.config } : draftWebhook ? { type: draftWebhook.data.nodeType, config: draftWebhook.data.config } : null;
  const isNarrowEditorLayout = useNarrowEditorLayout();
  const isInspectorDrawerOpen = isNarrowEditorLayout && inspectorDrawerOpen;

  const setInspectorDraft = (nodeId: string, kind: InspectorDraftKind, value: MongoFilterRow[] | StagedText | undefined) => {
    setInspectorDrafts((current) => {
      const draft = { ...current[nodeId] };
      if (value === undefined) delete draft[kind];
      else if (kind === "filter" && Array.isArray(value)) draft.filter = value;
      else if (kind === "filterRaw" && !Array.isArray(value)) draft.filterRaw = value;
      else if (kind === "json" && !Array.isArray(value)) draft.json = value;
      else if (kind === "testData" && !Array.isArray(value)) draft.testData = value;
      const next = { ...current };
      if (Object.keys(draft).length) next[nodeId] = draft;
      else delete next[nodeId];
      return next;
    });
  };
  const reviewPending = () => {
    if (!pendingNode) return;
    selectNode(pendingNode.id);
    if (isNarrowEditorLayout) setInspectorDrawerOpen(true);
    setNotice(`Apply or discard edits in ${pendingNode.data.label} before continuing.`);
  };
  const allowNavigation = () => { if (!hasPending) return true; reviewPending(); return false; };

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
        loadGraph(graphFromApi(graph));
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
    loadGraph(graphFromApi(graph));
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
    if (!workflow) return;
    setActiveOperation("cloning");
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/clone`, { method: "POST" });
      const graph = response.workflow.draft?.graph ?? response.workflow.published?.graph;
      if (!graph) throw new Error("The cloned workflow has no graph.");
      loadGraph(graphFromApi(graph));
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
    event.dataTransfer.setData("application/workflow-node", definition.type);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/workflow-node");
    const definition = getNodeDefinition(type);
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
      loadGraph(parseWorkflowCanvasGraph(parsed));
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
    const errors = issues.filter((issue) => issue.severity === "error");
    if (errors.length) {
      setNotice("Resolve graph errors before saving this draft.");
      return false;
    }
    setActiveOperation(operation);
    setIsSaving(true);
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/draft`, {
        method: "PATCH",
        body: JSON.stringify({ name: workflow.name, description: workflow.description, graph: graphForApi({ nodes, edges }) }),
      });
      setWorkflow(response.workflow);
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

  const publish = async () => {
    if (!workflow) return;
    const saved = await saveDraft("publishing", true);
    if (!saved) {
      setActiveOperation(null);
      return;
    }
    setIsSaving(true);
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/publish`, { method: "POST" });
      setWorkflow(response.workflow);
      setNotice(`Version ${response.workflow.published?.version ?? ""} published. A new editable draft is ready.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to publish the workflow.");
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
    setIsSaving(true);
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/workflows/${workflow.id}/executions`, {
        method: "POST",
        body: JSON.stringify({ mock: true, triggerData: manualTriggerTestData(nodes) }),
      });
      setExecution(response.execution);
      setNotice(`Mock execution ${response.execution.status.toLowerCase()} — select a node to inspect its output.`);
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
    setIsSaving(true);
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/workflows/${workflow.id}/executions`, {
        method: "POST",
        body: JSON.stringify({ mock: true, nodeId: node.id, triggerData: manualTriggerTestData(nodes) }),
      });
      setExecution(response.execution);
      setNotice(`Mock node debug ${response.execution.status.toLowerCase()} — only ${node.data.label} ran.`);
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
    setActivationOpen(false);
    setActiveOperation(activating ? "activating" : "deactivating");
    setIsSaving(true);
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/${activating ? "activate" : "deactivate"}`, { method: "POST" });
      setWorkflow(response.workflow);
      setNotice(activating ? "Workflow is live. Its Cron and Webhook triggers can now accept new work." : "Workflow is inactive. New Cron and Webhook executions are stopped.");
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
    try {
      const result = await apiRequest<{ approval: { executionId: string; resumed: boolean } }>(`/approvals/${approvalId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      const response = await apiRequest<{ execution: ApiExecution }>(`/executions/${result.approval.executionId}`);
      setExecution(response.execution);
      setNotice(decision === "approved" ? "Approval accepted and execution resumed." : "Approval rejected; execution stopped.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to resolve approval.");
    }
  };

  const cancelExecution = async () => {
    if (!execution) return;
    try {
      const response = await apiRequest<{ execution: ApiExecution }>(`/executions/${execution.id}/cancel`, { method: "POST" });
      setExecution(response.execution);
      setNotice("Execution cancelled. Pending work will not continue.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to cancel execution.");
    }
  };

  const retryExecution = async () => {
    if (!execution || execution.status !== "FAILED") return;
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
        <NodeInspector node={selectedNode} execution={execution} credentials={credentials} workspaceId={workflow?.workspaceId ?? ""} onResolveApproval={resolveApproval} onDebugNode={(node) => void runNodeDebug(node)} onOpenWebhook={() => { if (isNarrowEditorLayout) setInspectorDrawerOpen(false); setWebhookOpen(true); }} webhookContext={webhookContext} isDebugging={activeOperation === "debugging"} isDrawerOpen={isInspectorDrawerOpen} onCloseDrawer={closeInspectorDrawer} draft={selectedNode ? inspectorDrafts[selectedNode.id] ?? {} : {}} onDraftChange={(kind, value) => { if (selectedNode) setInspectorDraft(selectedNode.id, kind, value); }} hasPending={hasPending} />
      </div>
      {contextMenu && <div className="node-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onMouseLeave={() => setContextMenu(null)}>
        <button type="button" disabled={hasPending} onClick={() => { copyNode(contextMenu.nodeId); setContextMenu(null); }}>Copy node</button>
        <button type="button" disabled={hasPending} onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); setNotice("Node duplicated."); }}>Duplicate</button>
        <button className="node-context-menu__danger" type="button" disabled={hasPending} onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); setNotice("Node and its connections removed."); }}>Delete</button>
      </div>}
      {historyOpen && <WorkflowHistoryPanel versions={versions} loading={versionsLoading} onClose={() => setHistoryOpen(false)} />}
      {validationOpen && <GraphValidationPanel issues={issues} onClose={() => setValidationOpen(false)} />}
      {webhookOpen && workflow && webhookTrigger && <WebhookEndpointPanel workflow={workflow} config={webhookTrigger.config} isGitHub={isGitHubWebhookTrigger(webhookTrigger.type)} canRegister={Boolean(publishedWebhook)} onClose={() => setWebhookOpen(false)} />}
      {activationOpen && workflow && <WorkflowActivationPanel workflow={workflow} isSaving={activeOperation === "activating" || activeOperation === "deactivating"} readiness={liveReadiness} loading={liveReadinessLoading} error={liveReadinessError} onConfirm={() => void updateActivation()} onRefresh={() => void checkLiveReadiness()} onOpenCredentials={() => { setActivationOpen(false); setCredentialsOpen(true); }} onClose={() => setActivationOpen(false)} />}
      {liveConfirmOpen && workflow && <GoLivePanel workflow={workflow} isRunning={activeOperation === "live"} readiness={liveReadiness} loading={liveReadinessLoading} error={liveReadinessError} onConfirm={() => void runLive()} onRefresh={() => void checkLiveReadiness()} onOpenCredentials={() => { setLiveConfirmOpen(false); setCredentialsOpen(true); }} onClose={() => setLiveConfirmOpen(false)} />}
      {retryConfirmOpen && execution && <RetryExecutionPanel execution={execution} isRetrying={activeOperation === "retrying"} onConfirm={() => void retryExecution()} onClose={() => setRetryConfirmOpen(false)} />}
      {executionDetailsOpen && execution && <ExecutionDetailsPanel executionId={execution.id} onSelectNode={(nodeId) => { selectNode(nodeId); setExecutionDetailsOpen(false); if (isNarrowEditorLayout) setInspectorDrawerOpen(true); }} onClose={() => setExecutionDetailsOpen(false)} />}
      {libraryOpen && <WorkflowLibraryPanel initialWorkspaces={workspaces} activeWorkflowId={workflow?.id} activeWorkspaceId={workflow?.workspaceId} onOpen={openWorkflow} onWorkspaceCreated={(workspace) => setWorkspaces((current) => [workspace, ...current])} onClose={() => setLibraryOpen(false)} />}
      {credentialsOpen && workflow && <CredentialPanel workspaceId={workflow.workspaceId} onClose={() => setCredentialsOpen(false)} onSaved={setCredentials} />}
    </main>
  );
}
