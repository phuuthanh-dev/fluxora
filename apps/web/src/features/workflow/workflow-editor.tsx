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
  Play,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
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
import { WorkflowNode } from "./workflow-node";

const nodeTypes: NodeTypes = { workflowNode: WorkflowNode };

function readConfigText(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
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

function NodeInspector({ node }: { node: WorkflowCanvasNode | undefined }) {
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
    </aside>
  );
}

export function WorkflowEditor() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("Draft changes are stored locally while the API module is in progress.");
  const [paletteOpen, setPaletteOpen] = useState(true);
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
    const data = JSON.stringify({ nodes, edges }, null, 2);
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
      if (!isWorkflowGraph(parsed)) throw new Error("Invalid graph");
      loadGraph({ nodes: parsed.nodes, edges: parsed.edges });
      setNotice("Workflow JSON imported into a fresh local draft.");
    } catch {
      setNotice("Import failed. Choose a workflow JSON export from this app.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-header__title">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <div>
            <p>WORKFLOW / DRAFT</p>
            <h1>Steam daily report</h1>
          </div>
        </div>
        <div className="editor-header__actions">
          <button className="ghost-button" type="button" onClick={undo} disabled={historyIndex === 0}><ChevronLeft size={16} /> Undo</button>
          <button className="ghost-button" type="button" onClick={redo} disabled={historyIndex === history.length - 1}>Redo <ChevronRight size={16} /></button>
          <button className="ghost-button" type="button" onClick={exportGraph}><Download size={16} /> Export</button>
          <button className="ghost-button" type="button" onClick={() => inputRef.current?.click()}><Upload size={16} /> Import</button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="application/json" onChange={importGraph} />
          <button className="save-button" type="button" onClick={() => setNotice("Draft persistence will connect to the API in the next foundation task.")}><Save size={16} /> Save draft</button>
          <button className="run-button" type="button" onClick={() => setNotice("Test run queued in UI mode. The background runner is scheduled for Day 2.")}><Play size={16} /> Run test</button>
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
        <NodeInspector node={selectedNode} />
      </div>
    </main>
  );
}

function isWorkflowGraph(value: unknown): value is { nodes: WorkflowCanvasNode[]; edges: ReturnType<typeof useWorkflowEditorStore.getState>["edges"] } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { nodes?: unknown; edges?: unknown };
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}
