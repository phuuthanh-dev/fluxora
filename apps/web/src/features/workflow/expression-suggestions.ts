import { getItemCollectionField, getOperationMetadata, validateAiSchema, type AiSchema } from "@workflow/contracts";

type NodeExecutionOutput = { nodeId: string; output: unknown };
type SuggestionNode = { id: string; data: { nodeType: string; config?: Record<string, unknown> } };
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
    const output = getOperationMetadata(node.data.nodeType)?.output;
    if (!output || !("knownFields" in output)) continue;
    for (const field of output.knownFields) if (pathSegment.test(field)) suggestions.add(`{{ steps.${node.id}.output.${field} }}`);
    if (node.data.nodeType === "action.gemini" || node.data.nodeType === "action.openai") {
      const schema = validateAiSchema(node.data.config?.outputSchema);
      if (schema.ok) collectSchemaPaths(schema.schema, `steps.${node.id}.output.json`, suggestions, 0);
    }
  }
  return [...suggestions].slice(0, 18);
}

function collectSchemaPaths(schema: AiSchema, path: string, results: Set<string>, depth: number) {
  results.add(`{{ ${path} }}`);
  if (depth >= 4 || schema.type !== "object" || !schema.properties) return;
  for (const [key, child] of Object.entries(schema.properties)) {
    if (pathSegment.test(key)) collectSchemaPaths(child, `${path}.${key}`, results, depth + 1);
  }
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

/** Suggest fields from the first available item of the immediate preceding node. */
export function buildItemExpressionSuggestions(node: SuggestionNode, output: unknown, processedItems: boolean): string[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const field = processedItems ? "items" : getItemCollectionField(node.data.nodeType, node.data.config ?? {});
  if (!field) return [];
  const collection = (output as Record<string, unknown>)[field];
  if (!Array.isArray(collection) || !collection.length) return [];
  const first = collection[0];
  const value = first && typeof first === "object" && !Array.isArray(first) ? first : { value: first };
  const paths = new Set<string>();
  collectPaths(value, "$json", paths, 0);
  return [...paths].slice(0, 18).map((path) => `{{ ${path} }}`);
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
