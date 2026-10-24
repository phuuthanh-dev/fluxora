import type { WorkflowCanvasNode } from "./node-catalog";

export function manualTriggerTestData(nodes: WorkflowCanvasNode[]) {
  const manual = nodes.find((node) => node.data.nodeType === "trigger.manual");
  const value = manual?.data.config.testData;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
