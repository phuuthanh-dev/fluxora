"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Download,
  FileUp,
  Layers3,
  KeyRound,
  Play,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../api/api-client";
import { validateWorkflowGraph } from "./graph-validation";
import {
  categoryLabels,
  categoryOrder,
  createNodeData,
  getNodeDefinition,
  nodeCatalog,
  type NodeDefinition,
  type WorkflowCanvasNode,
} from "./node-catalog";
import { useWorkflowEditorStore } from "./editor-store";
import { parseWorkflowCanvasGraph } from "./workflow-graph-schema";
import { WorkflowNode } from "./workflow-node";
import { graphForApi, graphFromApi, type ApiWorkflow } from "./workflow-api";
import { CredentialPanel } from "../credentials/credential-panel";

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode };

type ApiExecution = {
  id: string;
  status: string;
  nodeExecutions: Array<{ nodeId: string; status: string; attempt: number; input: unknown; output: unknown; error: { code: string; message: string } | null; durationMs: number | null }>;
};

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
      {node.data.nodeType === "trigger.cron" && (
        <>
          <ConfigField label="Cron expression" value={readConfigText(node.data.config, "expression")} onChange={(value) => updateConfig("expression", value)} />
          <ConfigField label="Timezone" value={readConfigText(node.data.config, "timezone")} onChange={(value) => updateConfig("timezone", value)} />
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
      {node.data.nodeType === "action.http-request" && (
        <>
          <ConfigField label="Method" value={readConfigText(node.data.config, "method")} onChange={(value) => updateConfig("method", value)} />
          <ConfigField label="URL" value={readConfigText(node.data.config, "url")} onChange={(value) => updateConfig("url", value)} />
        </>
      )}
      {node.data.nodeType === "approval.request" && <ConfigField label="Approval message" value={readConfigText(node.data.config, "message")} onChange={(value) => updateConfig("message", value)} multiline />}
      {definition && !definition.available && <p className="planned-note">This node is visible for roadmap clarity, but cannot run in the MVP.</p>}
      <section className="input-preview">
        <div className="section-label">INPUT PREVIEW</div>
        <pre>{JSON.stringify(node.data.config, null, 2)}</pre>
      </section>
      {nodeExecution && (
        <section className="input-preview">
          <div className="section-label">LAST MOCK RUN · {nodeExecution.status} · {nodeExecution.durationMs ?? 0}MS</div>
          <pre>{JSON.stringify(nodeExecution.error ?? nodeExecution.output, null, 2)}</pre>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("Loading your workflow…");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [workflow, setWorkflow] = useState<ApiWorkflow | null>(null);
  const [execution, setExecution] = useState<ApiExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
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
  const undo = useWorkflowEditorStore((state) => state.undo);
  const redo = useWorkflowEditorStore((state) => state.redo);
  const loadGraph = useWorkflowEditorStore((state) => state.loadGraph);
  const issues = useMemo(() => validateWorkflowGraph(nodes, edges), [nodes, edges]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  useEffect(() => {
    let isCurrent = true;
    const load = async () => {
      try {
        await apiRequest<{ user: { id: string } }>("/auth/me");
        const workspaceResponse = await apiRequest<{ workspaces: Array<{ id: string }> }>("/workspaces");
        const workspace = workspaceResponse.workspaces[0];
        if (!workspace) throw new Error("No workspace is available for this account.");
        const workflowsResponse = await apiRequest<{ workflows: ApiWorkflow[] }>(`/workspaces/${workspace.id}/workflows`);
        const initialGraph = useWorkflowEditorStore.getState();
        const loadedWorkflow = workflowsResponse.workflows[0] ?? (await apiRequest<{ workflow: ApiWorkflow }>(`/workspaces/${workspace.id}/workflows`, {
          method: "POST",
          body: JSON.stringify({ name: "Steam daily report", graph: graphForApi({ nodes: initialGraph.nodes, edges: initialGraph.edges }) }),
        })).workflow;
        const graph = loadedWorkflow.draft?.graph ?? loadedWorkflow.published?.graph;
        if (!graph) throw new Error("The workflow has no editable version.");
        if (!isCurrent) return;
        loadGraph(graphFromApi(graph));
        setWorkflow(loadedWorkflow);
        setNotice("Draft loaded from your workspace.");
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
  }, [loadGraph, router]);

  const addDefinition = (definition: NodeDefinition, position?: { x: number; y: number }) => {
    addNode(definition, position);
    setNotice(`${definition.label} added to the draft.`);
  };

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
        body: JSON.stringify({ mock: true }),
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
          <button className="ghost-button" type="button" onClick={() => setCredentialsOpen(true)} disabled={!workflow}><KeyRound size={16} /> Credentials</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="application/json" onChange={importGraph} />
          <button className="save-button" type="button" onClick={() => void saveDraft()} disabled={!workflow || isSaving}><Save size={16} /> {isSaving ? "Saving…" : "Save draft"}</button>
          <button className="ghost-button" type="button" onClick={() => void publish()} disabled={!workflow || isSaving}><Check size={16} /> Publish</button>
          <button className="run-button" type="button" onClick={() => void runTest()} disabled={!workflow || isSaving}><Play size={16} /> Run test</button>
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
            {categoryOrder.map((category) => (
              <section key={category} className="palette-group">
                <h3>{categoryLabels[category]}</h3>
                {nodeCatalog.filter((node) => node.category === category).map((definition) => (
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
            onPaneClick={() => selectNode(null)}
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
          <div className={`validation-summary validation-summary--${issues.some((issue) => issue.severity === "error") ? "error" : "ready"}`}>
            <Check size={15} />
            {issues.length === 0 ? "Graph is ready for a test run" : `${issues.length} validation notice${issues.length === 1 ? "" : "s"}`}
          </div>
        </section>
        <NodeInspector node={selectedNode} execution={execution} onResolveApproval={resolveApproval} />
      </div>
      {credentialsOpen && workflow && <CredentialPanel workspaceId={workflow.workspaceId} onClose={() => setCredentialsOpen(false)} />}
    </main>
  );
}
