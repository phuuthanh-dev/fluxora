"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
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
  Download,
  FileUp,
  History,
  Layers3,
  LayoutDashboard,
  KeyRound,
  LoaderCircle,
  Play,
  Save,
  Sparkles,
  Search,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, apiUrl } from "../api/api-client";
import { validateWorkflowGraph } from "./graph-validation";
import {
  createNodeData,
  getNodeDefinition,
  groupNodeLibrary,
  matchesNodeLibraryFilter,
  nodeCatalog,
  nodeLibraryFilters,
  type NodeDefinition,
  type NodeLibraryFilter,
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
import { ThemeToggle } from "../theme/theme-toggle";
import { Button, Dialog, Field, IconButton, Menu, Select, Status } from "../../components/ui";

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode };

type ApiExecution = {
  id: string;
  status: string;
  nodeExecutions: Array<{ nodeId: string; status: string; attempt: number; input: unknown; output: unknown; error: { code: string; message: string } | null; durationMs: number | null }>;
};

type WorkflowVersionSummary = { id: string; version: number; status: "DRAFT" | "PUBLISHED"; createdAt: string; publishedAt: string | null; nodeCount: number };
type WebhookEndpoint = { id: string; path: string; secretRequired: boolean; workflowVersionId: string; createdAt: string; updatedAt: string };
type ApiApproval = { id: string; status: string; expiresAt: string; executionId: string; workflowId: string };
type WorkspaceSummary = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
type LiveReadinessRequirement = { nodeId: string; provider: CredentialProvider; credentialId: string | null; ready: boolean; reason: "MISSING_CREDENTIAL" | "CREDENTIAL_NOT_FOUND" | "CREDENTIAL_PROVIDER_MISMATCH" | null };
type LiveReadiness = { ready: boolean; requirements: LiveReadinessRequirement[] };

function readConfigText(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function providerLabel(provider: CredentialProvider) {
  return provider === "GOOGLE_CHAT_WEBHOOK" ? "Google Chat" : provider === "DISCORD_WEBHOOK" ? "Discord" : provider === "TELEGRAM_BOT" ? "Telegram" : provider === "GOOGLE" ? "Google" : provider === "STEAM" ? "Steam" : "HTTP";
}

function reasonLabel(reason: LiveReadinessRequirement["reason"]) {
  return reason === "MISSING_CREDENTIAL" ? "Select a credential in the node inspector." : reason === "CREDENTIAL_NOT_FOUND" ? "The selected credential no longer exists." : "The selected credential belongs to another provider.";
}

function readFirstRow(config: Record<string, unknown>) {
  const values = config.values;
  if (!Array.isArray(values) || !Array.isArray(values[0])) return "";
  return values[0].map((value) => String(value ?? "")).join(", ");
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

function JsonConfigEditor({ config, onApply }: { config: Record<string, unknown>; onApply: (config: Record<string, unknown>) => void }) {
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setText(JSON.stringify(config, null, 2)); }, [config]);

  const apply = () => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Configuration must be a JSON object.");
      onApply(parsed as Record<string, unknown>);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Configuration is not valid JSON.");
    }
  };

  return <section className="json-config-editor"><div className="section-label">JSON CONFIGURATION</div><textarea value={text} onChange={(event) => setText(event.target.value)} rows={7} aria-label="Node JSON configuration" /><button className="ghost-button" type="button" onClick={apply}>Apply JSON</button>{error && <p role="alert">{error}</p>}</section>;
}

function TestDataEditor({ value, onApply }: { value: unknown; onApply: (value: Record<string, unknown>) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(JSON.stringify(value ?? {}, null, 2)); }, [value]);
  const apply = () => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Test data must be a JSON object.");
      onApply(parsed as Record<string, unknown>);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Test data is not valid JSON.");
    }
  };
  return <section className="json-config-editor"><div className="section-label">TEST DATA FOR MOCK RUN</div><textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} aria-label="Manual trigger test data" /><button className="ghost-button" type="button" onClick={apply}>Apply test data</button>{error && <p role="alert">{error}</p>}</section>;
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
  return <Dialog label="Workflow version history" className="workflow-history" modal={false}><div className="credential-panel__heading"><div><p className="section-label">VERSION HISTORY</p><h2>Immutable releases</h2></div><IconButton label="Close workflow history" className="icon-button" onClick={onClose}>×</IconButton></div>{loading ? <p>Loading versions…</p> : <ol>{versions.map((version) => <li key={version.id}><strong>v{version.version} · {version.status.toLowerCase()}</strong><span>{version.nodeCount} nodes · {version.publishedAt ? `published ${new Date(version.publishedAt).toLocaleString()}` : `draft ${new Date(version.createdAt).toLocaleString()}`}</span></li>)}</ol>}</Dialog>;
}

function GraphValidationPanel({ issues, onClose }: { issues: ReturnType<typeof validateWorkflowGraph>; onClose: () => void }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return (
    <Dialog label="Workflow validation details" className="graph-validation-panel" modal={false}>
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
  return <Dialog label="Confirm live execution" className="go-live-panel"><div className="credential-panel__heading"><div><p className="section-label">LIVE EXECUTION</p><h2>Run the published workflow?</h2></div><IconButton label="Close live execution confirmation" className="icon-button" onClick={onClose}>×</IconButton></div><p>This will call real providers and may send messages, write data, or create external side effects. The editor will run <strong>published version {workflow.published?.version ?? "—"}</strong>, never unsaved draft changes.</p>{!workflow.published && <p className="go-live-panel__warning">Publish this workflow first. Test runs stay safe and use deterministic mock providers.</p>}{loading && <Status tone="info" className="go-live-panel__readiness" aria-busy="true"><LoaderCircle className="ui-spinner" size={15} /> Checking live credentials…</Status>}{error && <Status tone="error" className="go-live-panel__readiness">{error} <Button variant="ghost" onClick={onRefresh}>Retry check</Button></Status>}{!loading && !error && readiness?.ready && <Status tone="success" className="go-live-panel__readiness">All live integrations are configured.</Status>}{!loading && !error && readiness && !readiness.ready && <div className="go-live-panel__blockers"><Status tone="error" className="go-live-panel__readiness">Live execution is blocked until these integrations are configured.</Status><ul>{blockers.map((requirement) => <li key={requirement.nodeId}><strong>{providerLabel(requirement.provider)}</strong><span>{reasonLabel(requirement.reason)}</span></li>)}</ul><Button variant="ghost" onClick={onOpenCredentials}>Open credentials</Button></div>}<div className="go-live-panel__actions"><Button variant="ghost" className="ghost-button" onClick={onClose}>Cancel</Button><Button variant="secondary" className="go-live-button" disabled={!canRun} onClick={onConfirm}>{isRunning ? "Starting…" : "Run live now"}</Button></div></Dialog>;
}

function WebhookEndpointPanel({ workflow, config, onClose }: { workflow: ApiWorkflow; config: Record<string, unknown>; onClose: () => void }) {
  const [path, setPath] = useState(readConfigText(config, "path"));
  const [secretRequired, setSecretRequired] = useState(config.secretRequired !== false);
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState("Loading endpoint status…");
  const [isSaving, setIsSaving] = useState(false);
  const endpointUrl = `${apiUrl}/webhooks/${endpoint?.path ?? path}`;

  useEffect(() => {
    let isCurrent = true;
    void apiRequest<{ endpoint: WebhookEndpoint | null }>(`/workflows/${workflow.id}/webhook-endpoint`)
      .then((response) => { if (isCurrent) { setEndpoint(response.endpoint); setNotice(response.endpoint ? "An active endpoint is pinned to the published version." : "No endpoint has been created yet."); } })
      .catch((reason) => { if (isCurrent) setNotice(reason instanceof Error ? reason.message : "Unable to load webhook status."); });
    return () => { isCurrent = false; };
  }, [workflow.id]);

  const createEndpoint = async () => {
    setIsSaving(true);
    try {
      const response = await apiRequest<{ endpoint: { id: string; path: string; secret: string | null } }>(`/workflows/${workflow.id}/webhook-endpoint`, {
        method: "POST",
        body: JSON.stringify({ path, secretRequired }),
      });
      setEndpoint({ id: response.endpoint.id, path: response.endpoint.path, secretRequired: response.endpoint.secret !== null, workflowVersionId: workflow.published?.id ?? "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setCreatedSecret(response.endpoint.secret);
      setNotice(response.endpoint.secret ? "Endpoint created. Copy the secret now; it will not be shown again." : "Endpoint created without a secret header.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to create the webhook endpoint.");
    } finally {
      setIsSaving(false);
    }
  };

  return <Dialog label="Webhook endpoint" className="webhook-endpoint-panel" modal={false}><div className="credential-panel__heading"><div><p className="section-label">INBOUND WEBHOOK</p><h2>Webhook endpoint</h2></div><IconButton label="Close webhook endpoint" className="icon-button" onClick={onClose}>×</IconButton></div><p>Endpoints are pinned to a published workflow version. Publishing again does not change an existing endpoint until you rotate it here.</p><ConfigField label="Public path" value={path} onChange={setPath} /><label className="checkbox-field"><input type="checkbox" checked={secretRequired} onChange={(event) => setSecretRequired(event.target.checked)} /> Require <code>x-workflow-secret</code> header</label><div className="webhook-endpoint-panel__url"><span>POST URL</span><code>{endpointUrl}</code></div>{createdSecret && <div className="webhook-endpoint-panel__secret"><strong>Copy this secret now</strong><code>{createdSecret}</code><small>It is displayed only after this creation or rotation.</small></div>}<Status tone="info" className="webhook-endpoint-panel__notice">{notice}</Status><Button variant="primary" className="run-button" onClick={() => void createEndpoint()} disabled={!workflow.published || isSaving || !path.trim()}>{isSaving ? "Creating…" : endpoint ? "Rotate endpoint secret" : "Create endpoint"}</Button>{!workflow.published && <small className="webhook-endpoint-panel__warning">Publish a version containing this Webhook trigger before creating its endpoint.</small>}</Dialog>;
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

  return <section className="workflow-library" role="dialog" aria-modal="false" aria-label="Workflow library"><div className="credential-panel__heading"><div><p className="section-label">WORKSPACE LIBRARY</p><h2>Workflows</h2></div><button className="icon-button" type="button" aria-label="Close workflow library" onClick={onClose}>×</button></div><label className="workflow-library__field"><span>Workspace</span><select value={workspaceId} onChange={(event) => switchWorkspace(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><div className="workflow-library__create"><input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} placeholder="New workspace name" /><button className="ghost-button" type="button" onClick={() => void createWorkspace()} disabled={isSaving || !newWorkspaceName.trim()}>Create workspace</button></div><div className="workflow-library__list">{workflows.map((candidate) => <button key={candidate.id} className={candidate.id === activeWorkflowId ? "workflow-library__item workflow-library__item--active" : "workflow-library__item"} type="button" onClick={() => onOpen(candidate)}><strong>{candidate.name}</strong><span>{candidate.published ? `Published v${candidate.published.version}` : "Draft only"}</span></button>)}</div><div className="workflow-library__new"><p className="section-label">CREATE WORKFLOW</p><input value={newWorkflowName} onChange={(event) => setNewWorkflowName(event.target.value)} aria-label="New workflow name" /><div><button className="run-button" type="button" onClick={() => void createWorkflow()} disabled={isSaving || !workspaceId || !newWorkflowName.trim()}>{isSaving && !lastCreateTemplate ? "Creating…" : "Start blank"}</button><button className="ghost-button" type="button" onClick={() => void createWorkflow("steam-daily-report")} disabled={isSaving || !workspaceId}>{isSaving && lastCreateTemplate ? "Creating…" : "Use Steam template"}</button></div>{createError && <p className="workflow-library__error" role="alert">{createError} <button type="button" className="ghost-button" onClick={() => void createWorkflow(lastCreateTemplate)}>Retry</button></p>}</div>{isLoadingWorkflows && <p className="workflow-library__notice" aria-live="polite">Loading workflows…</p>}{loadError && <p className="workflow-library__notice workflow-library__notice--error" role="alert">{loadError} <button type="button" className="ghost-button" onClick={() => void loadWorkflows(workspaceId)}>Retry</button></p>}{!isLoadingWorkflows && !loadError && <p className="workflow-library__notice">{notice}</p>}</section>;
}

function NodeInspector({ node, execution, credentials, onResolveApproval, onDebugNode, isDebugging }: { node: WorkflowCanvasNode | undefined; execution: ApiExecution | null; credentials: CredentialSummary[]; onResolveApproval: (approvalId: string, decision: "approved" | "rejected") => void; onDebugNode: (node: WorkflowCanvasNode) => void; isDebugging: boolean }) {
  const updateNodeData = useWorkflowEditorStore((state) => state.updateNodeData);

  if (!node) {
    return (
      <aside className="inspector inspector--empty">
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
    <aside className="inspector">
      <div className="inspector__heading">
        <span className="inspector__category">{node.data.category}</span>
        <h2>{node.data.label}</h2>
        <p>{node.data.description}</p>
      </div>
      <ConfigField
        label="Display name"
        value={node.data.label}
        onChange={(label) => updateNodeData(node.id, { label })}
      />
      {node.data.nodeType === "trigger.manual" && <TestDataEditor value={node.data.config.testData} onApply={(testData) => updateConfig("testData", testData)} />}
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
      {node.data.nodeType === "action.steam.account-snapshot" && (
        <>
          <CredentialField label="Steam credential" value={readConfigText(node.data.config, "credentialId")} providers={["STEAM"]} credentials={credentials} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Steam ID 64" value={readConfigText(node.data.config, "steamId")} onChange={(value) => updateConfig("steamId", value)} />
          <label className="checkbox-field"><input type="checkbox" checked={node.data.config.includeOwnedGames !== false} onChange={(event) => updateConfig("includeOwnedGames", event.target.checked)} /> Include owned games and playtime</label>
          <label className="checkbox-field"><input type="checkbox" checked={node.data.config.includeRecentGames !== false} onChange={(event) => updateConfig("includeRecentGames", event.target.checked)} /> Include recently played games</label>
          <ConfigField label="Achievement app ID (optional)" value={readConfigText(node.data.config, "achievementAppId")} onChange={(value) => updateConfig("achievementAppId", value)} />
        </>
      )}
      {node.data.nodeType === "action.google-chat.webhook" && (
        <>
          <CredentialField label="Google Chat credential" value={readConfigText(node.data.config, "credentialId")} providers={["GOOGLE_CHAT_WEBHOOK"]} credentials={credentials} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Message template" value={readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("message", value)} multiline />
        </>
      )}
      {node.data.nodeType === "action.discord.webhook" && (
        <>
          <CredentialField label="Discord credential" value={readConfigText(node.data.config, "credentialId")} providers={["DISCORD_WEBHOOK"]} credentials={credentials} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Message content" value={readConfigText(node.data.config, "content") || readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("content", value)} multiline />
          <ConfigField label="Username (optional)" value={readConfigText(node.data.config, "username")} onChange={(value) => updateConfig("username", value)} />
          <ConfigField label="Avatar URL (optional)" value={readConfigText(node.data.config, "avatarUrl")} onChange={(value) => updateConfig("avatarUrl", value)} />
          <ConfigField label="Embeds JSON (optional)" value={typeof node.data.config.embeds === "object" ? JSON.stringify(node.data.config.embeds, null, 2) : readConfigText(node.data.config, "embeds")} onChange={(value) => updateConfig("embeds", value)} multiline />
        </>
      )}
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
          <ConfigField label="Parse mode (optional: Markdown, HTML, MarkdownV2)" value={readConfigText(node.data.config, "parseMode")} onChange={(value) => updateConfig("parseMode", value)} />
        </>
      )}
      {node.data.nodeType === "action.google-drive" && (
        <>
          <CredentialField label="Google credential" value={readConfigText(node.data.config, "credentialId")} providers={["GOOGLE"]} credentials={credentials} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Operation (list, search, uploadText, downloadText)" value={readConfigText(node.data.config, "operation")} onChange={(value) => updateConfig("operation", value)} />
          <ConfigField label="Search query / file ID" value={readConfigText(node.data.config, "query") || readConfigText(node.data.config, "fileId")} onChange={(value) => updateConfig(readConfigText(node.data.config, "operation") === "downloadText" ? "fileId" : "query", value)} />
          <ConfigField label="File name" value={readConfigText(node.data.config, "name")} onChange={(value) => updateConfig("name", value)} />
          <ConfigField label="Text content" value={readConfigText(node.data.config, "text")} onChange={(value) => updateConfig("text", value)} multiline />
        </>
      )}
      {node.data.nodeType === "action.google-sheets" && (
        <>
          <CredentialField label="Google credential" value={readConfigText(node.data.config, "credentialId")} providers={["GOOGLE"]} credentials={credentials} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Spreadsheet ID" value={readConfigText(node.data.config, "spreadsheetId")} onChange={(value) => updateConfig("spreadsheetId", value)} />
          <ConfigField label="Operation (read, append, update)" value={readConfigText(node.data.config, "operation")} onChange={(value) => updateConfig("operation", value)} />
          <ConfigField label="Range" value={readConfigText(node.data.config, "range")} onChange={(value) => updateConfig("range", value)} />
          <ConfigField label="Values (one row, comma-separated)" value={readFirstRow(node.data.config)} onChange={(value) => updateConfig("values", [value.split(",").map((cell) => cell.trim())])} />
        </>
      )}
      {node.data.nodeType === "condition.if" && (
        <>
          <ConfigField label="Left value" value={readConfigText(node.data.config, "left")} onChange={(value) => updateConfig("left", value)} />
          <ConfigField label="Operator" value={readConfigText(node.data.config, "operator")} onChange={(value) => updateConfig("operator", value)} />
          <ConfigField label="Right value" value={readConfigText(node.data.config, "right")} onChange={(value) => updateConfig("right", value)} />
        </>
      )}
      {node.data.nodeType === "condition.switch" && (
        <>
          <ConfigField label="Value to evaluate" value={readConfigText(node.data.config, "value")} onChange={(value) => updateConfig("value", value)} />
          <SwitchCaseEditor cases={node.data.config.cases} onChange={(cases) => updateConfig("cases", cases)} />
        </>
      )}
      {node.data.nodeType === "action.http-request" && (
        <>
          <CredentialField label="HTTP credential (optional)" value={readConfigText(node.data.config, "credentialId")} providers={["HTTP"]} credentials={credentials} onChange={(value) => updateConfig("credentialId", value)} optional />
          <ConfigField label="Method" value={readConfigText(node.data.config, "method")} onChange={(value) => updateConfig("method", value)} />
          <ConfigField label="URL" value={readConfigText(node.data.config, "url")} onChange={(value) => updateConfig("url", value)} />
          <ConfigField label="Request body" value={readConfigText(node.data.config, "body")} onChange={(value) => updateConfig("body", value)} multiline />
          <ConfigField label="Timeout (ms)" value={readConfigText(node.data.config, "timeoutMs")} onChange={(value) => updateConfig("timeoutMs", Number(value) || 15_000)} />
        </>
      )}
      {node.data.nodeType === "approval.request" && <>
        <ConfigField label="Approval message" value={readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("message", value)} multiline />
        <ConfigField label="Notification provider (google_chat or http_webhook)" value={readConfigText(node.data.config, "notificationProvider")} onChange={(value) => updateConfig("notificationProvider", value)} />
        <CredentialField label="Notification credential (optional)" value={readConfigText(node.data.config, "notificationCredentialId")} providers={readConfigText(node.data.config, "notificationProvider") === "http_webhook" ? ["HTTP"] : ["GOOGLE_CHAT_WEBHOOK"]} credentials={credentials} onChange={(value) => updateConfig("notificationCredentialId", value)} optional />
      </>}
      {node.data.nodeType === "action.email" && <>
        <ConfigField label="To" value={readConfigText(node.data.config, "to")} onChange={(value) => updateConfig("to", value)} />
        <ConfigField label="Subject" value={readConfigText(node.data.config, "subject")} onChange={(value) => updateConfig("subject", value)} />
        <ConfigField label="Body" value={readConfigText(node.data.config, "body")} onChange={(value) => updateConfig("body", value)} multiline />
      </>}
      {definition && !definition.available && <p className="planned-note">This node is visible for roadmap clarity, but cannot run in the MVP.</p>}
      <section className="node-debug-panel">
        <div><p className="section-label">NODE DEBUG</p><p>Runs only this node with mock providers. No live request or downstream node will run.</p></div>
        <Button variant="secondary" className="node-debug-panel__button" disabled={!definition?.available || node.data.nodeType === "approval.request" || isDebugging} title={node.data.nodeType === "approval.request" ? "Approval nodes are tested in a full workflow run." : undefined} onClick={() => onDebugNode(node)}><Play size={14} />{isDebugging ? "Running node…" : "Run node"}</Button>
      </section>
      <JsonConfigEditor config={node.data.config} onApply={(config) => updateNodeData(node.id, { config })} />
      <ExpressionSuggestions suggestions={suggestions} />
      <section className="input-preview">
        <div className="section-label">INPUT PREVIEW</div>
        <pre>{JSON.stringify(node.data.config, null, 2)}</pre>
      </section>
      {nodeExecution && (
        <section className="input-preview">
          <div className="section-label">LAST EXECUTION · {nodeExecution.status} · ATTEMPT {nodeExecution.attempt} · {nodeExecution.durationMs ?? 0}MS</div>
          <div className="execution-inspector__section"><strong>Redacted input</strong><ResultView value={nodeExecution.input} /></div>
          <div className="execution-inspector__section"><strong>{nodeExecution.error ? "Normalized error" : "Output"}</strong><ResultView value={nodeExecution.error ?? nodeExecution.output} /></div>
          {nodeExecution.status === "WAITING" && approvalId && (
            <div className="approval-actions">
              <button className="run-button" type="button" onClick={() => onResolveApproval(approvalId, "approved")}>Approve &amp; resume</button>
              <button className="ghost-button" type="button" onClick={() => onResolveApproval(approvalId, "rejected")}>Reject</button>
            </div>
          )}
        </section>
      )}
    </aside>
  );
}

export function WorkflowEditor() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<WorkflowCanvasNode, WorkflowCanvasEdge> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteSearchRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("Loading your workflow…");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [workflow, setWorkflow] = useState<ApiWorkflow | null>(null);
  const [execution, setExecution] = useState<ApiExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeOperation, setActiveOperation] = useState<"saving" | "publishing" | "running" | "debugging" | "live" | "cloning" | null>(null);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [liveReadiness, setLiveReadiness] = useState<LiveReadiness | null>(null);
  const [liveReadinessLoading, setLiveReadinessLoading] = useState(false);
  const [liveReadinessError, setLiveReadinessError] = useState<string | null>(null);
  const [versions, setVersions] = useState<WorkflowVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteFilter, setPaletteFilter] = useState<NodeLibraryFilter>("all");
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [approvalLinkId, setApprovalLinkId] = useState<string | null | undefined>(undefined);
  const [workflowLinkId, setWorkflowLinkId] = useState<string | null | undefined>(undefined);
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
  const filteredNodeGroups = useMemo(() => groupNodeLibrary(
    nodeCatalog.filter((definition) => matchesNodeLibraryFilter(definition, paletteFilter, paletteSearch)),
  ), [paletteFilter, paletteSearch]);
  const filteredNodeCount = useMemo(
    () => filteredNodeGroups.reduce((total, group) => total + group.nodes.length, 0),
    [filteredNodeGroups],
  );
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const webhookTrigger = nodes.find((node) => node.data.nodeType === "trigger.webhook");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setApprovalLinkId(search.get("approval"));
    setWorkflowLinkId(search.get("workflow"));
  }, []);

  useEffect(() => {
    const focusNodeSearch = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement
        && (target.matches("input, textarea, select") || target.isContentEditable);
      if (event.key === "/" && !isEditing) {
        event.preventDefault();
        setPaletteOpen(true);
        requestAnimationFrame(() => paletteSearchRef.current?.focus());
      }
      if (event.key === "Escape" && document.activeElement === paletteSearchRef.current) {
        setPaletteSearch("");
        paletteSearchRef.current?.blur();
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
    if (approvalLinkId === undefined || workflowLinkId === undefined) return;
    let isCurrent = true;
    const load = async () => {
      try {
        await apiRequest<{ user: { id: string } }>("/auth/me");
        const workspaceResponse = await apiRequest<{ workspaces: WorkspaceSummary[] }>("/workspaces");
        if (!isCurrent) return;
        setWorkspaces(workspaceResponse.workspaces);
        const linkedApproval = approvalLinkId ? (await apiRequest<{ approval: ApiApproval }>(`/approvals/${approvalLinkId}`)).approval : null;
        let linkedExecution: ApiExecution | null = null;
        let loadedWorkflow: ApiWorkflow;
        if (linkedApproval) {
          loadedWorkflow = (await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${linkedApproval.workflowId}`)).workflow;
          linkedExecution = (await apiRequest<{ execution: ApiExecution }>(`/executions/${linkedApproval.executionId}`)).execution;
        } else if (workflowLinkId) {
          loadedWorkflow = (await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflowLinkId}`)).workflow;
        } else {
          const workspace = workspaceResponse.workspaces[0];
          if (!workspace) throw new Error("No workspace is available for this account.");
          const workflowsResponse = await apiRequest<{ workflows: ApiWorkflow[] }>(`/workspaces/${workspace.id}/workflows`);
          loadedWorkflow = workflowsResponse.workflows[0] ?? (await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspace.id}/workflows/from-template/steam-daily-report`, { method: "POST" })).workflow;
        }
        const graph = loadedWorkflow.draft?.graph ?? loadedWorkflow.published?.graph;
        if (!graph) throw new Error("The workflow has no editable version.");
        if (!isCurrent) return;
        loadGraph(graphFromApi(graph));
        setWorkflow(loadedWorkflow);
        if (linkedExecution) {
          setExecution(linkedExecution);
          const waitingNode = linkedExecution.nodeExecutions.find((node) => node.status === "WAITING");
          if (waitingNode) selectNode(waitingNode.nodeId);
          setNotice(linkedApproval?.status === "PENDING" ? "Approval request loaded. Review and choose an action in the selected node." : `Approval is ${linkedApproval?.status.toLowerCase() ?? "no longer pending"}.`);
        } else {
          setNotice("Draft loaded from your workspace.");
        }
      } catch (reason) {
        if (!isCurrent) return;
        const message = reason instanceof Error ? reason.message : "Unable to load this workspace.";
        if (message === "Sign in is required." || message === "Your session has expired.") {
          router.replace("/");
          return;
        }
        setNotice(message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };
    void load();
    return () => { isCurrent = false; };
  }, [approvalLinkId, workflowLinkId, loadGraph, router, selectNode]);

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
    requestAnimationFrame(() => flowRef.current?.fitView({ duration: 260, padding: 0.18 }));
    setNotice("Workflow arranged from trigger to actions.");
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
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === "c" && selectedNodeId) { event.preventDefault(); copyNode(selectedNodeId); }
      if (event.key.toLowerCase() === "v" && copiedNodeId) { event.preventDefault(); pasteNode(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copiedNodeId, selectedNodeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedNodeId || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteNode(selectedNodeId);
        setNotice("Node and its connections removed.");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteNode, selectedNodeId]);

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
    if (!workflow?.published) {
      setNotice("Publish the workflow before going live.");
      return;
    }
    setLiveConfirmOpen(true);
    void checkLiveReadiness();
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

  if (isLoading) {
    return <main className="editor-page editor-loading" aria-busy="true"><div className="editor-loading__card"><LoaderCircle className="ui-spinner" size={20} aria-hidden="true" /><strong>Preparing your workspace</strong><span>Loading workflow, credentials, and the editor canvas…</span><div className="editor-loading__progress" /></div></main>;
  }

  const progressLabel = activeOperation === "saving" ? "Saving draft" : activeOperation === "publishing" ? "Publishing workflow" : activeOperation === "running" ? "Starting test run" : activeOperation === "debugging" ? "Running node debug" : activeOperation === "live" ? "Starting live execution" : activeOperation === "cloning" ? "Creating workflow copy" : null;

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-header__title">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <div>
            <p>WORKFLOW / DRAFT</p>
            <h1>{workflow?.name ?? "Steam daily report"}</h1>
          </div>
        </div>
        <div className="editor-header__actions">
          <Button variant="ghost" className="ghost-button" onClick={() => router.push("/dashboard")}>Dashboard</Button>
          <ActionMenu label="Edit">
            <button type="button" onClick={undo} disabled={historyIndex === 0}><ChevronLeft size={15} /> Undo</button>
            <button type="button" onClick={redo} disabled={historyIndex === history.length - 1}>Redo <ChevronRight size={15} /></button>
            <button type="button" onClick={arrangeGraph}><LayoutDashboard size={15} /> Auto layout</button>
            <span className="action-menu__divider" />
            <button type="button" onClick={() => copyNode()} disabled={!selectedNodeId}>Copy selected node</button>
            <button type="button" onClick={pasteNode} disabled={!copiedNodeId}>Paste node</button>
          </ActionMenu>
          <ActionMenu label="Manage">
            <button type="button" onClick={() => setLibraryOpen(true)} disabled={!workflow}>Workflows</button>
            <button type="button" onClick={() => void openHistory()} disabled={!workflow}><History size={15} /> Version history</button>
            <button type="button" onClick={() => setCredentialsOpen(true)} disabled={!workflow}><KeyRound size={15} /> Credentials</button>
            {webhookTrigger && <button type="button" onClick={() => setWebhookOpen(true)} disabled={!workflow}>Webhook endpoint</button>}
            <span className="action-menu__divider" />
            <button type="button" onClick={exportGraph}><Download size={15} /> Export JSON</button>
            <button type="button" onClick={() => inputRef.current?.click()}><Upload size={15} /> Import JSON</button>
            <button type="button" onClick={() => void cloneWorkflow()} disabled={!workflow}>Clone workflow</button>
          </ActionMenu>
          <input ref={inputRef} className="visually-hidden" type="file" accept="application/json" onChange={importGraph} />
          <Button variant="secondary" className="save-button" onClick={() => void saveDraft()} disabled={!workflow || isSaving || activeOperation === "cloning"}>{activeOperation === "saving" ? <LoaderCircle className="ui-spinner" size={16} /> : <Save size={16} />} {activeOperation === "saving" ? "Saving…" : "Save draft"}</Button>
          <Button variant="ghost" className="ghost-button" onClick={() => void publish()} disabled={!workflow || isSaving || activeOperation === "cloning"}>{activeOperation === "publishing" ? <LoaderCircle className="ui-spinner" size={16} /> : <Check size={16} />} {activeOperation === "publishing" ? "Publishing…" : "Publish"}</Button>
          <Button variant="primary" className="run-button" onClick={() => void runTest()} disabled={!workflow || isSaving || activeOperation === "cloning"}>{activeOperation === "running" ? <LoaderCircle className="ui-spinner" size={16} /> : <Play size={16} />} {activeOperation === "running" ? "Starting…" : "Run test"}</Button>
          <Button variant="secondary" className="go-live-button" onClick={openLivePanel} disabled={!workflow?.published || isSaving}>{activeOperation === "live" ? <LoaderCircle className="ui-spinner" size={16} /> : null} Go live</Button>
          {execution && ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(execution.status) && <button className="ghost-button" type="button" onClick={() => void cancelExecution()}>Cancel run</button>}
          <ThemeToggle />
        </div>
      </header>
      {progressLabel && <div className="editor-progress" role="status" aria-live="polite"><LoaderCircle className="ui-spinner" size={14} /> <span>{progressLabel}…</span><i /></div>}

      <div className={paletteOpen ? "editor-shell" : "editor-shell editor-shell--palette-closed"}>
        {paletteOpen && (
          <aside className="node-palette" id="node-library">
            <div className="node-palette__header">
              <div>
                <p className="section-label">NODE LIBRARY</p>
                <h2>Add a step</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Collapse node palette" aria-controls="node-library" aria-expanded="true" onClick={() => setPaletteOpen(false)}><ChevronLeft size={17} /></button>
            </div>
            <div className="node-palette__summary" aria-label="Node availability">
              <span><i className="status-dot status-dot--ready" />{nodeCatalog.filter((node) => node.available).length} ready</span>
              <span><i className="status-dot" />{nodeCatalog.filter((node) => !node.available).length} roadmap</span>
            </div>
            <p className="node-palette__hint">Pick a step by purpose, or search by app. Drag it anywhere on the canvas.</p>
            <label className="palette-search"><Search size={15} /><span className="visually-hidden">Search nodes</span><input ref={paletteSearchRef} value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder="Search apps and actions" aria-label="Search nodes" /><kbd>/</kbd></label>
            <div className="palette-filters" role="group" aria-label="Filter node library">
              {nodeLibraryFilters.map((filter) => <button key={filter.id} type="button" className={paletteFilter === filter.id ? "palette-filter palette-filter--active" : "palette-filter"} aria-pressed={paletteFilter === filter.id} onClick={() => setPaletteFilter(filter.id)}>{filter.label}</button>)}
            </div>
            <div className="palette-results" aria-live="polite">
              <span>{filteredNodeCount} {filteredNodeCount === 1 ? "node" : "nodes"}</span>
              {(paletteSearch || paletteFilter !== "all") && <button type="button" onClick={() => { setPaletteSearch(""); setPaletteFilter("all"); }}>Clear filters</button>}
            </div>
            {filteredNodeGroups.map((group) => (
              <section key={group.id} className="palette-group" aria-labelledby={`palette-group-${group.id}`}>
                <header>
                  <div><h3 id={`palette-group-${group.id}`}>{group.label}</h3><p>{group.description}</p></div>
                  <span>{group.nodes.length}</span>
                </header>
                {group.nodes.map((definition) => (
                  <button
                    className={definition.available ? "palette-node" : "palette-node palette-node--planned"}
                    key={definition.type}
                    type="button"
                    draggable={definition.available}
                    disabled={!definition.available}
                    onDragStart={(event) => onDragStart(event, definition)}
                    onClick={() => addDefinition(definition)}
                    aria-label={`${definition.label} ${definition.description}${definition.available ? "" : " Planned"}`}
                  >
                    <span className="palette-node__icon"><NodeIcon name={definition.icon} size={16} /></span>
                    <span className="palette-node__body"><span className="palette-node__title"><strong>{definition.label}</strong>{!definition.available && <em>Planned</em>}</span><small>{definition.description}</small></span>
                  </button>
                ))}
              </section>
            ))}
            {filteredNodeCount === 0 && <div className="palette-empty"><Search size={21} /><strong>No matching nodes</strong><p>Try an app name like “Telegram” or clear the current filters.</p><button type="button" onClick={() => { setPaletteSearch(""); setPaletteFilter("all"); }}>Show all ready nodes</button></div>}
          </aside>
        )}
        <section className={`canvas-region${isConnecting ? " canvas-region--connecting" : ""}`} ref={wrapperRef} onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          {!paletteOpen && <button className="palette-reopen" type="button" aria-controls="node-library" aria-expanded="false" onClick={() => setPaletteOpen(true)}>Add node</button>}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={applyNodesChange}
            onEdgesChange={applyEdgesChange}
            onConnect={handleConnect}
            onConnectStart={startConnection}
            onConnectEnd={finishConnection}
            onNodeClick={(_, node) => selectNode(node.id)}
            onNodeContextMenu={(event, node) => { event.preventDefault(); setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY }); }}
            onPaneClick={() => { selectNode(null); setContextMenu(null); }}
            onInit={(instance) => { flowRef.current = instance; }}
            selectionOnDrag
            multiSelectionKeyCode={["Meta", "Control"]}
            fitView
            defaultEdgeOptions={{ animated: true }}
          >
            <Background gap={18} size={1} />
            <MiniMap zoomable pannable />
            <Controls showInteractive={false} />
          </ReactFlow>
          <div className="canvas-status" role="status" aria-live="polite">
            <CirclePlay size={16} /> {notice}
          </div>
          <button className={`validation-summary validation-summary--${issues.some((issue) => issue.severity === "error") ? "error" : "ready"}`} type="button" onClick={() => setValidationOpen(true)} aria-haspopup="dialog">
            <Check size={15} />
            {issues.length === 0 ? "Graph is ready for a test run" : `View ${issues.length} validation notice${issues.length === 1 ? "" : "s"}`}
          </button>
        </section>
        <NodeInspector node={selectedNode} execution={execution} credentials={credentials} onResolveApproval={resolveApproval} onDebugNode={(node) => void runNodeDebug(node)} isDebugging={activeOperation === "debugging"} />
      </div>
      {contextMenu && <div className="node-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onMouseLeave={() => setContextMenu(null)}>
        <button type="button" onClick={() => { copyNode(contextMenu.nodeId); setContextMenu(null); }}>Copy node</button>
        <button type="button" onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); setNotice("Node duplicated."); }}>Duplicate</button>
        <button className="node-context-menu__danger" type="button" onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); setNotice("Node and its connections removed."); }}>Delete</button>
      </div>}
      {historyOpen && <WorkflowHistoryPanel versions={versions} loading={versionsLoading} onClose={() => setHistoryOpen(false)} />}
      {validationOpen && <GraphValidationPanel issues={issues} onClose={() => setValidationOpen(false)} />}
      {webhookOpen && workflow && webhookTrigger && <WebhookEndpointPanel workflow={workflow} config={webhookTrigger.data.config} onClose={() => setWebhookOpen(false)} />}
      {liveConfirmOpen && workflow && <GoLivePanel workflow={workflow} isRunning={activeOperation === "live"} readiness={liveReadiness} loading={liveReadinessLoading} error={liveReadinessError} onConfirm={() => void runLive()} onRefresh={() => void checkLiveReadiness()} onOpenCredentials={() => { setLiveConfirmOpen(false); setCredentialsOpen(true); }} onClose={() => setLiveConfirmOpen(false)} />}
      {libraryOpen && <WorkflowLibraryPanel initialWorkspaces={workspaces} activeWorkflowId={workflow?.id} activeWorkspaceId={workflow?.workspaceId} onOpen={openWorkflow} onWorkspaceCreated={(workspace) => setWorkspaces((current) => [workspace, ...current])} onClose={() => setLibraryOpen(false)} />}
      {credentialsOpen && workflow && <CredentialPanel workspaceId={workflow.workspaceId} onClose={() => setCredentialsOpen(false)} onSaved={setCredentials} />}
    </main>
  );
}
