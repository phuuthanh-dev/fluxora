import { getItemCollectionField, type WorkflowGraph, type WorkflowNode } from "@workflow/contracts";
import { NodeFailure } from "./node-failure";

export const maximumOutputItems = 100;
export const maximumItemBytes = 1_000_000;
export type WorkflowItem = { json: Record<string, unknown>; pairedItem?: { nodeId: string; itemIndex: number } };

export function isCollectionProducer(node: WorkflowNode, config: Record<string, unknown>): boolean {
  return getItemCollectionField(node.type, config) !== undefined;
}

/** This first delivery cannot route per-item branches or pauses safely. */
export function assertLinearItemPath(graph: WorkflowGraph, sourceId: string): void {
  let current = sourceId;
  const visited = new Set<string>();
  while (!visited.has(current)) {
    visited.add(current);
    const outgoing = graph.edges.filter((edge) => edge.source === current);
    if (!outgoing.length) return;
    if (outgoing.length !== 1 || outgoing[0]?.kind !== "success") break;
    const target = graph.nodes.find((node) => node.id === outgoing[0]!.target);
    if (!target || !target.type.startsWith("action.") || graph.edges.filter((edge) => edge.target === target.id).length !== 1) break;
    current = target.id;
  }
  throw new NodeFailure("ITEM_FLOW_UNSUPPORTED", "Item processing currently supports a single path of action nodes. Remove branches, joins, conditions and approvals after the list, or use a different workflow.", false);
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
