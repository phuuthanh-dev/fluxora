import type { Edge, Node } from "@xyflow/react";
import type { WorkflowEdgeKind, WorkflowNodeCategory, WorkflowNodeType } from "@workflow/contracts";
import type { CredentialProvider } from "../credentials/credential-types";
import type { NodeIconName } from "./node-icon";

export type WorkflowNodeData = {
  nodeType: WorkflowNodeType;
  label: string;
  description: string;
  category: WorkflowNodeCategory;
  config: Record<string, unknown>;
  available: boolean;
};

export type WorkflowCanvasNode = Node<WorkflowNodeData, "workflowNode">;
export type WorkflowCanvasEdge = Edge & {
  kind: WorkflowEdgeKind;
  caseValue?: string;
};

export type NodeLibraryGroup =
  | "start"
  | "logic"
  | "communication"
  | "google-workspace"
  | "developer-data"
  | "ai"
  | "social"
  | "approval";

export type AppCategory = "communication" | "productivity" | "developer-devops" | "data" | "ai" | "social";
export type OperationKind = "trigger" | "action" | "search" | "utility";
export type NodeLibraryFilter = "all" | "core" | AppCategory | "roadmap";

export type AppDefinition = {
  id: string;
  label: string;
  description: string;
  icon: NodeIconName;
  category: AppCategory;
  aliases?: string[];
};

export type NodeDefinition = {
  type: WorkflowNodeType;
  label: string;
  description: string;
  category: WorkflowNodeCategory;
  libraryGroup: NodeLibraryGroup;
  appId?: string;
  operationId: string;
  operationLabel: string;
  operationKind: OperationKind;
  aliases?: string[];
  icon: NodeIconName;
  available: boolean;
  defaultConfig: Record<string, unknown>;
  configurationFields?: NodeConfigurationField[];
};

export type NodeSelectOption = { value: string; label: string };
export type NodeFieldVisibility = { visibleWhen?: { key: string; equals: string | number | boolean } };

export type NodeResource = "github-repository" | "google-file" | "google-spreadsheet";

/**
 * Declarative fields that the inspector can render without growing another
 * provider-specific branch. Complex controls (such as Telegram destinations)
 * remain intentionally bespoke in the editor.
 */
export type NodeConfigurationField =
  | ({ kind: "credential"; key: string; label: string; providers: CredentialProvider[]; optional?: boolean } & NodeFieldVisibility)
  | ({ kind: "text" | "textarea"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "number"; key: string; label: string; fallbackValue: number } & NodeFieldVisibility)
  | ({ kind: "select"; key: string; label: string; options: NodeSelectOption[] } & NodeFieldVisibility)
  | ({ kind: "key-value"; key: string; label: string; keyPlaceholder?: string; valuePlaceholder?: string } & NodeFieldVisibility)
  | ({ kind: "table"; key: string; label: string } & NodeFieldVisibility)
  | ({ kind: "resource"; key: string; label: string; resource: NodeResource; credentialKey: string; placeholder?: string } & NodeFieldVisibility);

export const categoryOrder: WorkflowNodeCategory[] = ["trigger", "condition", "action", "approval"];

export const categoryLabels: Record<WorkflowNodeCategory, string> = {
  trigger: "Trigger",
  condition: "Condition",
  action: "Action",
  approval: "Approval",
};

export const nodeLibraryFilters: Array<{ id: NodeLibraryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "core", label: "Core" },
  { id: "communication", label: "Communication" },
  { id: "productivity", label: "Productivity" },
  { id: "developer-devops", label: "DevOps" },
  { id: "data", label: "Data" },
  { id: "ai", label: "AI" },
  { id: "social", label: "Social" },
  { id: "roadmap", label: "Roadmap" },
];

export const appCatalog: AppDefinition[] = [
  { id: "steam", label: "Steam", description: "Read public gaming profile and library data.", icon: "steam", category: "data", aliases: ["gaming", "games"] },
  { id: "google-chat", label: "Google Chat", description: "Send messages to Google Chat spaces.", icon: "google-chat", category: "communication", aliases: ["chat", "notification"] },
  { id: "discord", label: "Discord", description: "Send messages through Discord webhooks.", icon: "discord", category: "communication", aliases: ["notification", "webhook"] },
  { id: "telegram", label: "Telegram", description: "Send messages with the Telegram Bot API.", icon: "telegram", category: "communication", aliases: ["bot", "notification"] },
  { id: "google-drive", label: "Google Drive", description: "Search, read, upload, and download files.", icon: "google-drive", category: "productivity", aliases: ["files", "workspace"] },
  { id: "google-sheets", label: "Google Sheets", description: "Read and write spreadsheet data.", icon: "google-sheets", category: "productivity", aliases: ["spreadsheet", "rows", "workspace"] },
  { id: "http", label: "HTTP", description: "Call REST APIs with optional authentication.", icon: "http", category: "developer-devops", aliases: ["api", "request", "webhook"] },
  { id: "email", label: "Email", description: "Send email notifications.", icon: "email", category: "communication", aliases: ["mail", "smtp"] },
  { id: "openai", label: "OpenAI", description: "Generate and transform content with AI.", icon: "openai", category: "ai", aliases: ["gpt", "llm"] },
  { id: "gemini", label: "Gemini", description: "Generate content with Google Gemini.", icon: "gemini", category: "ai", aliases: ["google ai", "llm"] },
  { id: "mongodb", label: "MongoDB", description: "Read and write document data.", icon: "mongodb", category: "data", aliases: ["database", "documents"] },
  { id: "github", label: "GitHub", description: "Automate repositories, issues, and pull requests.", icon: "github", category: "developer-devops", aliases: ["git", "pull request", "issues"] },
  { id: "facebook-meta", label: "Facebook Meta", description: "Publish and manage Facebook content.", icon: "facebook", category: "social", aliases: ["meta"] },
  { id: "instagram", label: "Instagram", description: "Publish and manage Instagram content.", icon: "instagram", category: "social", aliases: ["meta"] },
];

export const nodeLibraryGroups: Array<{ id: NodeLibraryGroup; label: string; description: string }> = [
  { id: "start", label: "Start workflow", description: "Choose how this workflow begins" },
  { id: "logic", label: "Flow control", description: "Branch and route incoming data" },
  { id: "communication", label: "Communication", description: "Send messages and notifications" },
  { id: "google-workspace", label: "Google Workspace", description: "Work with Google files, sheets, and chat" },
  { id: "developer-data", label: "Developer & data", description: "Connect APIs, services, and databases" },
  { id: "ai", label: "AI", description: "Generate and transform content with AI" },
  { id: "social", label: "Social", description: "Automate social channels" },
  { id: "approval", label: "Human in the loop", description: "Pause and wait for a decision" },
];

export function outputKindsForNodeType(nodeType: WorkflowNodeType): WorkflowEdgeKind[] {
  if (nodeType === "condition.if") return ["true", "false"];
  if (nodeType === "condition.switch") return ["case", "default"];
  if (nodeType.startsWith("trigger.")) return ["success"];
  return ["success", "error"];
}

export function edgeKindFromHandle(handle: string | null | undefined): WorkflowEdgeKind | null {
  return handle && ["success", "error", "true", "false", "case", "default"].includes(handle)
    ? handle as WorkflowEdgeKind
    : null;
}

export const nodeCatalog: NodeDefinition[] = [
  {
    type: "trigger.manual",
    label: "Manual trigger",
    description: "Start a test run from the editor.",
    category: "trigger",
    libraryGroup: "start",
    operationId: "manual-trigger",
    operationLabel: "Manual trigger",
    operationKind: "trigger",
    icon: "manual",
    available: true,
    defaultConfig: { testData: {} },
  },
  {
    type: "trigger.cron",
    label: "Schedule",
    description: "Start on a cron schedule.",
    category: "trigger",
    libraryGroup: "start",
    operationId: "schedule",
    operationLabel: "Schedule",
    operationKind: "trigger",
    icon: "schedule",
    available: true,
    defaultConfig: { expression: "0 8 * * *", timezone: "Asia/Ho_Chi_Minh" },
  },
  {
    type: "trigger.webhook",
    label: "Webhook",
    description: "Receive an inbound HTTP event.",
    category: "trigger",
    libraryGroup: "start",
    operationId: "webhook",
    operationLabel: "Webhook",
    operationKind: "trigger",
    icon: "webhook",
    available: true,
    defaultConfig: { path: "steam-daily-report", secretRequired: true },
  },
  {
    type: "trigger.github.issue-opened",
    label: "GitHub issue opened",
    description: "Start when GitHub sends an issues.opened webhook event.",
    category: "trigger",
    libraryGroup: "start",
    appId: "github",
    operationId: "issue-opened",
    operationLabel: "Issue opened",
    operationKind: "trigger",
    icon: "github",
    available: true,
    defaultConfig: { path: "github-issue-opened", credentialId: "", event: "issues", action: "opened" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "GitHub connector credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository filter (optional)", resource: "github-repository", credentialKey: "credentialId", placeholder: "Filter by repository" },
    ],
  },
  {
    type: "trigger.github.pull-request-opened",
    label: "GitHub pull request opened",
    description: "Start when GitHub sends a pull_request.opened webhook event.",
    category: "trigger",
    libraryGroup: "start",
    appId: "github",
    operationId: "pull-request-opened",
    operationLabel: "Pull request opened",
    operationKind: "trigger",
    icon: "github",
    available: true,
    defaultConfig: { path: "github-pull-request-opened", credentialId: "", event: "pull_request", action: "opened" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "GitHub connector credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository filter (optional)", resource: "github-repository", credentialKey: "credentialId", placeholder: "Filter by repository" },
    ],
  },
  {
    type: "trigger.github.push",
    label: "GitHub push",
    description: "Start when GitHub sends a push webhook event.",
    category: "trigger",
    libraryGroup: "start",
    appId: "github",
    operationId: "push",
    operationLabel: "Push",
    operationKind: "trigger",
    icon: "github",
    available: true,
    defaultConfig: { path: "github-push", credentialId: "", event: "push", action: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "GitHub connector credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository filter (optional)", resource: "github-repository", credentialKey: "credentialId", placeholder: "Filter by repository" },
    ],
  },
  {
    type: "trigger.github.workflow-run-completed",
    label: "GitHub workflow run completed",
    description: "Start when GitHub sends a completed workflow_run webhook event.",
    category: "trigger",
    libraryGroup: "start",
    appId: "github",
    operationId: "workflow-run-completed",
    operationLabel: "Workflow run completed",
    operationKind: "trigger",
    icon: "github",
    available: true,
    defaultConfig: { path: "github-workflow-run-completed", credentialId: "", event: "workflow_run", action: "completed" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "GitHub connector credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository filter (optional)", resource: "github-repository", credentialKey: "credentialId", placeholder: "Filter by repository" },
    ],
  },
  {
    type: "condition.if",
    label: "If / else",
    description: "Route using a condition.",
    category: "condition",
    libraryGroup: "logic",
    operationId: "if-else",
    operationLabel: "If / else",
    operationKind: "utility",
    icon: "if",
    available: true,
    defaultConfig: { left: "", operator: "equals", right: "" },
  },
  {
    type: "condition.switch",
    label: "Switch",
    description: "Route to multiple cases.",
    category: "condition",
    libraryGroup: "logic",
    operationId: "switch",
    operationLabel: "Switch",
    operationKind: "utility",
    icon: "switch",
    available: true,
    defaultConfig: { value: "", cases: [{ value: "case-a" }] },
  },
  {
    type: "action.steam.account-snapshot",
    label: "Steam account snapshot",
    description: "Read public Steam account data.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "steam",
    operationId: "account-snapshot",
    operationLabel: "Get account snapshot",
    operationKind: "action",
    icon: "steam",
    available: true,
    defaultConfig: { credentialId: "", steamId: "", includeOwnedGames: true, includeRecentGames: true, achievementAppId: "" },
  },
  {
    type: "action.google-chat.webhook",
    label: "Google Chat message",
    description: "Send a message through an incoming webhook.",
    category: "action",
    libraryGroup: "communication",
    appId: "google-chat",
    operationId: "send-webhook-message",
    operationLabel: "Send webhook message",
    operationKind: "action",
    icon: "google-chat",
    available: true,
    defaultConfig: { credentialId: "", message: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "Google Chat credential", providers: ["GOOGLE_CHAT_WEBHOOK"] },
      { kind: "textarea", key: "message", label: "Message template" },
    ],
  },
  {
    type: "action.discord.webhook",
    label: "Discord webhook",
    description: "Post a message to a Discord channel via incoming webhook.",
    category: "action",
    libraryGroup: "communication",
    appId: "discord",
    operationId: "send-webhook-message",
    operationLabel: "Send webhook message",
    operationKind: "action",
    icon: "discord",
    available: true,
    defaultConfig: { credentialId: "", content: "", username: "", avatarUrl: "", embeds: "", allowedMentions: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "Discord credential", providers: ["DISCORD_WEBHOOK"] },
      { kind: "textarea", key: "content", label: "Message content" },
      { kind: "text", key: "username", label: "Username (optional)" },
      { kind: "text", key: "avatarUrl", label: "Avatar URL (optional)" },
      { kind: "textarea", key: "embeds", label: "Embeds JSON (optional)" },
      { kind: "textarea", key: "allowedMentions", label: "Allowed mentions JSON (optional)" },
    ],
  },
  {
    type: "action.telegram.message",
    label: "Telegram message",
    description: "Send a message via Telegram Bot API.",
    category: "action",
    libraryGroup: "communication",
    appId: "telegram",
    operationId: "send-message",
    operationLabel: "Send message",
    operationKind: "action",
    icon: "telegram",
    available: true,
    defaultConfig: { credentialId: "", destinationType: "dm", chatId: "", messageThreadId: "", text: "", parseMode: "Markdown" },
  },
  {
    type: "action.google-drive",
    label: "Google Drive",
    description: "Search, read, or upload a file.",
    category: "action",
    libraryGroup: "google-workspace",
    appId: "google-drive",
    operationId: "manage-files",
    operationLabel: "Manage files",
    operationKind: "action",
    icon: "google-drive",
    available: true,
    defaultConfig: { credentialId: "", operation: "search", query: "", fileId: "", name: "daily-report.txt", text: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "Google credential", providers: ["GOOGLE"] },
      { kind: "select", key: "operation", label: "Operation", options: [
        { value: "list", label: "List files" },
        { value: "search", label: "Search files" },
        { value: "uploadText", label: "Upload text file" },
        { value: "downloadText", label: "Download text file" },
      ] },
      { kind: "text", key: "name", label: "File name", visibleWhen: { key: "operation", equals: "uploadText" } },
      { kind: "textarea", key: "text", label: "Text content", visibleWhen: { key: "operation", equals: "uploadText" } },
    ],
  },
  {
    type: "action.google-sheets",
    label: "Google Sheets",
    description: "Read or write spreadsheet data.",
    category: "action",
    libraryGroup: "google-workspace",
    appId: "google-sheets",
    operationId: "read-write-rows",
    operationLabel: "Read or write rows",
    operationKind: "action",
    icon: "google-sheets",
    available: true,
    defaultConfig: { credentialId: "", operation: "append", spreadsheetId: "", range: "Sheet1!A1", values: [["", ""]] },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "Google credential", providers: ["GOOGLE"] },
      { kind: "resource", key: "spreadsheetId", label: "Spreadsheet", resource: "google-spreadsheet", credentialKey: "credentialId", placeholder: "Search loaded spreadsheets" },
      { kind: "select", key: "operation", label: "Operation", options: [
        { value: "read", label: "Read rows" },
        { value: "append", label: "Append rows" },
        { value: "update", label: "Update rows" },
      ] },
      { kind: "text", key: "range", label: "Range" },
      { kind: "table", key: "values", label: "Values" },
    ],
  },
  {
    type: "action.http-request",
    label: "HTTP request",
    description: "Call any REST API.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "http",
    operationId: "request",
    operationLabel: "Make API request",
    operationKind: "action",
    icon: "http",
    available: true,
    defaultConfig: { credentialId: "", method: "GET", url: "", headers: {}, body: "", timeoutMs: 15_000 },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "HTTP credential (optional)", providers: ["HTTP"], optional: true },
      { kind: "select", key: "method", label: "Method", options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
        { value: "PUT", label: "PUT" },
        { value: "PATCH", label: "PATCH" },
        { value: "DELETE", label: "DELETE" },
      ] },
      { kind: "text", key: "url", label: "URL" },
      { kind: "key-value", key: "headers", label: "Headers (optional)", keyPlaceholder: "Header name", valuePlaceholder: "Header value" },
      { kind: "textarea", key: "body", label: "Request body" },
      { kind: "number", key: "timeoutMs", label: "Timeout (ms)", fallbackValue: 15_000 },
    ],
  },
  {
    type: "approval.request",
    label: "Approval",
    description: "Pause until a person approves or rejects.",
    category: "approval",
    libraryGroup: "approval",
    operationId: "approval",
    operationLabel: "Approval",
    operationKind: "utility",
    icon: "approval",
    available: true,
    defaultConfig: { message: "", expiresInHours: 24, notificationProvider: "google_chat", notificationCredentialId: "" },
  },
  {
    type: "action.email",
    label: "Email (SMTP)",
    description: "Send an email through an encrypted SMTP connection.",
    category: "action",
    libraryGroup: "communication",
    appId: "email",
    operationId: "send-email",
    operationLabel: "Send email",
    operationKind: "action",
    icon: "email",
    available: true,
    defaultConfig: { credentialId: "", to: "", cc: "", bcc: "", subject: "", body: "", bodyFormat: "text", replyTo: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "SMTP credential", providers: ["SMTP"] },
      { kind: "text", key: "to", label: "To (comma-separated)" },
      { kind: "text", key: "cc", label: "Cc (optional, comma-separated)" },
      { kind: "text", key: "bcc", label: "Bcc (optional, comma-separated)" },
      { kind: "text", key: "subject", label: "Subject" },
      { kind: "select", key: "bodyFormat", label: "Body format", options: [
        { value: "text", label: "Plain text" },
        { value: "html", label: "HTML" },
      ] },
      { kind: "textarea", key: "body", label: "Message" },
      { kind: "text", key: "replyTo", label: "Reply-to (optional)" },
    ],
  },
  {
    type: "action.google-chat.oauth",
    label: "Google Chat OAuth",
    description: "Send a Google Chat message with OAuth.",
    category: "action",
    libraryGroup: "google-workspace",
    appId: "google-chat",
    operationId: "send-oauth-message",
    operationLabel: "Send OAuth message",
    operationKind: "action",
    icon: "google-chat",
    available: false,
    defaultConfig: { credentialId: "", space: "", message: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "Google credential", providers: ["GOOGLE"] },
      { kind: "text", key: "space", label: "Space" },
      { kind: "textarea", key: "message", label: "Message template" },
    ],
  },
  {
    type: "action.openai",
    label: "OpenAI",
    description: "Generate text with an OpenAI model.",
    category: "action",
    libraryGroup: "ai",
    appId: "openai",
    operationId: "generate-text",
    operationLabel: "Generate text",
    operationKind: "action",
    icon: "openai",
    available: false,
    defaultConfig: { credentialId: "", model: "gpt-4.1-mini", prompt: "" },
    configurationFields: [
      { kind: "text", key: "model", label: "Model" },
      { kind: "textarea", key: "prompt", label: "Prompt" },
    ],
  },
  {
    type: "action.gemini",
    label: "Gemini",
    description: "Generate text with a Gemini model.",
    category: "action",
    libraryGroup: "ai",
    appId: "gemini",
    operationId: "generate-text",
    operationLabel: "Generate text",
    operationKind: "action",
    icon: "gemini",
    available: false,
    defaultConfig: { credentialId: "", model: "gemini-2.5-flash", prompt: "" },
    configurationFields: [
      { kind: "text", key: "model", label: "Model" },
      { kind: "textarea", key: "prompt", label: "Prompt" },
    ],
  },
  {
    type: "action.mongodb",
    label: "MongoDB",
    description: "Read or write MongoDB documents.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "mongodb",
    operationId: "query-documents",
    operationLabel: "Query documents",
    operationKind: "action",
    icon: "mongodb",
    available: false,
    defaultConfig: { credentialId: "", database: "", collection: "", operation: "find" },
    configurationFields: [
      { kind: "text", key: "database", label: "Database" },
      { kind: "text", key: "collection", label: "Collection" },
      { kind: "text", key: "operation", label: "Operation" },
    ],
  },
  {
    type: "action.github",
    label: "GitHub issue",
    description: "Create an issue once per idempotency key in a GitHub repository.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "github",
    operationId: "create-issue",
    operationLabel: "Create issue",
    operationKind: "action",
    icon: "github",
    available: true,
    defaultConfig: { credentialId: "", repository: "", title: "", body: "", labels: "", idempotencyKey: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
      { kind: "text", key: "title", label: "Issue title" },
      { kind: "textarea", key: "body", label: "Issue body" },
      { kind: "text", key: "labels", label: "Labels (comma-separated, optional)" },
      { kind: "text", key: "idempotencyKey", label: "Idempotency key (optional)" },
    ],
  },
  {
    type: "action.github.add-label",
    label: "GitHub add label",
    description: "Add one label to an existing GitHub issue.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "github",
    operationId: "add-label",
    operationLabel: "Add label",
    operationKind: "action",
    icon: "github",
    available: true,
    defaultConfig: { credentialId: "", repository: "", issueNumber: "", label: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
      { kind: "text", key: "issueNumber", label: "Issue number" },
      { kind: "text", key: "label", label: "Label" },
    ],
  },
  {
    type: "action.github.add-comment",
    label: "GitHub add comment",
    description: "Post a comment on an existing GitHub issue.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "github",
    operationId: "add-comment",
    operationLabel: "Add comment",
    operationKind: "action",
    icon: "github",
    available: true,
    defaultConfig: { credentialId: "", repository: "", issueNumber: "", body: "" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
      { kind: "text", key: "issueNumber", label: "Issue number" },
      { kind: "textarea", key: "body", label: "Comment" },
    ],
  },
  {
    type: "action.github.merge-pull-request",
    label: "GitHub merge pull request",
    description: "Merge an existing GitHub pull request.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "github",
    operationId: "merge-pull-request",
    operationLabel: "Merge pull request",
    operationKind: "action",
    icon: "github",
    available: true,
    defaultConfig: { credentialId: "", repository: "", pullRequestNumber: "", mergeMethod: "merge" },
    configurationFields: [
      { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] },
      { kind: "resource", key: "repository", label: "Repository", resource: "github-repository", credentialKey: "credentialId", placeholder: "Search repositories" },
      { kind: "text", key: "pullRequestNumber", label: "Pull request number" },
      { kind: "select", key: "mergeMethod", label: "Merge method", options: [
        { value: "merge", label: "Merge commit" },
        { value: "squash", label: "Squash and merge" },
        { value: "rebase", label: "Rebase and merge" },
      ] },
    ],
  },
  {
    type: "action.facebook-meta",
    label: "Facebook Meta",
    description: "Publish and manage Facebook content.",
    category: "action",
    libraryGroup: "social",
    appId: "facebook-meta",
    operationId: "manage-content",
    operationLabel: "Manage content",
    operationKind: "action",
    icon: "facebook",
    available: false,
    defaultConfig: { credentialId: "", operation: "" },
  },
  {
    type: "action.instagram",
    label: "Instagram",
    description: "Publish and manage Instagram content.",
    category: "action",
    libraryGroup: "social",
    appId: "instagram",
    operationId: "manage-content",
    operationLabel: "Manage content",
    operationKind: "action",
    icon: "instagram",
    available: false,
    defaultConfig: { credentialId: "", operation: "" },
  },
];

export function matchesNodeSearch(node: NodeDefinition, query: string) {
  const normalized = query.trim().toLowerCase();
  const group = nodeLibraryGroups.find((candidate) => candidate.id === node.libraryGroup);
  const app = node.appId ? getAppDefinition(node.appId) : undefined;
  return !normalized || [node.label, node.operationLabel, node.description, node.category, node.type, ...(node.aliases ?? []), app?.label ?? "", app?.description ?? "", app?.category ?? "", ...(app?.aliases ?? []), group?.label ?? "", group?.description ?? ""]
    .some((value) => value.toLowerCase().includes(normalized));
}

export function matchesNodeLibraryFilter(node: NodeDefinition, filter: NodeLibraryFilter, query = "") {
  if (!matchesNodeSearch(node, query)) return false;
  if (filter === "roadmap") return !node.available;
  if (!query.trim() && !node.available) return false;
  if (filter === "all") return true;
  if (filter === "core") return !node.appId;
  const app = node.appId ? getAppDefinition(node.appId) : undefined;
  return app?.category === filter;
}

export function getAppDefinition(appId: string) {
  return appCatalog.find((app) => app.id === appId);
}

export function operationsForApp(appId: string) {
  return nodeCatalog.filter((definition) => definition.appId === appId);
}

export function coreNodeDefinitions() {
  return nodeCatalog.filter((definition) => !definition.appId);
}

export function groupNodeLibrary(nodes: NodeDefinition[]) {
  return nodeLibraryGroups.flatMap((group) => {
    const definitions = nodes.filter((node) => node.libraryGroup === group.id);
    return definitions.length ? [{ ...group, nodes: definitions }] : [];
  });
}

export function getNodeDefinition(type: string) {
  return nodeCatalog.find((definition) => definition.type === type);
}

export function availableCatalogTypes() {
  return nodeCatalog.filter((definition) => definition.available).map((definition) => definition.type);
}

export function createNodeData(definition: NodeDefinition): WorkflowNodeData {
  return {
    nodeType: definition.type,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    available: definition.available,
    config: structuredClone(definition.defaultConfig),
  };
}

export const initialNodes: WorkflowCanvasNode[] = [
  {
    id: "schedule",
    type: "workflowNode",
    position: { x: 70, y: 210 },
    data: { ...createNodeData(getNodeDefinition("trigger.cron")!), label: "Daily schedule" },
  },
  {
    id: "steam",
    type: "workflowNode",
    position: { x: 385, y: 210 },
    data: createNodeData(getNodeDefinition("action.steam.account-snapshot")!),
  },
  {
    id: "chat",
    type: "workflowNode",
    position: { x: 700, y: 210 },
    data: createNodeData(getNodeDefinition("action.google-chat.webhook")!),
  },
];

export const initialEdges: WorkflowCanvasEdge[] = [
  { id: "schedule-steam", source: "schedule", target: "steam", sourceHandle: "success", animated: true, kind: "success" },
  { id: "steam-chat", source: "steam", target: "chat", sourceHandle: "success", animated: true, kind: "success" },
];
