import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle2, CircleX, LoaderCircle, PauseCircle, SkipForward } from "lucide-react";
import { getAppDefinition, getNodeDefinition, outputKindsForNodeType, type WorkflowCanvasNode } from "./node-catalog";
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
  const app = definition?.appId ? getAppDefinition(definition.appId) : undefined;
  const displayLabel = definition && data.label === definition.label ? definition.operationLabel : data.label;
  const status = data.executionStatus;
  const statusLabel = status === "SUCCEEDED" ? "Succeeded" : status === "FAILED" ? "Failed" : status === "RUNNING" ? "Running" : status === "WAITING" ? "Waiting" : status === "SKIPPED" ? "Skipped" : null;

  return (
    <article className={`workflow-node workflow-node--${data.category} ${selected ? "workflow-node--selected" : ""} ${status ? `workflow-node--execution-${status.toLowerCase()}` : ""}`}>
      {data.nodeType === "action.merge" ? ["input1", "input2"].map((port, index) => <span key={port} className="workflow-node__input" style={{ top: `${(index + 1) * 33.33}%` }}><Handle id={port} type="target" position={Position.Left} className="workflow-node__handle workflow-node__handle--target" aria-label={`Connect Input ${index + 1} to Merge`} title={`Input ${index + 1}`} /><span>{index + 1}</span></span>) : <Handle
        type="target"
        position={Position.Left}
        className="workflow-node__handle workflow-node__handle--target"
        aria-label={`Connect input to ${data.label}`}
        title="Drag to connect"
      />}
      <p className="workflow-node__category">{app ? `${app.label} · ${categoryName[data.category]}` : categoryName[data.category]}</p>
      {statusLabel && <span className="workflow-node__execution" title={`Last run: ${statusLabel}`} aria-label={`Last run: ${statusLabel}`} role="img">{status === "SUCCEEDED" ? <CheckCircle2 size={16} /> : status === "FAILED" ? <CircleX size={16} /> : status === "RUNNING" ? <LoaderCircle size={16} className="ui-spinner" /> : status === "WAITING" ? <PauseCircle size={16} /> : <SkipForward size={16} />}</span>}
      <div className="workflow-node__heading">
        {definition && <span className="workflow-node__provider-icon"><NodeIcon name={definition.icon} size={16} /></span>}
        <h3>{displayLabel}</h3>
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
