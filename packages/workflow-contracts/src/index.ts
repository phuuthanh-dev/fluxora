export * from "./ai-schema";
export * from "./node-config-schema";
export * from "./operation-metadata";
export * from "./riot-lol";
export type { NodeConfigurationField, NodeFieldVisibility, NodeResource, NodeSelectOption } from "./node-configuration-fields";
export { trelloCardConfigurationFields } from "./trello-card-fields";
export type { TrelloCardOperation } from "./trello-card-fields";
export { gmailWriteConfigurationFields } from "./gmail-write-fields";
export type { GmailWriteOperation } from "./gmail-write-fields";
export { notionReadConfigurationFields } from "./notion-read-fields";
export type { NotionReadOperation } from "./notion-read-fields";
export { getSharedNodeConfigurationFields, sharedNodeConfigurationTypes } from "./configuration-fields-registry";

export const workflowNodeCategories = ["trigger", "condition", "action", "approval"] as const;

export type WorkflowNodeCategory = (typeof workflowNodeCategories)[number];
export { getItemCollectionField } from "./item-metadata";

export const workflowNodeTypes = [
  "trigger.manual",
  "trigger.gmail",
  "trigger.notion.page",
  "trigger.google-drive.file",
  "trigger.google-sheets.row",
  "trigger.google-calendar.event",
  "trigger.rss.new-item",
  "trigger.steam.game-news",
  "trigger.telegram.update",
  "trigger.vercel.deployment",
  "trigger.gitlab.pipeline",
  "trigger.gitlab.merge-request",
  "trigger.jira.issue",
  "trigger.slack.event",
  "trigger.trello.board-action",
  "trigger.sentry.issue-created",
  "trigger.cron",
  "trigger.webhook",
  "trigger.uptime-kuma.alert",
  "trigger.github.issue-opened",
  "trigger.github.pull-request-opened",
  "trigger.github.push",
  "trigger.github.workflow-run-completed",
  "condition.if",
  "condition.switch",
  "action.edit-fields",
  "action.aggregate",
  "action.split-out",
  "action.sort",
  "action.limit",
  "action.merge",
  "action.steam.account-snapshot",
  "action.steam",
  "action.riot-lol",
  "action.riot-tft",
  "action.riot-valorant",
  "action.riot-lor",
  "action.riot-2xko",
  "action.google-chat.webhook",
  "action.discord.webhook",
  "action.slack.webhook",
  "action.slack.message",
  "action.slack.update-message",
  "action.telegram.message",
  "action.telegram.reply",
  "action.telegram.edit-message",
  "action.google-drive",
  "action.google-drive.get-file",
  "action.google-drive.create-folder",
  "action.google-sheets",
  "action.http-request",
  "approval.request",
  "action.email",
  "action.google-chat.oauth",
  "action.google-chat.reply",
  "action.google-chat.edit-message",
  "action.openai",
  "action.gemini",
  "action.mongodb",
  "action.mongodb.insert",
  "action.notion.search-pages",
  "action.notion.retrieve-page",
  "action.notion.list-children",
  "action.notion.retrieve-property",
  "action.notion.query-data-source",
  "action.notion.create-entry",
  "action.notion.update-entry",
  "action.airtable.list-records",
  "action.airtable.get-record",
  "action.airtable.create-record",
  "action.airtable.update-record",
  "action.jira.search-issues",
  "action.jira.create-issue",
  "action.jira.get-issue",
  "action.jira.update-issue",
  "action.jira.add-comment",
  "action.gitlab.get-project",
  "action.gitlab.list-issues",
  "action.gitlab.get-issue",
  "action.gitlab.create-issue",
  "action.gitlab.add-comment",
  "action.gitlab.update-issue",
  "action.gitlab.get-pipeline",
  "action.gitlab.get-merge-request",
  "action.notion.create-page",
  "action.notion.update-title",
  "action.notion.append-block",
  "action.rss.read",
  "action.trello.create-card",
  "action.trello.get-card",
  "action.trello.update-card",
  "action.trello.move-card",
  "action.trello.archive-card",
  "action.trello.list-cards",
  "action.trello.find-cards",
  "action.sentry.list-issues",
  "action.sentry.get-issue",
  "action.vercel.list-deployments",
  "action.vercel.public-deployment-lookup",
  "action.supabase.select",
  "action.supabase.insert-row",
  "action.reddit.list-posts",
  "action.postgres.select",
  "action.postgres.insert-row",
  "action.postgres.upsert-row",
  "action.gmail.read",
  "action.gmail.get-message",
  "action.gmail.send",
  "action.gmail.reply",
  "action.gmail.create-draft",
  "action.gmail.update-draft",
  "action.gmail.modify-label",
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
  "action.github.list-issues",
  "action.github.get-issue",
  "action.github.update-issue",
  "action.github.list-pull-requests",
  "action.github.get-pull-request",
  "action.facebook-meta",
  "action.instagram",
] as const;

export type WorkflowNodeType = (typeof workflowNodeTypes)[number];

/** Trigger operations with individually registered HTTP endpoints. */
export function isWebhookTriggerType(type: string): boolean {
  return type === "trigger.webhook" || type.startsWith("trigger.github.") || type.startsWith("trigger.gitlab.") || ["trigger.uptime-kuma.alert", "trigger.telegram.update", "trigger.vercel.deployment", "trigger.trello.board-action", "trigger.sentry.issue-created", "trigger.slack.event", "trigger.jira.issue"].includes(type);
}

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
  "trigger.notion.page",
  "trigger.google-drive.file",
  "trigger.google-sheets.row",
  "trigger.google-calendar.event",
  "trigger.rss.new-item",
  "trigger.steam.game-news",
  "trigger.telegram.update",
  "trigger.vercel.deployment",
  "trigger.gitlab.pipeline",
  "trigger.gitlab.merge-request",
  "trigger.jira.issue",
  "trigger.slack.event",
  "trigger.trello.board-action",
  "trigger.sentry.issue-created",
  "trigger.cron",
  "trigger.webhook",
  "trigger.uptime-kuma.alert",
  "trigger.github.issue-opened",
  "trigger.github.pull-request-opened",
  "trigger.github.push",
  "trigger.github.workflow-run-completed",
  "condition.if",
  "condition.switch",
  "action.edit-fields",
  "action.aggregate",
  "action.split-out",
  "action.sort",
  "action.limit",
  "action.merge",
  "action.steam.account-snapshot",
  "action.steam",
  "action.riot-lol",
  "action.riot-tft",
  "action.google-chat.webhook",
  "action.discord.webhook",
  "action.slack.webhook",
  "action.slack.message",
  "action.slack.update-message",
  "action.telegram.message",
  "action.telegram.reply",
  "action.telegram.edit-message",
  "action.google-drive",
  "action.google-drive.get-file",
  "action.google-drive.create-folder",
  "action.google-sheets",
  "action.http-request",
  "action.email",
  "action.gemini",
  "action.openai",
  "action.mongodb",
  "action.mongodb.insert",
  "action.notion.search-pages",
  "action.notion.retrieve-page",
  "action.notion.list-children",
  "action.notion.retrieve-property",
  "action.notion.query-data-source",
  "action.notion.create-entry",
  "action.notion.update-entry",
  "action.airtable.list-records",
  "action.airtable.get-record",
  "action.airtable.create-record",
  "action.airtable.update-record",
  "action.jira.search-issues",
  "action.jira.create-issue",
  "action.jira.get-issue",
  "action.jira.update-issue",
  "action.jira.add-comment",
  "action.gitlab.get-project",
  "action.gitlab.list-issues",
  "action.gitlab.get-issue",
  "action.gitlab.create-issue",
  "action.gitlab.add-comment",
  "action.gitlab.update-issue",
  "action.gitlab.get-pipeline",
  "action.gitlab.get-merge-request",
  "action.notion.create-page",
  "action.notion.update-title",
  "action.notion.append-block",
  "action.rss.read",
  "action.trello.create-card",
  "action.trello.get-card",
  "action.trello.update-card",
  "action.trello.move-card",
  "action.trello.archive-card",
  "action.trello.list-cards",
  "action.trello.find-cards",
  "action.sentry.list-issues",
  "action.sentry.get-issue",
  "action.vercel.list-deployments",
  "action.vercel.public-deployment-lookup",
  "action.supabase.select",
  "action.supabase.insert-row",
  "action.reddit.list-posts",
  "action.postgres.select",
  "action.postgres.insert-row",
  "action.postgres.upsert-row",
  "action.gmail.read",
  "action.gmail.get-message",
  "action.gmail.send",
  "action.gmail.reply",
  "action.gmail.create-draft",
  "action.gmail.update-draft",
  "action.gmail.modify-label",
  "action.google-calendar.list-events",
  "action.google-calendar.create-event",
  "action.google-calendar.get-event",
  "action.google-calendar.update-event",
  "action.google-calendar.delete-event",
  "action.google-calendar.availability",
  "action.google-chat.oauth",
  "action.google-chat.reply",
  "action.google-chat.edit-message",
  "approval.request",
  "action.github",
  "action.github.add-label",
  "action.github.add-comment",
  "action.github.merge-pull-request",
  "action.github.list-issues",
  "action.github.get-issue",
  "action.github.update-issue",
  "action.github.list-pull-requests",
  "action.github.get-pull-request",
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
  /** Redacted sample output, used only by mock executions. */
  pinData?: Record<string, unknown>;
};

export const workflowEdgeKinds = ["success", "error", "true", "false", "case", "default"] as const;

export type WorkflowEdgeKind = (typeof workflowEdgeKinds)[number];

/** Shared branch contract for graph validation, editor handles, and runtime. */
export function workflowNodeOutputKinds(type: WorkflowNodeType): WorkflowEdgeKind[] {
  if (type === "action.merge") return ["success"];
  if (type === "condition.if") return ["true", "false"];
  if (type === "condition.switch") return ["case", "default"];
  return type.startsWith("trigger.") ? ["success"] : ["success", "error"];
}

export { mergeInputs, mergeInputIssues } from "./merge-inputs";

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  kind: WorkflowEdgeKind;
  caseValue?: string;
  targetHandle?: "input1" | "input2";
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

export const dataTransformNodeTypes = ["action.aggregate", "action.split-out", "action.sort", "action.limit"] as const;
export type DataTransformNodeType = (typeof dataTransformNodeTypes)[number];
export function isDataTransformNode(type: string): type is DataTransformNodeType { return (dataTransformNodeTypes as readonly string[]).includes(type); }
