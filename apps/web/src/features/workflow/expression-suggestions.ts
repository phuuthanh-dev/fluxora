import { getOperationMetadata } from "@workflow/contracts";

type NodeExecutionOutput = { nodeId: string; output: unknown };
type SuggestionNode = { id: string; data: { nodeType: string; nodeVersion?: number } };
type SuggestionEdge = { source: string; target: string };
const pathSegment = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Graph reachability is only a possibility: a conditional branch may not run. */
export function upstreamNodeIds(target: string, edges: SuggestionEdge[]): Set<string> {
  const result = new Set<string>();
  const pending = [target];
  while (pending.length) {
    const current = pending.pop();
    for (const edge of edges) {
      if (edge.target !== current || edge.source === target || result.has(edge.source)) continue;
      result.add(edge.source);
      pending.push(edge.source);
    }
  }
  return result;
}

/** Known fields are hints, not a guarantee that an operation returns them. */
export function buildPossibleExpressionSuggestions(nodes: SuggestionNode[], upstream: ReadonlySet<string>) {
  const suggestions = new Set<string>();
  for (const node of nodes) {
    if (!upstream.has(node.id) || !pathSegment.test(node.id)) continue;
    const output = getOperationMetadata(node.data.nodeType, node.data.nodeVersion)?.output;
    if (!output || !("knownFields" in output)) continue;
    for (const field of output.knownFields) if (pathSegment.test(field)) suggestions.add(`{{ steps.${node.id}.output.${field} }}`);
  }
  return [...suggestions].slice(0, 18);
}

export function buildExpressionSuggestions(executions: NodeExecutionOutput[]) {
  const suggestions = new Set<string>();
  for (const execution of executions) {
    if (!pathSegment.test(execution.nodeId)) continue;
    const root = `steps.${execution.nodeId}.output`;
    collectPaths(execution.output, root, suggestions, 0);
  }
  return [...suggestions].slice(0, 18).map((path) => `{{ ${path} }}`);
}

function collectPaths(value: unknown, path: string, results: Set<string>, depth: number) {
  results.add(path);
  if (depth >= 4 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length) collectPaths(value[0], `${path}[0]`, results, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (pathSegment.test(key)) collectPaths(child, `${path}.${key}`, results, depth + 1);
  }
}
