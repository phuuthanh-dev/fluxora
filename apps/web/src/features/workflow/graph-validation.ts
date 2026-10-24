import { outputKindsForNodeType, type WorkflowCanvasEdge, type WorkflowCanvasNode } from "./node-catalog";

export type GraphIssue = {
  severity: "error" | "warning";
  message: string;
};

export function validateWorkflowGraph(nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const triggers = nodes.filter((node) => node.data.category === "trigger");

  if (triggers.length === 0) {
    issues.push({ severity: "error", message: "Add a trigger to start this workflow." });
  }

  if (triggers.length > 1) {
    issues.push({ severity: "warning", message: "This workflow has multiple triggers." });
  }

  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      issues.push({ severity: "error", message: "A connection refers to a missing node." });
      continue;
    }
    if (!outputKindsForNodeType(source.data.nodeType).includes(edge.kind)) {
      issues.push({ severity: "error", message: `The ${edge.kind} branch is not valid for ${source.data.label}.` });
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
    if (node.data.nodeType === "condition.switch") {
      const values = switchCaseValues(node.data.config);
      const caseEdges = edges.filter((edge) => edge.source === node.id && edge.kind === "case");
      if (values.length === 0) issues.push({ severity: "error", message: `${node.data.label} needs at least one non-empty case value.` });
      if (new Set(values).size !== values.length) issues.push({ severity: "error", message: `${node.data.label} has duplicate case values.` });
      for (const edge of caseEdges) {
        if (!edge.caseValue || !values.includes(edge.caseValue)) issues.push({ severity: "error", message: `The case branch from ${node.data.label} must map to one configured case value.` });
      }
    }
  }

  return issues;
}

function switchCaseValues(config: Record<string, unknown>) {
  if (!Array.isArray(config.cases)) return [];
  return config.cases.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const value = (candidate as Record<string, unknown>).value;
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
  });
}
