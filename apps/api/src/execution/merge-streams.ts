import { mergeInputs, type WorkflowEdge, type WorkflowGraph, type WorkflowNode } from "@workflow/contracts";
import { maximumItemBytes, maximumOutputItems, outputItems, isCollectionProducer, type WorkflowItem } from "./item-stream";
import { NodeFailure } from "./node-failure";

export function appendInputs(graph: WorkflowGraph, nodeId: string, streams: Map<WorkflowEdge, WorkflowItem[]>): WorkflowItem[] {
  const items = mergeInputs.flatMap((port) => {
    const edge = graph.edges.find((candidate) => candidate.target === nodeId && candidate.targetHandle === port);
    return edge ? streams.get(edge) ?? [] : [];
  });
  if (items.length > maximumOutputItems) throw new NodeFailure("ITEM_LIMIT_EXCEEDED", "Merge can append at most 100 items in total.", false);
  if (Buffer.byteLength(JSON.stringify(items), "utf8") > maximumItemBytes) throw new NodeFailure("ITEM_SIZE_EXCEEDED", "Merged items exceed the 1 MB limit.", false);
  return items;
}

/** Empty lists skip actions, but still settle the next reachable Merge. */
export function mergesAfterEmpty(graph: WorkflowGraph, targets: string[]): WorkflowNode[] {
  const pending = [...targets];
  const visited = new Set<string>();
  const merges: WorkflowNode[] = [];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = graph.nodes.find((candidate) => candidate.id === id);
    if (node?.type === "action.merge") merges.push(node);
    else pending.push(...graph.edges.filter((edge) => edge.source === id).map((edge) => edge.target));
  }
  return merges;
}

type Receipt = { nodeId: string; status: string; output: unknown; items: Array<{ itemIndex: number; status: string; input: unknown; output: unknown }> };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function matches(edge: WorkflowEdge, node: WorkflowNode, output: Record<string, unknown>, failed: boolean): boolean {
  if (failed) return edge.kind === "error";
  if (node.type === "condition.if") return edge.kind === (output.matches ? "true" : "false");
  if (node.type === "condition.switch") return output.matched === null ? edge.kind === "default" : edge.kind === "case" && edge.caseValue === String(output.matched);
  return edge.kind === "success";
}

export function failedItem(nodeId: string): WorkflowItem {
  return { json: { error: { code: "NODE_FAILED", message: "The preceding node failed. See execution details." } }, pairedItem: { nodeId, itemIndex: 0 } };
}

/** Rebuild only completed edge streams after approval; never replay a provider.
 * Persisted items remain marked so expression resolution rejects redacted values.
 */
export function restoreMergeStreams(graph: WorkflowGraph, receipts: Receipt[]): Map<WorkflowEdge, WorkflowItem[]> {
  const streams = new Map<WorkflowEdge, WorkflowItem[]>();
  for (const receipt of receipts) {
    if (!["SUCCEEDED", "FAILED"].includes(receipt.status)) continue;
    const node = graph.nodes.find((candidate) => candidate.id === receipt.nodeId);
    if (!node) continue;
    const outgoing = graph.edges.filter((edge) => edge.source === node.id);
    const output = object(receipt.output);
    if (receipt.items.length) {
      for (const record of receipt.items) {
        if (!["SUCCEEDED", "FAILED"].includes(record.status)) continue;
        const failed = record.status === "FAILED";
        const input = object(record.input);
        const recordOutput = object(record.output);
        const pairedItem = { nodeId: node.id, itemIndex: record.itemIndex };
        const passthrough = node.type === "action.merge" || node.type.startsWith("condition.");
        const items = failed ? [{ json: recordOutput, pairedItem }] : passthrough ? [{ json: object(input.item), pairedItem }] : outputItems(node, object(input.config), recordOutput, pairedItem);
        for (const edge of outgoing.filter((edge) => matches(edge, node, recordOutput, failed))) {
          streams.set(edge, [...streams.get(edge) ?? [], ...items.map((item) => ({ ...item, persisted: true }))]);
        }
      }
    } else {
      const failed = receipt.status === "FAILED";
      const items = failed ? [failedItem(node.id)] : outputItems(node, { ...node.config, ...(typeof output.operation === "string" ? { operation: output.operation } : {}) }, output).map((item, itemIndex) => ({ ...item, pairedItem: { nodeId: node.id, itemIndex } }));
      for (const edge of outgoing.filter((edge) => matches(edge, node, output, failed))) {
        if (isCollectionProducer(node, node.config) || graph.nodes.some((target) => target.id === edge.target && target.type === "action.merge")) streams.set(edge, items.map((item) => ({ ...item, persisted: true })));
      }
    }
  }
  return streams;
}
