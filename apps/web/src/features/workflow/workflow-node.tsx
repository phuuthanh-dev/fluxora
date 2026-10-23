import { Handle, Position, type NodeProps } from "@xyflow/react";
import { outputKindsForNodeType, type WorkflowCanvasNode } from "./node-catalog";

const categoryName = {
  trigger: "Trigger",
  condition: "Condition",
  action: "Action",
  approval: "Approval",
};

export function WorkflowNode({ data, selected }: NodeProps<WorkflowCanvasNode>) {
  const outputKinds = outputKindsForNodeType(data.nodeType);

  return (
    <article className={`workflow-node workflow-node--${data.category} ${selected ? "workflow-node--selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <p className="workflow-node__category">{categoryName[data.category]}</p>
      <h3>{data.label}</h3>
      <p>{data.description}</p>
      {!data.available && <span className="workflow-node__badge">Planned</span>}
      {outputKinds.map((kind, index) => (
        <span key={kind} className="workflow-node__output" style={{ top: `${((index + 1) / (outputKinds.length + 1)) * 100}%` }}>
          <span className="workflow-node__handle-label">{kind}</span>
          <Handle
            className="workflow-node__handle"
            id={kind}
            position={Position.Right}
            type="source"
          />
        </span>
      ))}
    </article>
  );
}
