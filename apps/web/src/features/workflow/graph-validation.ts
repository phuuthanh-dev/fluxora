import type { WorkflowCanvasEdge, WorkflowCanvasNode } from "./node-catalog";

export type GraphIssue = {
  severity: "error" | "warning";
  message: string;
};

export function validateWorkflowGraph(nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const triggers = nodes.filter((node) => node.data.category === "trigger");

  if (triggers.length === 0) {
    issues.push({ severity: "error", message: "Add a trigger to start this workflow." });
  }

  if (triggers.length > 1) {
    issues.push({ severity: "warning", message: "This workflow has multiple triggers." });
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ severity: "error", message: "A connection refers to a missing node." });
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;

    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  if (nodes.some((node) => visit(node.id))) {
    issues.push({ severity: "error", message: "Loops are not supported in the MVP workflow graph." });
  }

  for (const node of nodes) {
    if (!node.data.available) {
      issues.push({ severity: "warning", message: `${node.data.label} is not available in the MVP.` });
    }
  }

  return issues;
}
