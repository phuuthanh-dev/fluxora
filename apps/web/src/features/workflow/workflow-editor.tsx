"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
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
  Play,
  Save,
  Sparkles,
  Search,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, apiUrl } from "../api/api-client";
import { validateWorkflowGraph } from "./graph-validation";
import {
  categoryLabels,
  categoryOrder,
  createNodeData,
  getNodeDefinition,
  matchesNodeSearch,
  nodeCatalog,
  type NodeDefinition,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
} from "./node-catalog";
import { useWorkflowEditorStore } from "./editor-store";
import { parseWorkflowCanvasGraph } from "./workflow-graph-schema";
import { WorkflowNode } from "./workflow-node";
import { graphForApi, graphFromApi, type ApiWorkflow } from "./workflow-api";
import { CredentialPanel } from "../credentials/credential-panel";
import { buildExpressionSuggestions } from "./expression-suggestions";
import { manualTriggerTestData } from "./test-data";

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

function readConfigText(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
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
    <label className="config-field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
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
  return <section className="workflow-history" aria-label="Workflow version history"><div className="credential-panel__heading"><div><p className="section-label">VERSION HISTORY</p><h2>Immutable releases</h2></div><button className="icon-button" type="button" aria-label="Close workflow history" onClick={onClose}>×</button></div>{loading ? <p>Loading versions…</p> : <ol>{versions.map((version) => <li key={version.id}><strong>v{version.version} · {version.status.toLowerCase()}</strong><span>{version.nodeCount} nodes · {version.publishedAt ? `published ${new Date(version.publishedAt).toLocaleString()}` : `draft ${new Date(version.createdAt).toLocaleString()}`}</span></li>)}</ol>}</section>;
}

function GraphValidationPanel({ issues, onClose }: { issues: ReturnType<typeof validateWorkflowGraph>; onClose: () => void }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return (
    <section className="graph-validation-panel" role="dialog" aria-modal="false" aria-label="Workflow validation details">
      <div className="credential-panel__heading">
        <div>
          <p className="section-label">LIVE VALIDATION</p>
          <h2>{errors.length ? "Fix these before saving" : "Graph checks"}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close validation details" onClick={onClose}>×</button>
      </div>
      {errors.length === 0 && warnings.length === 0 ? <p className="graph-validation-panel__ready">Your graph is ready for a test run.</p> : <>
        {errors.length > 0 && <div className="graph-validation-panel__group"><strong>{errors.length} error{errors.length === 1 ? "" : "s"}</strong><ul>{errors.map((issue, index) => <li key={`error-${index}`} className="graph-validation-panel__issue graph-validation-panel__issue--error">{issue.message}</li>)}</ul></div>}
        {warnings.length > 0 && <div className="graph-validation-panel__group"><strong>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</strong><ul>{warnings.map((issue, index) => <li key={`warning-${index}`} className="graph-validation-panel__issue graph-validation-panel__issue--warning">{issue.message}</li>)}</ul></div>}
      </>}
    </section>
  );
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

  return <section className="webhook-endpoint-panel" role="dialog" aria-modal="false" aria-label="Webhook endpoint"><div className="credential-panel__heading"><div><p className="section-label">INBOUND WEBHOOK</p><h2>Webhook endpoint</h2></div><button className="icon-button" type="button" aria-label="Close webhook endpoint" onClick={onClose}>×</button></div><p>Endpoints are pinned to a published workflow version. Publishing again does not change an existing endpoint until you rotate it here.</p><ConfigField label="Public path" value={path} onChange={setPath} /><label className="checkbox-field"><input type="checkbox" checked={secretRequired} onChange={(event) => setSecretRequired(event.target.checked)} /> Require <code>x-workflow-secret</code> header</label><div className="webhook-endpoint-panel__url"><span>POST URL</span><code>{endpointUrl}</code></div>{createdSecret && <div className="webhook-endpoint-panel__secret"><strong>Copy this secret now</strong><code>{createdSecret}</code><small>It is displayed only after this creation or rotation.</small></div>}<p className="webhook-endpoint-panel__notice">{notice}</p><button className="run-button" type="button" onClick={() => void createEndpoint()} disabled={!workflow.published || isSaving || !path.trim()}>{isSaving ? "Creating…" : endpoint ? "Rotate endpoint secret" : "Create endpoint"}</button>{!workflow.published && <small className="webhook-endpoint-panel__warning">Publish a version containing this Webhook trigger before creating its endpoint.</small>}</section>;
}

function WorkflowLibraryPanel({ initialWorkspaces, activeWorkflowId, activeWorkspaceId, onOpen, onWorkspaceCreated, onClose }: { initialWorkspaces: WorkspaceSummary[]; activeWorkflowId: string | undefined; activeWorkspaceId: string | undefined; onOpen: (workflow: ApiWorkflow) => void; onWorkspaceCreated: (workspace: WorkspaceSummary) => void; onClose: () => void }) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [workspaceId, setWorkspaceId] = useState(activeWorkspaceId ?? initialWorkspaces[0]?.id ?? "");
  const [workflows, setWorkflows] = useState<ApiWorkflow[]>([]);
  const [newWorkflowName, setNewWorkflowName] = useState("Untitled workflow");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [notice, setNotice] = useState("Loading workflows…");
  const [isSaving, setIsSaving] = useState(false);

  const loadWorkflows = async (targetWorkspaceId = workspaceId) => {
    if (!targetWorkspaceId) return;
    try {
      const response = await apiRequest<{ workflows: ApiWorkflow[] }>(`/workspaces/${targetWorkspaceId}/workflows`);
      setWorkflows(response.workflows);
      setNotice(response.workflows.length ? "Choose a workflow or create a new one." : "No workflows yet. Start blank or use the Steam template.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to load workflows.");
    }
  };

  useEffect(() => { void loadWorkflows(); }, [workspaceId]);

  const createWorkflow = async (templateSlug?: string) => {
    if (!workspaceId || !newWorkflowName.trim()) return;
    setIsSaving(true);
    try {
      const response = templateSlug
        ? await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspaceId}/workflows/from-template/${templateSlug}`, { method: "POST" })
        : await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspaceId}/workflows`, { method: "POST", body: JSON.stringify({ name: newWorkflowName.trim() }) });
      onOpen(response.workflow);
      setNotice(templateSlug ? "Steam daily report created from template." : "Blank workflow created.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to create workflow.");
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
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to create workspace.");
    } finally {
      setIsSaving(false);
    }
  };

  return <section className="workflow-library" role="dialog" aria-modal="false" aria-label="Workflow library"><div className="credential-panel__heading"><div><p className="section-label">WORKSPACE LIBRARY</p><h2>Workflows</h2></div><button className="icon-button" type="button" aria-label="Close workflow library" onClick={onClose}>×</button></div><label className="workflow-library__field"><span>Workspace</span><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><div className="workflow-library__create"><input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} placeholder="New workspace name" /><button className="ghost-button" type="button" onClick={() => void createWorkspace()} disabled={isSaving || !newWorkspaceName.trim()}>Create workspace</button></div><div className="workflow-library__list">{workflows.map((candidate) => <button key={candidate.id} className={candidate.id === activeWorkflowId ? "workflow-library__item workflow-library__item--active" : "workflow-library__item"} type="button" onClick={() => onOpen(candidate)}><strong>{candidate.name}</strong><span>{candidate.published ? `Published v${candidate.published.version}` : "Draft only"}</span></button>)}</div><div className="workflow-library__new"><p className="section-label">CREATE WORKFLOW</p><input value={newWorkflowName} onChange={(event) => setNewWorkflowName(event.target.value)} aria-label="New workflow name" /><div><button className="run-button" type="button" onClick={() => void createWorkflow()} disabled={isSaving || !workspaceId || !newWorkflowName.trim()}>Start blank</button><button className="ghost-button" type="button" onClick={() => void createWorkflow("steam-daily-report")} disabled={isSaving || !workspaceId}>Use Steam template</button></div></div><p className="workflow-library__notice">{notice}</p></section>;
}

function NodeInspector({ node, execution, onResolveApproval }: { node: WorkflowCanvasNode | undefined; execution: ApiExecution | null; onResolveApproval: (approvalId: string, decision: "approved" | "rejected") => void }) {
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
          <ConfigField label="Steam credential" value={readConfigText(node.data.config, "credentialId")} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Steam ID 64" value={readConfigText(node.data.config, "steamId")} onChange={(value) => updateConfig("steamId", value)} />
        </>
      )}
      {node.data.nodeType === "action.google-chat.webhook" && (
        <>
          <ConfigField label="Google Chat credential" value={readConfigText(node.data.config, "credentialId")} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Message template" value={readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("message", value)} multiline />
        </>
      )}
      {node.data.nodeType === "action.google-drive" && (
        <>
          <ConfigField label="Google credential" value={readConfigText(node.data.config, "credentialId")} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Operation (list, search, uploadText, downloadText)" value={readConfigText(node.data.config, "operation")} onChange={(value) => updateConfig("operation", value)} />
          <ConfigField label="Search query / file ID" value={readConfigText(node.data.config, "query") || readConfigText(node.data.config, "fileId")} onChange={(value) => updateConfig(readConfigText(node.data.config, "operation") === "downloadText" ? "fileId" : "query", value)} />
          <ConfigField label="File name" value={readConfigText(node.data.config, "name")} onChange={(value) => updateConfig("name", value)} />
          <ConfigField label="Text content" value={readConfigText(node.data.config, "text")} onChange={(value) => updateConfig("text", value)} multiline />
        </>
      )}
      {node.data.nodeType === "action.google-sheets" && (
        <>
          <ConfigField label="Google credential" value={readConfigText(node.data.config, "credentialId")} onChange={(value) => updateConfig("credentialId", value)} />
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
          <ConfigField label="HTTP credential (optional)" value={readConfigText(node.data.config, "credentialId")} onChange={(value) => updateConfig("credentialId", value)} />
          <ConfigField label="Method" value={readConfigText(node.data.config, "method")} onChange={(value) => updateConfig("method", value)} />
          <ConfigField label="URL" value={readConfigText(node.data.config, "url")} onChange={(value) => updateConfig("url", value)} />
          <ConfigField label="Request body" value={readConfigText(node.data.config, "body")} onChange={(value) => updateConfig("body", value)} multiline />
          <ConfigField label="Timeout (ms)" value={readConfigText(node.data.config, "timeoutMs")} onChange={(value) => updateConfig("timeoutMs", Number(value) || 15_000)} />
        </>
      )}
      {node.data.nodeType === "approval.request" && <>
        <ConfigField label="Approval message" value={readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("message", value)} multiline />
        <ConfigField label="Notification provider (google_chat or http_webhook)" value={readConfigText(node.data.config, "notificationProvider")} onChange={(value) => updateConfig("notificationProvider", value)} />
        <ConfigField label="Notification credential (optional)" value={readConfigText(node.data.config, "notificationCredentialId")} onChange={(value) => updateConfig("notificationCredentialId", value)} />
      </>}
      {node.data.nodeType === "action.email" && <>
        <ConfigField label="To" value={readConfigText(node.data.config, "to")} onChange={(value) => updateConfig("to", value)} />
        <ConfigField label="Subject" value={readConfigText(node.data.config, "subject")} onChange={(value) => updateConfig("subject", value)} />
        <ConfigField label="Body" value={readConfigText(node.data.config, "body")} onChange={(value) => updateConfig("body", value)} multiline />
      </>}
      {definition && !definition.available && <p className="planned-note">This node is visible for roadmap clarity, but cannot run in the MVP.</p>}
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
  const [notice, setNotice] = useState("Loading your workflow…");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [workflow, setWorkflow] = useState<ApiWorkflow | null>(null);
  const [execution, setExecution] = useState<ApiExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [versions, setVersions] = useState<WorkflowVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [approvalLinkId, setApprovalLinkId] = useState<string | null | undefined>(undefined);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
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
  const webhookTrigger = nodes.find((node) => node.data.nodeType === "trigger.webhook");

  useEffect(() => {
    setApprovalLinkId(new URLSearchParams(window.location.search).get("approval"));
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
    if (approvalLinkId === undefined) return;
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
  }, [approvalLinkId, loadGraph, router, selectNode]);

  const addDefinition = (definition: NodeDefinition, position?: { x: number; y: number }) => {
    addNode(definition, position);
    setNotice(`${definition.label} added to the draft.`);
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
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/clone`, { method: "POST" });
      const graph = response.workflow.draft?.graph ?? response.workflow.published?.graph;
      if (!graph) throw new Error("The cloned workflow has no graph.");
      loadGraph(graphFromApi(graph));
      setWorkflow(response.workflow);
      setExecution(null);
      setNotice("Workflow cloned. You are editing the independent copy.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to clone workflow.");
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

  const saveDraft = async (): Promise<boolean> => {
    if (!workflow) return false;
    const errors = issues.filter((issue) => issue.severity === "error");
    if (errors.length) {
      setNotice("Resolve graph errors before saving this draft.");
      return false;
    }
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
    }
  };

  const publish = async () => {
    if (!workflow) return;
    const saved = await saveDraft();
    if (!saved) return;
    setIsSaving(true);
    try {
      const response = await apiRequest<{ workflow: ApiWorkflow }>(`/workflows/${workflow.id}/publish`, { method: "POST" });
      setWorkflow(response.workflow);
      setNotice(`Version ${response.workflow.published?.version ?? ""} published. A new editable draft is ready.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Unable to publish the workflow.");
    } finally {
      setIsSaving(false);
    }
  };

  const runTest = async () => {
    if (!workflow) return;
    const saved = await saveDraft();
    if (!saved) return;
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
    return <main className="editor-page"><p className="canvas-status">Loading your authenticated workspace…</p></main>;
  }

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
          <button className="ghost-button" type="button" onClick={undo} disabled={historyIndex === 0}><ChevronLeft size={16} /> Undo</button>
          <button className="ghost-button" type="button" onClick={redo} disabled={historyIndex === history.length - 1}>Redo <ChevronRight size={16} /></button>
          <button className="ghost-button" type="button" onClick={exportGraph}><Download size={16} /> Export</button>
          <button className="ghost-button" type="button" onClick={() => inputRef.current?.click()}><Upload size={16} /> Import</button>
          <button className="ghost-button" type="button" onClick={arrangeGraph}><LayoutDashboard size={16} /> Auto layout</button>
          <button className="ghost-button" type="button" onClick={() => copyNode()} disabled={!selectedNodeId}>Copy node</button>
          <button className="ghost-button" type="button" onClick={pasteNode} disabled={!copiedNodeId}>Paste node</button>
          <button className="ghost-button" type="button" onClick={() => void cloneWorkflow()} disabled={!workflow}>Clone</button>
          <button className="ghost-button" type="button" onClick={() => setLibraryOpen(true)} disabled={!workflow}>Workflows</button>
          <button className="ghost-button" type="button" onClick={() => void openHistory()} disabled={!workflow}><History size={16} /> History</button>
          {webhookTrigger && <button className="ghost-button" type="button" onClick={() => setWebhookOpen(true)} disabled={!workflow}>Webhook</button>}
          <button className="ghost-button" type="button" onClick={() => setCredentialsOpen(true)} disabled={!workflow}><KeyRound size={16} /> Credentials</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="application/json" onChange={importGraph} />
          <button className="save-button" type="button" onClick={() => void saveDraft()} disabled={!workflow || isSaving}><Save size={16} /> {isSaving ? "Saving…" : "Save draft"}</button>
          <button className="ghost-button" type="button" onClick={() => void publish()} disabled={!workflow || isSaving}><Check size={16} /> Publish</button>
          <button className="run-button" type="button" onClick={() => void runTest()} disabled={!workflow || isSaving}><Play size={16} /> Run test</button>
          {execution && ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(execution.status) && <button className="ghost-button" type="button" onClick={() => void cancelExecution()}>Cancel run</button>}
        </div>
      </header>

      <div className="editor-shell">
        {paletteOpen && (
          <aside className="node-palette">
            <div className="node-palette__header">
              <div>
                <p className="section-label">BUILDING BLOCKS</p>
                <h2>Add a node</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Collapse node palette" onClick={() => setPaletteOpen(false)}><ChevronLeft size={17} /></button>
            </div>
            <p className="node-palette__hint">Drag onto the canvas or click to add.</p>
            <label className="palette-search"><Search size={14} /><span className="visually-hidden">Search nodes</span><input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder="Search nodes" /></label>
            {categoryOrder.map((category) => (
              <section key={category} className="palette-group">
                <h3>{categoryLabels[category]}</h3>
                {nodeCatalog.filter((node) => node.category === category && matchesNodeSearch(node, paletteSearch)).map((definition) => (
                  <button
                    className="palette-node"
                    key={definition.type}
                    type="button"
                    draggable
                    onDragStart={(event) => onDragStart(event, definition)}
                    onClick={() => addDefinition(definition)}
                  >
                    <span className="palette-node__icon">{definition.icon}</span>
                    <span><strong>{definition.label}</strong><small>{definition.available ? definition.description : "Planned after MVP"}</small></span>
                  </button>
                ))}
              </section>
            ))}
          </aside>
        )}
        <section className="canvas-region" ref={wrapperRef} onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          {!paletteOpen && <button className="palette-reopen" type="button" onClick={() => setPaletteOpen(true)}>Add node</button>}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={applyNodesChange}
            onEdgesChange={applyEdgesChange}
            onConnect={connect}
            onNodeClick={(_, node) => selectNode(node.id)}
            onNodeContextMenu={(event, node) => { event.preventDefault(); setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY }); }}
            onPaneClick={() => selectNode(null)}
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
          <div className="canvas-status">
            <CirclePlay size={16} /> {notice}
          </div>
          <button className={`validation-summary validation-summary--${issues.some((issue) => issue.severity === "error") ? "error" : "ready"}`} type="button" onClick={() => setValidationOpen(true)} aria-haspopup="dialog">
            <Check size={15} />
            {issues.length === 0 ? "Graph is ready for a test run" : `View ${issues.length} validation notice${issues.length === 1 ? "" : "s"}`}
          </button>
        </section>
        <NodeInspector node={selectedNode} execution={execution} onResolveApproval={resolveApproval} />
      </div>
      {contextMenu && <div className="node-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onMouseLeave={() => setContextMenu(null)}>
        <button type="button" onClick={() => { copyNode(contextMenu.nodeId); setContextMenu(null); }}>Copy node</button>
        <button type="button" onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); setNotice("Node duplicated."); }}>Duplicate</button>
        <button className="node-context-menu__danger" type="button" onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); setNotice("Node and its connections removed."); }}>Delete</button>
      </div>}
      {historyOpen && <WorkflowHistoryPanel versions={versions} loading={versionsLoading} onClose={() => setHistoryOpen(false)} />}
      {validationOpen && <GraphValidationPanel issues={issues} onClose={() => setValidationOpen(false)} />}
      {webhookOpen && workflow && webhookTrigger && <WebhookEndpointPanel workflow={workflow} config={webhookTrigger.data.config} onClose={() => setWebhookOpen(false)} />}
      {libraryOpen && <WorkflowLibraryPanel initialWorkspaces={workspaces} activeWorkflowId={workflow?.id} activeWorkspaceId={workflow?.workspaceId} onOpen={openWorkflow} onWorkspaceCreated={(workspace) => setWorkspaces((current) => [workspace, ...current])} onClose={() => setLibraryOpen(false)} />}
      {credentialsOpen && workflow && <CredentialPanel workspaceId={workflow.workspaceId} onClose={() => setCredentialsOpen(false)} />}
    </main>
  );
}
