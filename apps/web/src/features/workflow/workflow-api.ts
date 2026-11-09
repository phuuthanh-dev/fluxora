import { type WorkflowEdge, type WorkflowGraph, type WorkflowNode } from "@workflow/contracts";
import { createNodeData, getNodeDefinitionForConfig, type WorkflowCanvasEdge, type WorkflowCanvasNode } from "./node-catalog";
import { parseWorkflowCanvasGraph, type WorkflowCanvasGraph } from "./workflow-graph-schema";

export type ApiWorkflow = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  archivedAt?: string | null;
  isActive: boolean;
  activatedAt?: string | null;
  updatedAt?: string;
  draft: { id: string; version: number; graph: WorkflowGraph } | null;
  published: { id: string; version: number; graph: WorkflowGraph } | null;
};

export function graphForApi(graph: WorkflowCanvasGraph): WorkflowGraph {
  const parsed = parseWorkflowCanvasGraph(graph);
  return {
    nodes: parsed.nodes.map((node): WorkflowNode => ({
      id: node.id,
      type: node.data.nodeType,
      position: node.position,
      config: node.data.config,
    })),
    edges: parsed.edges.map((edge): WorkflowEdge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle as "input1" | "input2" } : {}),
      ...(edge.caseValue === undefined ? {} : { caseValue: edge.caseValue }),
    })),
  };
}

export function graphFromApi(graph: WorkflowGraph): WorkflowCanvasGraph {
  const nodes: WorkflowCanvasNode[] = graph.nodes.map((node) => {
    const definition = getNodeDefinitionForConfig(node.type, node.config);
    if (!definition) throw new Error(`Unsupported workflow node type: ${node.type}`);
    const data = createNodeData(definition);
    return {
      id: node.id,
      type: "workflowNode",
      position: node.position,
      data: { ...data, nodeType: node.type, config: node.config },
    };
  });
  const edges: WorkflowCanvasEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.kind,
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    kind: edge.kind,
    ...(edge.caseValue === undefined ? {} : { caseValue: edge.caseValue }),
    animated: true,
  }));
  return { nodes, edges };
}
