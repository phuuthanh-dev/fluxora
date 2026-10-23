import type { WorkflowCanvasEdge, WorkflowCanvasNode } from "./node-catalog";

export function autoLayoutNodes(nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]) {
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const source = queue[cursor];
    if (!source) continue;
    for (const target of outgoing.get(source) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(source) ?? 0) + 1));
      const nextIncoming = (incoming.get(target) ?? 1) - 1;
      incoming.set(target, nextIncoming);
      if (nextIncoming === 0) queue.push(target);
    }
  }
  const rows = new Map<number, number>();
  return nodes.map((node) => {
    const column = rank.get(node.id) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { ...node, position: { x: 90 + column * 300, y: 120 + row * 190 } };
  });
}
