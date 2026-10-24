export const workflowNodeCategories = ["trigger", "condition", "action", "approval"] as const;

export type WorkflowNodeCategory = (typeof workflowNodeCategories)[number];

export const workflowNodeTypes = [
  "trigger.manual",
  "trigger.cron",
  "trigger.webhook",
  "condition.if",
  "condition.switch",
  "action.steam.account-snapshot",
  "action.google-chat.webhook",
  "action.google-drive",
  "action.google-sheets",
  "action.http-request",
  "approval.request",
  "action.email",
  "action.google-chat.oauth",
  "action.openai",
  "action.gemini",
  "action.mongodb",
  "action.github",
  "action.facebook-meta",
  "action.instagram",
] as const;

export type WorkflowNodeType = (typeof workflowNodeTypes)[number];

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

export const workflowEdgeKinds = ["success", "error", "true", "false", "case", "default"] as const;

export type WorkflowEdgeKind = (typeof workflowEdgeKinds)[number];

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
