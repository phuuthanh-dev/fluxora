import { workflowEdgeKinds, workflowNodeCategories, workflowNodeTypes } from "@workflow/contracts";
import { z } from "zod";
import { edgeKindFromHandle, getNodeDefinition, outputKindsForNodeType, type WorkflowCanvasEdge, type WorkflowCanvasNode } from "./node-catalog";

const canvasNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("workflowNode"),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  data: z.object({
    nodeType: z.enum(workflowNodeTypes),
    label: z.string().min(1).max(120),
    description: z.string().max(500),
    category: z.enum(workflowNodeCategories),
    config: z.record(z.string(), z.unknown()),
    available: z.boolean(),
  }),
});

const canvasEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
  kind: z.enum(workflowEdgeKinds),
  caseValue: z.string().optional(),
});

const workflowCanvasGraphSchema = z.object({
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
});

export type WorkflowCanvasGraph = {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
};

export function parseWorkflowCanvasGraph(value: unknown): WorkflowCanvasGraph {
  const graph = workflowCanvasGraphSchema.parse(value);
  const nodes = graph.nodes as WorkflowCanvasNode[];
  const edges = graph.edges as WorkflowCanvasEdge[];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  if (nodeById.size !== nodes.length) {
    throw new Error("Workflow node IDs must be unique.");
  }

  for (const node of nodes) {
    const definition = getNodeDefinition(node.data.nodeType);
    if (!definition || definition.category !== node.data.category || definition.available !== node.data.available) {
      throw new Error(`Node ${node.id} does not match a supported node definition.`);
    }
  }

  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    if (!source || !nodeById.has(edge.target)) {
      throw new Error(`Connection ${edge.id} refers to a missing node.`);
    }
    if (edgeKindFromHandle(edge.sourceHandle) !== edge.kind || !outputKindsForNodeType(source.data.nodeType).includes(edge.kind)) {
      throw new Error(`Connection ${edge.id} uses an invalid branch for ${source.data.label}.`);
    }
  }

  return { nodes, edges };
}
