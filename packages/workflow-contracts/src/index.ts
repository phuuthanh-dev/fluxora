export const workflowNodeCategories = ["trigger", "condition", "action", "approval"] as const;

export type WorkflowNodeCategory = (typeof workflowNodeCategories)[number];

export const workflowNodeTypes = [
  "trigger.manual",
  "trigger.gmail",
  "trigger.cron",
  "trigger.webhook",
  "trigger.github.issue-opened",
  "trigger.github.pull-request-opened",
  "trigger.github.push",
  "trigger.github.workflow-run-completed",
  "condition.if",
  "condition.switch",
  "action.steam.account-snapshot",
  "action.google-chat.webhook",
  "action.discord.webhook",
  "action.telegram.message",
  "action.google-drive",
  "action.google-sheets",
  "action.http-request",
  "approval.request",
  "action.email",
  "action.google-chat.oauth",
  "action.openai",
  "action.gemini",
  "action.mongodb",
  "action.mongodb.insert",
  "action.notion.search-pages",
  "action.rss.read",
  "action.trello.create-card",
  "action.sentry.list-issues",
  "action.postgres.select",
  "action.gmail.read",
  "action.google-calendar.list-events",
  "action.google-calendar.create-event",
  "action.google-calendar.get-event",
  "action.google-calendar.update-event",
  "action.google-calendar.delete-event",
  "action.google-calendar.availability",
  "action.github",
  "action.github.add-label",
  "action.github.add-comment",
  "action.github.merge-pull-request",
  "action.facebook-meta",
  "action.instagram",
] as const;

export type WorkflowNodeType = (typeof workflowNodeTypes)[number];

/**
 * Node types backed by an executor in the current runtime.
 *
 * `workflowNodeTypes` intentionally also contains schema-only roadmap nodes so
 * older/imported graphs remain readable. Keep this list as the capability
 * boundary used by runtime and catalog parity checks; adding a node here is a
 * deliberate implementation claim.
 */
export const executableWorkflowNodeTypes = [
  "trigger.manual",
  "trigger.gmail",
  "trigger.cron",
  "trigger.webhook",
  "trigger.github.issue-opened",
  "trigger.github.pull-request-opened",
  "trigger.github.push",
  "trigger.github.workflow-run-completed",
  "condition.if",
  "condition.switch",
  "action.steam.account-snapshot",
  "action.google-chat.webhook",
  "action.discord.webhook",
  "action.telegram.message",
  "action.google-drive",
  "action.google-sheets",
  "action.http-request",
  "action.email",
  "action.gemini",
  "action.openai",
  "action.mongodb",
  "action.mongodb.insert",
  "action.notion.search-pages",
  "action.rss.read",
  "action.trello.create-card",
  "action.sentry.list-issues",
  "action.postgres.select",
  "action.gmail.read",
  "action.google-calendar.list-events",
  "action.google-calendar.create-event",
  "action.google-calendar.get-event",
  "action.google-calendar.update-event",
  "action.google-calendar.delete-event",
  "action.google-calendar.availability",
  "action.google-chat.oauth",
  "approval.request",
  "action.github",
  "action.github.add-label",
  "action.github.add-comment",
  "action.github.merge-pull-request",
] as const satisfies readonly WorkflowNodeType[];

export type ExecutableWorkflowNodeType = (typeof executableWorkflowNodeTypes)[number];

const executableWorkflowNodeTypeSet = new Set<string>(executableWorkflowNodeTypes);

export function isExecutableWorkflowNodeType(type: WorkflowNodeType | string): type is ExecutableWorkflowNodeType {
  return executableWorkflowNodeTypeSet.has(type);
}

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
