import type { WorkflowGraph } from "./index";

export const mergeInputs = ["input1", "input2"] as const;

/** Drafts can be incomplete; publishing/running requires both distinct ports. */
export function mergeInputIssues(graph: WorkflowGraph, complete: boolean): string[] {
  const issues: string[] = [];
  for (const edge of graph.edges) {
    const target = graph.nodes.find((node) => node.id === edge.target);
    if (target?.type === "action.merge") {
      if (!mergeInputs.some((port) => port === edge.targetHandle)) issues.push("Connect Merge to Input 1 or Input 2.");
    } else if (edge.targetHandle) issues.push("Only Merge has numbered inputs.");
  }
  for (const node of graph.nodes.filter((node) => node.type === "action.merge")) {
    const edges = graph.edges.filter((edge) => edge.target === node.id);
    for (const port of mergeInputs) {
      const count = edges.filter((edge) => edge.targetHandle === port).length;
      if (count > 1 || complete && count !== 1) issues.push(`Merge ${node.id} needs one connection on ${port === "input1" ? "Input 1" : "Input 2"}.`);
    }
  }
  return issues;
}
