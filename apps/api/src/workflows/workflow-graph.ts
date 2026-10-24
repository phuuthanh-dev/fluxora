import { workflowEdgeKinds, workflowNodeTypes, type WorkflowEdgeKind, type WorkflowGraph, type WorkflowNodeType } from "@workflow/contracts";
import { BadRequestException } from "@nestjs/common";

type StoredWorkflowNode = WorkflowGraph["nodes"][number];
type StoredWorkflowEdge = WorkflowGraph["edges"][number];

const nodeTypeSet = new Set<string>(workflowNodeTypes);
const edgeKindSet = new Set<string>(workflowEdgeKinds);

export function parseWorkflowGraph(value: unknown): WorkflowGraph {
  const record = readRecord(value, "Workflow graph must be a JSON object.");
  const rawNodes = readArray(record.nodes, "Workflow graph needs a nodes array.");
  const rawEdges = readArray(record.edges, "Workflow graph needs an edges array.");
  const nodes = rawNodes.map(parseNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) invalid("Workflow node IDs must be unique.");
  const edges = rawEdges.map(parseEdge);

  for (const edge of edges) {
    const source = nodes.find((node) => node.id === edge.source);
    if (!source || !nodeIds.has(edge.target)) invalid(`Connection ${edge.id} refers to a missing node.`);
    if (!source || !outputKinds(source.type).includes(edge.kind)) invalid(`Connection ${edge.id} uses an invalid ${edge.kind} branch.`);
  }

  if (containsCycle(nodes, edges)) invalid("Loops are not supported in the MVP workflow graph.");
  return { nodes, edges };
}

export function validatePublishableGraph(graph: WorkflowGraph) {
  const triggers = graph.nodes.filter((node) => node.type.startsWith("trigger."));
  if (triggers.length !== 1) invalid("A published workflow must have exactly one trigger.");
  if (!graph.nodes.length) invalid("A published workflow must contain at least one node.");
  for (const node of graph.nodes) {
    if (node.type !== "condition.switch") continue;
    const values = switchCaseValues(node.config);
    if (!values.length) invalid(`Switch node ${node.id} needs at least one non-empty case value.`);
    if (new Set(values).size !== values.length) invalid(`Switch node ${node.id} has duplicate case values.`);
    for (const edge of graph.edges.filter((edge) => edge.source === node.id && edge.kind === "case")) {
      if (!edge.caseValue || !values.includes(edge.caseValue)) invalid(`Switch case edge ${edge.id} must map to a configured case value.`);
    }
  }
}

function parseNode(value: unknown): StoredWorkflowNode {
  const record = readRecord(value, "Each workflow node must be an object.");
  const data = record.data === undefined ? undefined : readRecord(record.data, "Node data must be an object.");
  const type = readNodeType(data?.nodeType ?? record.type);
  const position = readRecord(record.position, "Node position is required.");
  const x = readNumber(position.x, "Node x position must be a number.");
  const y = readNumber(position.y, "Node y position must be a number.");
  const configSource = record.config ?? data?.config;
  const config = readRecord(configSource, "Node config must be an object.");
  return { id: readString(record.id, "Node ID is required."), type, position: { x, y }, config };
}

function parseEdge(value: unknown): StoredWorkflowEdge {
  const record = readRecord(value, "Each workflow connection must be an object.");
  const kind = readString(record.kind, "Connection kind is required.");
  if (!edgeKindSet.has(kind)) invalid("Connection kind is not supported.");
  const caseValue = record.caseValue === undefined ? undefined : readString(record.caseValue, "Case value must be a string.");
  return {
    id: readString(record.id, "Connection ID is required."),
    source: readString(record.source, "Connection source is required."),
    target: readString(record.target, "Connection target is required."),
    kind: kind as WorkflowEdgeKind,
    ...(caseValue === undefined ? {} : { caseValue }),
  };
}

function containsCycle(nodes: StoredWorkflowNode[], edges: StoredWorkflowEdge[]) {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((node) => visit(node.id));
}

function outputKinds(type: WorkflowNodeType): WorkflowEdgeKind[] {
  if (type === "condition.if") return ["true", "false"];
  if (type === "condition.switch") return ["case", "default"];
  return type.startsWith("trigger.") ? ["success"] : ["success", "error"];
}

function switchCaseValues(config: Record<string, unknown>) {
  if (!Array.isArray(config.cases)) return [];
  return config.cases.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const value = (candidate as Record<string, unknown>).value;
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
  });
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  return value as Record<string, unknown>;
}

function readArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) invalid(message);
  return value;
}

function readString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) invalid(message);
  return value;
}

function readNumber(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(message);
  return value;
}

function readNodeType(value: unknown): WorkflowNodeType {
  const type = readString(value, "Node type is required.");
  if (!nodeTypeSet.has(type)) invalid("Node type is not supported.");
  return type as WorkflowNodeType;
}

function invalid(message: string): never {
  throw new BadRequestException({ code: "INVALID_WORKFLOW_GRAPH", message });
}
