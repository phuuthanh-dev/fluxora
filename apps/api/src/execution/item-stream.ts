import { getItemCollectionField, type WorkflowGraph, type WorkflowNode } from "@workflow/contracts";
import { NodeFailure } from "./node-failure";

export const maximumOutputItems = 100;
export const maximumItemBytes = 1_000_000;
export type WorkflowItem = { json: Record<string, unknown>; pairedItem?: { nodeId: string; itemIndex: number } };

export function isCollectionProducer(node: WorkflowNode, config: Record<string, unknown>): boolean {
  return getItemCollectionField(node.type, config) !== undefined;
}

/** Validate item paths before any node runs. Joins and pauses are not supported. */
export function assertSupportedItemPath(graph: WorkflowGraph, sourceId: string, allowSourceError = false): void {
  const pending = [sourceId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (visited.has(current)) throw new NodeFailure("ITEM_FLOW_UNSUPPORTED", "Item paths cannot contain joins or cycles.", false);
    visited.add(current);
    const node = graph.nodes.find((entry) => entry.id === current);
    // A source failure happens before an item stream exists; its error branch
    // uses the ordinary node-level runner, not per-item continuation.
    const sourceError = allowSourceError && current === sourceId && node !== undefined && isCollectionProducer(node, node.config);
    const outgoing = graph.edges.filter((edge) => edge.source === current && !(sourceError && edge.kind === "error"));
    const conditional = node?.type === "condition.if" || node?.type === "condition.switch";
    if (!conditional && (outgoing.length > 1 || outgoing.some((edge) => edge.kind !== "success"))) throw new NodeFailure("ITEM_FLOW_UNSUPPORTED", "Item actions currently support one success path without error branches.", false);
    for (const edge of outgoing) {
      const target = graph.nodes.find((entry) => entry.id === edge.target);
      if (!target || !(target.type.startsWith("action.") || target.type === "condition.if" || target.type === "condition.switch") || graph.edges.filter((entry) => entry.target === target.id).length !== 1) throw new NodeFailure("ITEM_FLOW_UNSUPPORTED", "Item paths cannot contain joins or approvals.", false);
      pending.push(target.id);
    }
  }
}

/** Turn one connector result into items without losing its separately stored receipt. */
export function outputItems(node: WorkflowNode, config: Record<string, unknown>, output: Record<string, unknown>, pairedItem?: WorkflowItem["pairedItem"]): WorkflowItem[] {
  const field = getItemCollectionField(node.type, config);
  if (!field) return [{ json: output, ...(pairedItem ? { pairedItem } : {}) }];
  const collection = output[field];
  // Google Sheets omits values when the selected range has no cells.
  if (node.type === "action.google-sheets" && collection === undefined) return [];
  if (!Array.isArray(collection)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "This node returned an invalid item list.", false);
  if (collection.length > maximumOutputItems) throw new NodeFailure("ITEM_LIMIT_EXCEEDED", `A node can return at most ${maximumOutputItems} items.`, false);
  if (Buffer.byteLength(JSON.stringify(collection), "utf8") > maximumItemBytes) throw new NodeFailure("ITEM_SIZE_EXCEEDED", "Item data exceeds the 1 MB limit.", false);
  return collection.map((value) => ({
    json: value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { value },
    ...(pairedItem ? { pairedItem } : {}),
  }));
}
