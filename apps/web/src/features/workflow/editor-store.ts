import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from "@xyflow/react";
import { create } from "zustand";
import {
  createNodeData,
  edgeKindFromHandle,
  initialEdges,
  initialNodes,
  type NodeDefinition,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
  type WorkflowNodeData,
} from "./node-catalog";
import { autoLayoutNodes } from "./auto-layout";
import { duplicateWorkflowNode } from "./node-operations";

type GraphSnapshot = {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
};

type WorkflowEditorState = {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
  selectedNodeId: string | null;
  history: GraphSnapshot[];
  historyIndex: number;
  selectNode: (id: string | null) => void;
  addNode: (definition: NodeDefinition, position?: { x: number; y: number }) => void;
  updateNodeData: (id: string, patch: Partial<WorkflowNodeData>) => void;
  applyNodesChange: (changes: NodeChange<WorkflowCanvasNode>[]) => void;
  applyEdgesChange: (changes: EdgeChange<WorkflowCanvasEdge>[]) => void;
  connect: (connection: Connection) => void;
  autoLayout: () => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  undo: () => void;
  redo: () => void;
  loadGraph: (graph: GraphSnapshot) => void;
};

const cloneGraph = (nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]): GraphSnapshot => structuredClone({ nodes, edges });

export const useWorkflowEditorStore = create<WorkflowEditorState>((set, get) => {
  const initialSnapshot = cloneGraph(initialNodes, initialEdges);

  const commit = (nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]) => {
    const state = get();
    const snapshot = cloneGraph(nodes, edges);
    const history = [...state.history.slice(0, state.historyIndex + 1), snapshot];
    set({ nodes, edges, history, historyIndex: history.length - 1 });
  };

  return {
    nodes: initialSnapshot.nodes,
    edges: initialSnapshot.edges,
    selectedNodeId: null,
    history: [initialSnapshot],
    historyIndex: 0,
    selectNode: (id) => set({ selectedNodeId: id }),
    addNode: (definition, position = { x: 390, y: 430 }) => {
      const id = `node-${crypto.randomUUID()}`;
      const node: WorkflowCanvasNode = {
        id,
        type: "workflowNode",
        position,
        data: createNodeData(definition),
      };
      const state = get();
      commit([...state.nodes, node], state.edges);
      set({ selectedNodeId: id });
    },
    updateNodeData: (id, patch) => {
      const state = get();
      const nodes = state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node);
      commit(nodes, state.edges);
    },
    applyNodesChange: (changes) => {
      const state = get();
      const nodes = applyNodeChanges(changes, state.nodes) as WorkflowCanvasNode[];
      const hasStructuralChange = changes.some((change) => change.type !== "select");
      if (hasStructuralChange) commit(nodes, state.edges);
      else set({ nodes });
    },
    applyEdgesChange: (changes) => {
      const state = get();
      const edges = applyEdgeChanges(changes, state.edges) as WorkflowCanvasEdge[];
      const hasStructuralChange = changes.some((change) => change.type !== "select");
      if (hasStructuralChange) commit(state.nodes, edges);
      else set({ edges });
    },
    connect: (connection) => {
      const state = get();
      const kind = edgeKindFromHandle(connection.sourceHandle);
      if (!kind || !connection.source || !connection.target) return;
      const edges = addEdge({
        ...connection,
        animated: true,
        id: `edge-${crypto.randomUUID()}`,
        kind,
      }, state.edges) as WorkflowCanvasEdge[];
      commit(state.nodes, edges);
    },
    autoLayout: () => {
      const state = get();
      commit(autoLayoutNodes(state.nodes, state.edges), state.edges);
    },
    duplicateNode: (id) => {
      const state = get();
      const source = state.nodes.find((node) => node.id === id);
      if (!source) return;
      const copy = duplicateWorkflowNode(source, `node-${crypto.randomUUID()}`);
      commit([...state.nodes.map((node) => ({ ...node, selected: false })), copy], state.edges);
      set({ selectedNodeId: copy.id });
    },
    deleteNode: (id) => {
      const state = get();
      if (!state.nodes.some((node) => node.id === id)) return;
      commit(state.nodes.filter((node) => node.id !== id), state.edges.filter((edge) => edge.source !== id && edge.target !== id));
      set({ selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId });
    },
    undo: () => {
      const state = get();
      if (state.historyIndex === 0) return;
      const historyIndex = state.historyIndex - 1;
      const snapshot = state.history[historyIndex];
      if (!snapshot) return;
      set({ ...cloneGraph(snapshot.nodes, snapshot.edges), historyIndex, selectedNodeId: null });
    },
    redo: () => {
      const state = get();
      if (state.historyIndex === state.history.length - 1) return;
      const historyIndex = state.historyIndex + 1;
      const snapshot = state.history[historyIndex];
      if (!snapshot) return;
      set({ ...cloneGraph(snapshot.nodes, snapshot.edges), historyIndex, selectedNodeId: null });
    },
    loadGraph: (graph) => {
      const snapshot = cloneGraph(graph.nodes, graph.edges);
      set({ nodes: snapshot.nodes, edges: snapshot.edges, history: [snapshot], historyIndex: 0, selectedNodeId: null });
    },
  };
});
