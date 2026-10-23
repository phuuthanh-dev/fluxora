type NodeExecutionOutput = { nodeId: string; output: unknown };

export function buildExpressionSuggestions(executions: NodeExecutionOutput[]) {
  const suggestions = new Set<string>();
  for (const execution of executions) {
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
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) collectPaths(child, `${path}.${key}`, results, depth + 1);
  }
}
