export type WorkflowNodeCategory = "trigger" | "condition" | "action" | "approval";

export type WorkflowNodeType =
  | "trigger.manual"
  | "trigger.cron"
  | "trigger.webhook"
  | "condition.if"
  | "condition.switch"
  | "action.steam.account-snapshot"
  | "action.google-chat.webhook"
  | "action.google-drive"
  | "action.google-sheets"
  | "action.http-request"
  | "approval.request"
  | "action.email";

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

export type WorkflowEdgeKind = "success" | "error" | "true" | "false" | "case" | "default";

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  kind: WorkflowEdgeKind;
  caseValue?: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type NodeExecutionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "waiting";

export type NodeExecutionResult = {
  status: Extract<NodeExecutionStatus, "succeeded" | "failed" | "waiting">;
  output: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};
