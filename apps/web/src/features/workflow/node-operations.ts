import type { WorkflowCanvasNode } from "./node-catalog";

export function duplicateWorkflowNode(node: WorkflowCanvasNode, id: string): WorkflowCanvasNode {
  return {
    ...structuredClone(node),
    id,
    position: { x: node.position.x + 42, y: node.position.y + 42 },
    selected: true,
    data: { ...node.data, label: `${node.data.label} copy` },
  };
}
