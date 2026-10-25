import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getNodeDefinition, outputKindsForNodeType, type WorkflowCanvasNode } from "./node-catalog";
import { NodeIcon } from "./node-icon";

const categoryName = {
  trigger: "Trigger",
  condition: "Condition",
  action: "Action",
  approval: "Approval",
};

export function WorkflowNode({ data, selected }: NodeProps<WorkflowCanvasNode>) {
  const outputKinds = outputKindsForNodeType(data.nodeType);
  const definition = getNodeDefinition(data.nodeType);

  return (
    <article className={`workflow-node workflow-node--${data.category} ${selected ? "workflow-node--selected" : ""}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="workflow-node__handle workflow-node__handle--target"
        aria-label={`Connect input to ${data.label}`}
        title="Drag to connect"
      />
      <p className="workflow-node__category">{categoryName[data.category]}</p>
      <div className="workflow-node__heading">
        {definition && <span className="workflow-node__provider-icon"><NodeIcon name={definition.icon} size={16} /></span>}
        <h3>{data.label}</h3>
      </div>
      <p>{data.description}</p>
      {!data.available && <span className="workflow-node__badge">Planned</span>}
      {outputKinds.map((kind, index) => (
        <span key={kind} className="workflow-node__output" style={{ top: `${((index + 1) / (outputKinds.length + 1)) * 100}%` }}>
          <span className="workflow-node__handle-label">{kind}</span>
          <Handle
            className="workflow-node__handle workflow-node__handle--source"
            id={kind}
            position={Position.Right}
            type="source"
            aria-label={`Connect ${kind} output from ${data.label}`}
            title="Drag to connect"
          />
        </span>
      ))}
    </article>
  );
}
