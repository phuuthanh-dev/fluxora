import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { WorkflowCanvasNode } from "./node-catalog";

const categoryName = {
  trigger: "Trigger",
  condition: "Condition",
  action: "Action",
  approval: "Approval",
};

export function WorkflowNode({ data, selected }: NodeProps<WorkflowCanvasNode>) {
  return (
    <article className={`workflow-node workflow-node--${data.category} ${selected ? "workflow-node--selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <p className="workflow-node__category">{categoryName[data.category]}</p>
      <h3>{data.label}</h3>
      <p>{data.description}</p>
      {!data.available && <span className="workflow-node__badge">Planned</span>}
      <Handle type="source" position={Position.Right} className="workflow-node__handle" />
    </article>
  );
}
