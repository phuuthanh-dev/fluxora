import type { Edge, Node } from "@xyflow/react";
import { getSharedNodeConfigurationFields, riotLolActions, riotTftActions, workflowNodeOutputKinds, type WorkflowEdgeKind, type WorkflowNodeCategory, type WorkflowNodeType } from "@workflow/contracts";
import type { NodeConfigurationField } from "@workflow/contracts";
import type { NodeIconName } from "./node-icon";
export type { NodeConfigurationField, NodeFieldVisibility, NodeResource, NodeSelectOption } from "@workflow/contracts";

export type WorkflowNodeData = {
  nodeType: WorkflowNodeType;
  label: string;
  description: string;
  category: WorkflowNodeCategory;
  config: Record<string, unknown>;
  available: boolean;
  /** Transient display state from the selected execution; never stored in the workflow. */
  executionStatus?: "RUNNING" | "SUCCEEDED" | "FAILED" | "WAITING" | "SKIPPED";
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
  | "productivity"
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
  /** Optional presentation identity when several library actions share a runtime type. */
  libraryId?: string;
  aliases?: string[];
  icon: NodeIconName;
  available: boolean;
  defaultConfig: Record<string, unknown>;
  configurationFields?: NodeConfigurationField[];
};

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
  { id: "jira", label: "Jira", description: "Create and manage issues in your Jira Cloud site.", icon: "jira", category: "productivity", aliases: ["atlassian", "issues", "project"] },
  { id: "gitlab", label: "GitLab", description: "Manage issues and react to pipelines and merge requests on gitlab.com.", icon: "gitlab", category: "developer-devops" },
  { id: "slack", label: "Slack", description: "Receive channel events and send Slack messages.", icon: "slack", category: "communication", aliases: ["chat", "notification"] },
  { id: "steam", label: "Steam", description: "Read public gaming profile and library data.", icon: "steam", category: "data", aliases: ["gaming", "games"] },
  { id: "riot-lol", label: "League of Legends", description: "Read League account and match data with your Riot API key.", icon: "riot-lol", category: "data", aliases: ["riot", "lol", "gaming"] },
  { id: "riot-tft", label: "Teamfight Tactics", description: "Read TFT post-game data using an eligible Riot API key.", icon: "riot-tft", category: "data", aliases: ["riot", "tft", "gaming"] },
  { id: "riot-valorant", label: "VALORANT", description: "Player data requires approved Riot access and player opt-in.", icon: "riot-valorant", category: "data", aliases: ["riot", "valorant"] },
  { id: "riot-lor", label: "Legends of Runeterra", description: "Player data requires approved Riot access and player opt-in.", icon: "riot-lor", category: "data", aliases: ["riot", "lor", "runeterra"] },
  { id: "riot-2xko", label: "2XKO", description: "Player data requires approved Riot access and player opt-in.", icon: "riot-2xko", category: "data", aliases: ["riot", "2xko"] },
  { id: "google-chat", label: "Google Chat", description: "Send messages to Google Chat spaces.", icon: "google-chat", category: "communication", aliases: ["chat", "notification"] },
  { id: "discord", label: "Discord", description: "Send messages through Discord webhooks.", icon: "discord", category: "communication", aliases: ["notification", "webhook"] },
  { id: "telegram", label: "Telegram", description: "Send messages with the Telegram Bot API.", icon: "telegram", category: "communication", aliases: ["bot", "notification"] },
  { id: "google-drive", label: "Google Drive", description: "Search, read, upload, and download files.", icon: "google-drive", category: "productivity", aliases: ["files", "workspace"] },
  { id: "google-sheets", label: "Google Sheets", description: "Read and write spreadsheet data.", icon: "google-sheets", category: "productivity", aliases: ["spreadsheet", "rows", "workspace"] },
  { id: "google-calendar", label: "Google Calendar", description: "Find and manage calendar events.", icon: "google-calendar", category: "productivity", aliases: ["calendar", "events", "workspace"] },
  { id: "http", label: "HTTP", description: "Call REST APIs with optional authentication.", icon: "http", category: "developer-devops", aliases: ["api", "request", "webhook"] },
  { id: "email", label: "Email", description: "Send email notifications.", icon: "email", category: "communication", aliases: ["mail", "smtp"] },
  { id: "gmail", label: "Gmail", description: "Start workflows from new mail and read messages.", icon: "gmail", category: "communication", aliases: ["mail", "google", "inbox"] },
  { id: "openai", label: "OpenAI", description: "Generate and transform content with AI.", icon: "openai", category: "ai", aliases: ["gpt", "llm"] },
  { id: "gemini", label: "Gemini", description: "Generate content with Google Gemini.", icon: "gemini", category: "ai", aliases: ["google ai", "llm"] },
  { id: "mongodb", label: "MongoDB", description: "Find and insert documents in a database.", icon: "mongodb", category: "data", aliases: ["database", "documents"] },
  { id: "notion", label: "Notion", description: "Find pages shared with your integration.", icon: "notion", category: "productivity", aliases: ["pages", "notes"] },
  { id: "trello", label: "Trello", description: "Organize work with boards, lists, and cards.", icon: "trello", category: "productivity", aliases: ["kanban", "cards", "boards"] },
  { id: "sentry", label: "Sentry", description: "Find issues in your monitored projects.", icon: "sentry", category: "developer-devops", aliases: ["errors", "monitoring", "issues"] },
  { id: "vercel", label: "Vercel", description: "Inspect project deployments.", icon: "vercel", category: "developer-devops", aliases: ["deployment", "hosting", "projects"] },
  { id: "supabase", label: "Supabase", description: "Read or insert rows in a Supabase project.", icon: "supabase", category: "data", aliases: ["database", "postgres", "tables"] },
  { id: "uptime-kuma", label: "Uptime Kuma", description: "Start a workflow from a monitor alert.", icon: "uptime-kuma", category: "developer-devops", aliases: ["uptime", "monitoring", "alert"] },
  { id: "reddit", label: "Reddit", description: "Read posts from a public community.", icon: "reddit", category: "social", aliases: ["subreddit", "posts", "community"] },
  { id: "rss", label: "RSS", description: "Read items from a public RSS or Atom feed.", icon: "rss", category: "data", aliases: ["feed", "atom", "news"] },
  { id: "postgres", label: "PostgreSQL", description: "Read rows from a PostgreSQL database.", icon: "postgres", category: "data", aliases: ["sql", "database"] },
  { id: "github", label: "GitHub", description: "Automate repositories, issues, and pull requests.", icon: "github", category: "developer-devops", aliases: ["git", "pull request", "issues"] },
  { id: "facebook-meta", label: "Facebook Meta", description: "Publish and manage Facebook content.", icon: "facebook", category: "social", aliases: ["meta"] },
  { id: "instagram", label: "Instagram", description: "Publish and manage Instagram content.", icon: "instagram", category: "social", aliases: ["meta"] },
];

export const nodeLibraryGroups: Array<{ id: NodeLibraryGroup; label: string; description: string }> = [
  { id: "start", label: "Start workflow", description: "Choose how this workflow begins" },
  { id: "logic", label: "Flow control", description: "Branch and route incoming data" },
  { id: "communication", label: "Communication", description: "Send messages and notifications" },
  { id: "google-workspace", label: "Google Workspace", description: "Work with Google files, sheets, and chat" },
  { id: "productivity", label: "Productivity", description: "Find and organize your work" },
  { id: "developer-data", label: "Developer & data", description: "Connect APIs, services, and databases" },
  { id: "ai", label: "AI", description: "Generate and transform content with AI" },
  { id: "social", label: "Social", description: "Automate social channels" },
  { id: "approval", label: "Human in the loop", description: "Pause and wait for a decision" },
];

export const outputKindsForNodeType = workflowNodeOutputKinds;

export function edgeKindFromHandle(handle: string | null | undefined): WorkflowEdgeKind | null {
  return handle && ["success", "error", "true", "false", "case", "default"].includes(handle)
    ? handle as WorkflowEdgeKind
    : null;
}

export const nodeCatalog: NodeDefinition[] = [
  {
    type: "action.riot-tft", label: "Teamfight Tactics", description: "Read TFT post-game data from Riot.",
    category: "action", libraryGroup: "developer-data", appId: "riot-tft", operationId: "api", operationLabel: "Read TFT data", operationKind: "search", icon: "riot-tft", available: true,
    defaultConfig: { credentialId: "", operation: "accountByRiotId", platform: "vn2", gameName: "", tagLine: "", puuid: "", matchId: "", start: 0, count: 20 },
    configurationFields: getSharedNodeConfigurationFields("action.riot-tft"),
  },
  ...([ ["action.riot-valorant", "riot-valorant", "VALORANT"], ["action.riot-lor", "riot-lor", "Legends of Runeterra"], ["action.riot-2xko", "riot-2xko", "2XKO"] ] as const).map(([type, appId, label]) => ({
    type, appId, label, description: "Requires Riot production approval and player opt-in through Riot Sign On. Not available yet.",
    category: "action" as const, libraryGroup: "developer-data" as const, operationId: "player-data", operationLabel: "Player data (approval required)", operationKind: "search" as const, icon: appId, available: false, defaultConfig: {},
  })),
  {
    type: "action.riot-lol", label: "League of Legends", description: "Read League of Legends data from Riot.",
    category: "action", libraryGroup: "developer-data", appId: "riot-lol", operationId: "api", operationLabel: "Read League data", operationKind: "search", icon: "riot-lol", available: true,
    defaultConfig: { credentialId: "", operation: "accountByRiotId", platform: "vn2", gameName: "", tagLine: "", puuid: "", matchId: "", start: 0, count: 20, matchFilter: "all", startTime: "", endTime: "" },
    configurationFields: getSharedNodeConfigurationFields("action.riot-lol"),
  },
  {
    type: "trigger.sentry.issue-created", label: "Sentry issue created", description: "Start when a Sentry custom integration reports a new issue.",
    category: "trigger", libraryGroup: "developer-data", appId: "sentry", operationId: "issue-created", operationLabel: "Issue created", operationKind: "trigger", icon: "sentry", available: true,
    defaultConfig: { credentialId: "", organization: "", project: "", installationId: "" },
    configurationFields: getSharedNodeConfigurationFields("trigger.sentry.issue-created"),
  },
  {
    type: "trigger.trello.board-action", label: "Trello board event", description: "Start when a watched Trello board changes.",
    category: "trigger", libraryGroup: "productivity", appId: "trello", operationId: "board-event", operationLabel: "Board event", operationKind: "trigger", icon: "trello", available: true,
    defaultConfig: { credentialId: "", boardId: "", action: "all" },
    configurationFields: getSharedNodeConfigurationFields("trigger.trello.board-action"),
  },
  {
    type: "trigger.slack.event", label: "Slack event", description: "Start on a new channel message or a mention of the app.", category: "trigger",
    libraryGroup: "communication", appId: "slack", operationId: "event", operationLabel: "On channel event", operationKind: "trigger",
    icon: "slack", available: true, defaultConfig: { credentialId: "", event: "app_mention", channel: "" }, configurationFields: getSharedNodeConfigurationFields("trigger.slack.event"),
  },
  {
    type: "trigger.vercel.deployment", label: "Vercel deployment event", description: "Start when a configured Vercel account webhook reports a deployment event.",
    category: "trigger", libraryGroup: "developer-data", appId: "vercel", operationId: "deployment-event", operationLabel: "Deployment event", operationKind: "trigger", icon: "vercel", available: true,
    defaultConfig: { credentialId: "", team: "personal", project: "", event: "deployment.created" },
    configurationFields: getSharedNodeConfigurationFields("trigger.vercel.deployment"),
  },
  {
    type: "trigger.telegram.update", label: "Telegram update", description: "Start a workflow when a bot receives a supported update.",
    category: "trigger", libraryGroup: "communication", appId: "telegram", operationId: "receive-update", operationLabel: "Receive update", operationKind: "trigger", icon: "telegram", available: true,
    defaultConfig: { event: "message", chatMode: "allowlist", allowedChatIds: "" },
    configurationFields: getSharedNodeConfigurationFields("trigger.telegram.update"),
  },
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
    type: "trigger.google-calendar.event", label: "Google Calendar event", description: "Start when an event is created or updated.", category: "trigger",
    libraryGroup: "google-workspace", appId: "google-calendar", operationId: "event-change", operationLabel: "Event created or updated", operationKind: "trigger",
    icon: "google-calendar", available: true, defaultConfig: { credentialId: "", calendarId: "", event: "created", pollMinutes: "5" }, configurationFields: getSharedNodeConfigurationFields("trigger.google-calendar.event"),
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
    type: "trigger.uptime-kuma.alert", label: "Uptime Kuma alert", description: "Start when an Uptime Kuma monitor sends an alert.",
    category: "trigger", libraryGroup: "developer-data", appId: "uptime-kuma", operationId: "monitor-alert", operationLabel: "Monitor alert", operationKind: "trigger", icon: "uptime-kuma", available: true,
    defaultConfig: { path: "uptime-kuma-alert", secretRequired: true, monitorId: "", statusFilter: "any" },
    configurationFields: getSharedNodeConfigurationFields("trigger.uptime-kuma.alert"),
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
    configurationFields: getSharedNodeConfigurationFields("trigger.github.issue-opened"),
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
    configurationFields: getSharedNodeConfigurationFields("trigger.github.pull-request-opened"),
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
    configurationFields: getSharedNodeConfigurationFields("trigger.github.push"),
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
    configurationFields: getSharedNodeConfigurationFields("trigger.github.workflow-run-completed"),
  },
  {
    type: "action.aggregate", label: "Aggregate", description: "Group all incoming items into one array.",
    category: "action", libraryGroup: "logic", operationId: "aggregate", operationLabel: "Aggregate", operationKind: "utility", icon: "switch", available: true,
    defaultConfig: { outputField: "data" }, configurationFields: getSharedNodeConfigurationFields("action.aggregate"),
  },
  {
    type: "action.split-out", label: "Split Out", description: "Turn an array field into individual items.",
    category: "action", libraryGroup: "logic", operationId: "split-out", operationLabel: "Split Out", operationKind: "utility", icon: "switch", available: true,
    defaultConfig: { field: "items", destination: "", include: "none" }, configurationFields: getSharedNodeConfigurationFields("action.split-out"),
  },
  {
    type: "action.sort", label: "Sort", description: "Order incoming items by a text, number or date field.",
    category: "action", libraryGroup: "logic", operationId: "sort", operationLabel: "Sort", operationKind: "utility", icon: "switch", available: true,
    defaultConfig: { field: "name", valueType: "text", direction: "asc" }, configurationFields: getSharedNodeConfigurationFields("action.sort"),
  },
  {
    type: "action.limit", label: "Limit", description: "Keep the first or last items from a list.",
    category: "action", libraryGroup: "logic", operationId: "limit", operationLabel: "Limit", operationKind: "utility", icon: "switch", available: true,
    defaultConfig: { maxItems: 10, keep: "first" }, configurationFields: getSharedNodeConfigurationFields("action.limit"),
  },
  {
    type: "action.merge",
    label: "Merge",
    description: "Append two inputs or combine matching fields.",
    category: "action",
    libraryGroup: "logic",
    operationId: "merge",
    operationLabel: "Merge",
    operationKind: "utility",
    icon: "merge",
    available: true,
    defaultConfig: {},
    configurationFields: getSharedNodeConfigurationFields("action.merge"),
  },
  {
    type: "action.edit-fields",
    label: "Edit fields",
    description: "Choose and rename values for the next step.",
    category: "action",
    libraryGroup: "logic",
    operationId: "edit-fields",
    operationLabel: "Edit fields",
    operationKind: "utility",
    icon: "switch",
    available: true,
    defaultConfig: { fields: [{ name: "field1", type: "text", value: "" }] },
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
    type: "action.steam",
    label: "Steam Web API",
    description: "Read profiles, games, achievements, friends and badges.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "steam",
    operationId: "web-api",
    operationLabel: "Read Steam data",
    operationKind: "action",
    aliases: ["profile", "friends", "badges", "vanity", "owned games", "recent games", "achievements"],
    icon: "steam",
    available: true,
    defaultConfig: { credentialId: "", operation: "profile", steamId: "", vanity: "", appId: "", language: "english", includePlayedFreeGames: false },
    configurationFields: getSharedNodeConfigurationFields("action.steam"),
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
    configurationFields: getSharedNodeConfigurationFields("action.steam.account-snapshot"),
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
    configurationFields: getSharedNodeConfigurationFields("action.google-chat.webhook"),
  },
  {
    type: "action.slack.message", label: "Slack message", description: "Send a message to a channel the Slack bot has joined.", category: "action",
    libraryGroup: "communication", appId: "slack", operationId: "send-message", operationLabel: "Send message", operationKind: "action",
    icon: "slack", available: true, defaultConfig: { credentialId: "", channel: "", message: "" }, configurationFields: getSharedNodeConfigurationFields("action.slack.message"),
  },
  {
    type: "action.slack.update-message", label: "Update Slack message", description: "Update a message previously sent by this Slack app.", category: "action",
    libraryGroup: "communication", appId: "slack", operationId: "update-message", operationLabel: "Update message", operationKind: "action",
    icon: "slack", available: true, defaultConfig: { credentialId: "", channel: "", messageId: "", message: "" }, configurationFields: getSharedNodeConfigurationFields("action.slack.update-message"),
  },
  {
    type: "action.slack.webhook", label: "Slack webhook message", description: "Send a message to the channel selected in Slack.", category: "action",
    libraryGroup: "communication", appId: "slack", operationId: "send-webhook-message", operationLabel: "Send webhook message", operationKind: "action",
    icon: "slack", available: true, defaultConfig: { credentialId: "", message: "" }, configurationFields: getSharedNodeConfigurationFields("action.slack.webhook"),
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
    configurationFields: getSharedNodeConfigurationFields("action.discord.webhook"),
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
    defaultConfig: { credentialId: "", destinationType: "dm", chatId: "", messageThreadId: "", text: "", parseMode: "" },
  },
  {
    type: "action.telegram.reply", label: "Telegram reply", description: "Reply to an existing Telegram message.",
    category: "action", libraryGroup: "communication", appId: "telegram", operationId: "reply", operationLabel: "Reply to message", operationKind: "action", icon: "telegram", available: true,
    defaultConfig: { credentialId: "", destinationType: "dm", chatId: "", messageId: "", messageThreadId: "", text: "", parseMode: "" },
  },
  {
    type: "action.telegram.edit-message", label: "Telegram edit message", description: "Edit a message the bot is allowed to change.",
    category: "action", libraryGroup: "communication", appId: "telegram", operationId: "edit-message", operationLabel: "Edit message text", operationKind: "action", icon: "telegram", available: true,
    defaultConfig: { credentialId: "", destinationType: "dm", chatId: "", messageId: "", text: "", parseMode: "" },
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
    configurationFields: getSharedNodeConfigurationFields("action.google-drive"),
  },
  {
    type: "action.google-drive.get-file", label: "Google Drive · Get file", description: "Read the name and type of an accessible file or folder.",
    category: "action", libraryGroup: "google-workspace", appId: "google-drive", operationId: "get-file", operationLabel: "Get file metadata", operationKind: "search", icon: "google-drive", available: true,
    defaultConfig: { credentialId: "", fileId: "" }, configurationFields: getSharedNodeConfigurationFields("action.google-drive.get-file"),
  },
  {
    type: "action.google-drive.create-folder", label: "Google Drive · Create folder", description: "Create a folder in My Drive or inside a selected folder.",
    category: "action", libraryGroup: "google-workspace", appId: "google-drive", operationId: "create-folder", operationLabel: "Create folder", operationKind: "action", icon: "google-drive", available: true,
    defaultConfig: { credentialId: "", name: "", parentId: "" }, configurationFields: getSharedNodeConfigurationFields("action.google-drive.create-folder"),
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
    defaultConfig: { credentialId: "", operation: "append", spreadsheetId: "", range: "Sheet1!A1", values: [["", ""]], valueInputOption: "USER_ENTERED" },
    configurationFields: getSharedNodeConfigurationFields("action.google-sheets"),
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
    configurationFields: getSharedNodeConfigurationFields("action.http-request"),
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
    configurationFields: getSharedNodeConfigurationFields("action.email"),
  },
  {
    type: "action.google-chat.oauth", label: "Google Chat OAuth", description: "Send a Google Chat message and return its thread when available.",
    category: "action", libraryGroup: "google-workspace", appId: "google-chat", operationId: "send-oauth-message", operationLabel: "Send OAuth message", operationKind: "action", icon: "google-chat", available: true,
    defaultConfig: { credentialId: "", space: "", message: "" },
    configurationFields: getSharedNodeConfigurationFields("action.google-chat.oauth"),
  },
  {
    type: "action.google-chat.reply", label: "Google Chat reply", description: "Reply to an existing Google Chat thread.",
    category: "action", libraryGroup: "google-workspace", appId: "google-chat", operationId: "reply-thread", operationLabel: "Reply to thread", operationKind: "action", icon: "google-chat", available: true,
    defaultConfig: { credentialId: "", space: "", threadName: "", message: "" },
    configurationFields: getSharedNodeConfigurationFields("action.google-chat.reply"),
  },
  {
    type: "action.google-chat.edit-message", label: "Edit Google Chat message", description: "Update the text of an existing Google Chat message.",
    category: "action", libraryGroup: "google-workspace", appId: "google-chat", operationId: "edit-message", operationLabel: "Edit message", operationKind: "action", icon: "google-chat", available: true,
    defaultConfig: { credentialId: "", space: "", messageName: "", message: "" },
    configurationFields: getSharedNodeConfigurationFields("action.google-chat.edit-message"),
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
    available: true,
    defaultConfig: { credentialId: "", model: "", prompt: "", maxOutputTokens: 1024, timeoutMs: 30000 },
    configurationFields: getSharedNodeConfigurationFields("action.openai"),
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
    available: true,
    defaultConfig: { credentialId: "", model: "", prompt: "", maxOutputTokens: 1024, timeoutMs: 30000 },
    configurationFields: getSharedNodeConfigurationFields("action.gemini"),
  },
  {
    type: "trigger.gmail",
    label: "Gmail new message",
    description: "Check for new messages on a schedule while this workflow is active.",
    category: "trigger", libraryGroup: "start", appId: "gmail",
    operationId: "message-received", operationLabel: "New message", operationKind: "trigger",
    icon: "gmail", available: true,
    defaultConfig: { credentialId: "", mailbox: "inbox", labelId: "", sender: "", subject: "", pollMinutes: "1", maxMessages: "10" },
    configurationFields: getSharedNodeConfigurationFields("trigger.gmail"),
  },
  {
    type: "trigger.steam.game-news", label: "Steam game news", description: "Start when a game has a new Steam news post.",
    category: "trigger", libraryGroup: "start", appId: "steam", operationId: "game-news", operationLabel: "New game news", operationKind: "trigger",
    icon: "steam", available: true, defaultConfig: { appId: "", pollMinutes: "5" },
    configurationFields: getSharedNodeConfigurationFields("trigger.steam.game-news"),
  },
  {
    type: "trigger.rss.new-item",
    label: "RSS new item",
    description: "Check a public RSS or Atom feed for new items.",
    category: "trigger", libraryGroup: "start", appId: "rss",
    operationId: "new-item", operationLabel: "New item", operationKind: "trigger",
    icon: "rss", available: true,
    defaultConfig: { url: "", pollMinutes: "5" },
    configurationFields: getSharedNodeConfigurationFields("trigger.rss.new-item"),
  },

  {
    type: "action.gmail.read",
    label: "Gmail messages",
    description: "Read recent messages without changing your inbox.",
    category: "action",
    libraryGroup: "communication",
    appId: "gmail",
    operationId: "read-messages",
    operationLabel: "Read messages",
    operationKind: "search",
    icon: "gmail",
    available: true,
    defaultConfig: { credentialId: "", mailbox: "inbox", query: "", limit: 5 },
    configurationFields: getSharedNodeConfigurationFields("action.gmail.read"),
  },
  {
    type: "action.gmail.get-message",
    label: "Get Gmail message",
    description: "Read one message by ID.",
    category: "action", libraryGroup: "communication", appId: "gmail",
    operationId: "get-message", operationLabel: "Get message", operationKind: "search",
    icon: "gmail", available: true,
    defaultConfig: { credentialId: "", messageId: "" },
    configurationFields: getSharedNodeConfigurationFields("action.gmail.get-message"),
  },
  ...(["send", "reply", "draft", "updateDraft", "label"] as const).map((operation): NodeDefinition => {
    const type = operation === "draft" ? "action.gmail.create-draft" : operation === "updateDraft" ? "action.gmail.update-draft" : operation === "label" ? "action.gmail.modify-label" : operation === "send" ? "action.gmail.send" : "action.gmail.reply";
    return {
      type,
      label: operation === "send" ? "Send Gmail message" : operation === "reply" ? "Reply to Gmail message" : operation === "draft" ? "Create Gmail draft" : operation === "updateDraft" ? "Replace Gmail draft" : "Change Gmail message label",
      description: operation === "send" ? "Send a message through the selected Gmail account." : operation === "reply" ? "Reply in the original message thread." : operation === "draft" ? "Create a draft without sending it." : operation === "updateDraft" ? "Replace an existing draft with a new message." : "Add or remove one label on a message.",
      category: "action", libraryGroup: "communication", appId: "gmail", operationId: operation === "draft" ? "create-draft" : operation === "updateDraft" ? "update-draft" : operation === "label" ? "modify-label" : operation, operationLabel: operation === "send" ? "Send message" : operation === "reply" ? "Reply to message" : operation === "draft" ? "Create draft" : operation === "updateDraft" ? "Replace draft" : "Add or remove label", operationKind: "action", icon: "gmail", available: true,
      defaultConfig: operation === "label" ? { credentialId: "", messageId: "", labelId: "", labelAction: "add" } : { credentialId: "", ...(operation === "reply" ? { messageId: "" } : { subject: "" }), ...(operation === "updateDraft" ? { draftId: "" } : {}), to: "", cc: "", bcc: "", text: "" },
      configurationFields: getSharedNodeConfigurationFields(type),
    };
  }),
  {
    type: "action.google-calendar.list-events",
    label: "Google Calendar events",
    description: "Read upcoming events from a selected calendar.",
    category: "action", libraryGroup: "google-workspace", appId: "google-calendar",
    operationId: "list-events", operationLabel: "List upcoming events", operationKind: "search",
    icon: "google-calendar", available: true,
    defaultConfig: { credentialId: "", calendarId: "primary", limit: 10, timeMin: "", pageToken: "" },
    configurationFields: getSharedNodeConfigurationFields("action.google-calendar.list-events"),
  },
  {
    type: "action.google-calendar.create-event", label: "Create calendar event",
    description: "Create an event and optionally invite attendees.",
    category: "action", libraryGroup: "google-workspace", appId: "google-calendar",
    operationId: "create-event", operationLabel: "Create event", operationKind: "action",
    icon: "google-calendar", available: true,
    defaultConfig: { credentialId: "", calendarId: "primary", summary: "", start: "", end: "", description: "", location: "", attendees: "", sendUpdates: "none" },
    configurationFields: getSharedNodeConfigurationFields("action.google-calendar.create-event"),
  },
  {
    type: "action.google-calendar.get-event", label: "Get calendar event", description: "Read details for a selected event.",
    category: "action", libraryGroup: "google-workspace", appId: "google-calendar", operationId: "get-event", operationLabel: "Get event", operationKind: "search", icon: "google-calendar", available: true,
    defaultConfig: { credentialId: "", calendarId: "primary", eventId: "" },
    configurationFields: getSharedNodeConfigurationFields("action.google-calendar.get-event"),
  },
  {
    type: "action.google-calendar.update-event", label: "Update calendar event", description: "Change selected event details; leave other fields blank to keep them.",
    category: "action", libraryGroup: "google-workspace", appId: "google-calendar", operationId: "update-event", operationLabel: "Update event", operationKind: "action", icon: "google-calendar", available: true,
    defaultConfig: { credentialId: "", calendarId: "primary", eventId: "", summary: "", start: "", end: "", description: "", location: "", sendUpdates: "none" },
    configurationFields: getSharedNodeConfigurationFields("action.google-calendar.update-event"),
  },
  {
    type: "action.google-calendar.delete-event", label: "Delete calendar event", description: "Delete the selected event when the workflow runs live.",
    category: "action", libraryGroup: "google-workspace", appId: "google-calendar", operationId: "delete-event", operationLabel: "Delete event", operationKind: "action", icon: "google-calendar", available: true,
    defaultConfig: { credentialId: "", calendarId: "primary", eventId: "", sendUpdates: "none" },
    configurationFields: getSharedNodeConfigurationFields("action.google-calendar.delete-event"),
  },
  {
    type: "action.google-calendar.availability", label: "Check calendar availability", description: "Check whether a calendar is free during a time range.",
    category: "action", libraryGroup: "google-workspace", appId: "google-calendar", operationId: "availability", operationLabel: "Check availability", operationKind: "search", icon: "google-calendar", available: true,
    defaultConfig: { credentialId: "", calendarId: "primary", start: "", end: "" },
    configurationFields: getSharedNodeConfigurationFields("action.google-calendar.availability"),
  },

  {
    type: "action.postgres.select",
    label: "PostgreSQL rows",
    description: "Read a bounded set of rows from a table.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "postgres",
    operationId: "select-rows",
    operationLabel: "Select rows",
    operationKind: "search",
    icon: "postgres",
    available: true,
    defaultConfig: { credentialId: "", schema: "public", table: "", limit: 20 },
    configurationFields: getSharedNodeConfigurationFields("action.postgres.select"),
  },
  {
    type: "action.postgres.insert-row", label: "Insert PostgreSQL row", description: "Insert one row into a selected table.",
    category: "action", libraryGroup: "developer-data", appId: "postgres", operationId: "insert-row", operationLabel: "Insert row", operationKind: "action", icon: "postgres", available: true,
    defaultConfig: { credentialId: "", schema: "public", table: "", fields: [] }, configurationFields: getSharedNodeConfigurationFields("action.postgres.insert-row"),
  },
  {
    type: "action.postgres.upsert-row", label: "Insert or update PostgreSQL row", description: "Insert a row or update it using a unique column.",
    category: "action", libraryGroup: "developer-data", appId: "postgres", operationId: "upsert-row", operationLabel: "Insert or update row", operationKind: "action", icon: "postgres", available: true,
    defaultConfig: { credentialId: "", schema: "public", table: "", fields: [], conflictColumn: "" }, configurationFields: getSharedNodeConfigurationFields("action.postgres.upsert-row"),
  },
  {
    type: "action.rss.read", label: "Read RSS feed", description: "Read recent items from a public RSS or Atom feed.",
    category: "action", libraryGroup: "developer-data", appId: "rss", operationId: "read-feed", operationLabel: "Read feed", operationKind: "search", icon: "rss", available: true,
    defaultConfig: { url: "", limit: 20 },
    configurationFields: getSharedNodeConfigurationFields("action.rss.read"),
  },
  {
    type: "action.trello.create-card", label: "Trello card", description: "Create a card in a selected Trello list.",
    category: "action", libraryGroup: "productivity", appId: "trello", operationId: "create-card", operationLabel: "Create card", operationKind: "action", icon: "trello", available: true,
    defaultConfig: { credentialId: "", boardId: "", listId: "", title: "", description: "" },
    configurationFields: getSharedNodeConfigurationFields("action.trello.create-card"),
  },
  ...([
    ["action.trello.get-card", "Get card", "get"],
    ["action.trello.update-card", "Update card", "update"],
    ["action.trello.move-card", "Move card", "move"],
    ["action.trello.archive-card", "Archive card", "archive"],
    ["action.trello.list-cards", "List cards", "list"],
    ["action.trello.find-cards", "Find cards", "find"],
  ] as const).map(([type, label, operation]): NodeDefinition => {
    const collection = operation === "list" || operation === "find";
    const fields = getSharedNodeConfigurationFields(type);
    return { type, label: `Trello · ${label}`, description: `${label} in Trello.`, category: "action", libraryGroup: "productivity", appId: "trello", operationId: type.slice("action.trello.".length), operationLabel: label, operationKind: collection || operation === "get" ? "search" : "action", icon: "trello", available: true, defaultConfig: { credentialId: "", ...(collection ? { boardId: "", limit: 20 } : { sourceBoardId: "", cardId: "" }), ...(operation === "move" ? { boardId: "", listId: "" } : {}), ...(operation === "list" ? { filter: "open" } : {}), ...(operation === "find" ? { query: "", searchPagination: "pages", page: 0 } : {}) }, configurationFields: fields };
  }),

  {
    type: "action.sentry.list-issues", label: "Sentry issues", description: "Read issues from a Sentry project.",
    category: "action", libraryGroup: "developer-data", appId: "sentry", operationId: "list-issues", operationLabel: "List issues", operationKind: "search", icon: "sentry", available: true,
    defaultConfig: { credentialId: "", organization: "", project: "", status: "unresolved", limit: 20 },
    configurationFields: getSharedNodeConfigurationFields("action.sentry.list-issues"),
  },

  {
    type: "action.vercel.list-deployments", label: "Vercel deployments", description: "Read recent deployments for a Vercel project.",
    category: "action", libraryGroup: "developer-data", appId: "vercel", operationId: "list-deployments", operationLabel: "List deployments", operationKind: "search", icon: "vercel", available: true,
    defaultConfig: { credentialId: "", team: "personal", project: "", limit: 20 },
    configurationFields: getSharedNodeConfigurationFields("action.vercel.list-deployments"),
  },
  {
    type: "action.sentry.get-issue", label: "Get Sentry issue", description: "Read a limited view of an issue in the selected project.",
    category: "action", libraryGroup: "developer-data", appId: "sentry", operationId: "get-issue", operationLabel: "Get issue", operationKind: "action", icon: "sentry", available: true,
    defaultConfig: { credentialId: "", organization: "", project: "", issueId: "" },
    configurationFields: getSharedNodeConfigurationFields("action.sentry.get-issue"),
  },
  {
    type: "action.vercel.public-deployment-lookup", label: "Look up public deployment", description: "Read a limited deployment view; ownership is not verified.",
    category: "action", libraryGroup: "developer-data", appId: "vercel", operationId: "public-deployment-lookup", operationLabel: "Look up deployment", operationKind: "action", icon: "vercel", available: true,
    defaultConfig: { credentialId: "", team: "personal", deploymentId: "" },
    configurationFields: getSharedNodeConfigurationFields("action.vercel.public-deployment-lookup"),
  },
  {
    type: "action.reddit.list-posts", label: "Reddit posts", description: "Read public posts with an approved Reddit app. Public Data API access is being retired.",
    category: "action", libraryGroup: "developer-data", appId: "reddit", operationId: "list-posts", operationLabel: "List posts", operationKind: "search", icon: "reddit", available: true,
    defaultConfig: { credentialId: "", subreddit: "", sort: "new", limit: 20 },
    configurationFields: getSharedNodeConfigurationFields("action.reddit.list-posts"),
  },

  {
    type: "action.supabase.select", label: "Supabase rows", description: "Read rows from a Supabase public-schema table.",
    category: "action", libraryGroup: "developer-data", appId: "supabase", operationId: "select-rows", operationLabel: "Select rows", operationKind: "search", icon: "supabase", available: true,
    defaultConfig: { credentialId: "", table: "", limit: 20, rejectUnsafeNumbers: true },
    configurationFields: getSharedNodeConfigurationFields("action.supabase.select"),
  },
  {
    type: "action.supabase.insert-row", label: "Supabase · Insert row", description: "Insert one row into a public-schema table.",
    category: "action", libraryGroup: "developer-data", appId: "supabase", operationId: "insert-row", operationLabel: "Insert row", operationKind: "action", icon: "supabase", available: true,
    defaultConfig: { credentialId: "", table: "", fields: [] },
    configurationFields: getSharedNodeConfigurationFields("action.supabase.insert-row"),
  },

  {
    type: "action.notion.search-pages",
    label: "Notion pages",
    description: "Find pages shared with your Notion integration.",
    category: "action",
    libraryGroup: "productivity",
    appId: "notion",
    operationId: "search-pages",
    operationLabel: "Search pages",
    operationKind: "search",
    icon: "notion",
    available: true,
    defaultConfig: { credentialId: "", query: "", pageSize: 20 },
    configurationFields: getSharedNodeConfigurationFields("action.notion.search-pages"),
  },
  ...([
    ["action.notion.retrieve-page", "Get page", "page"],
    ["action.notion.list-children", "List page blocks", "children"],
    ["action.notion.retrieve-property", "Get page property", "property"],
  ] as const).map(([type, label, operation]): NodeDefinition => ({
    type, label: `Notion · ${label}`, description: `${label} shared with your Notion connection.`, category: "action", libraryGroup: "productivity", appId: "notion", operationId: type.slice("action.notion.".length), operationLabel: label, operationKind: "search", icon: "notion", available: true,
    defaultConfig: { credentialId: "", ...(operation === "children" ? { blockId: "" } : { pageId: "" }), ...(operation === "property" ? { propertyId: "" } : {}), ...(operation !== "page" ? { pageSize: 20 } : {}) },
    configurationFields: getSharedNodeConfigurationFields(type),
  })),
  {
    type: "action.notion.query-data-source", label: "Notion · List data source pages", description: "Read one page of entries from a shared data source.",
    category: "action", libraryGroup: "productivity", appId: "notion", operationId: "query-data-source", operationLabel: "List data source pages", operationKind: "search", icon: "notion", available: true,
    defaultConfig: { credentialId: "", dataSourceId: "", pageSize: 20, sort: "provider", editedAfter: "", filterMode: "none", filterProperty: "", filterValue: "" },
    configurationFields: getSharedNodeConfigurationFields("action.notion.query-data-source"),
  },
  ...(["create-entry", "update-entry"] as const).map((operation): NodeDefinition => ({
    type: `action.notion.${operation}`, label: `Notion · ${operation === "create-entry" ? "Create" : "Update"} database page`, description: "Set typed properties in a shared Notion data source.",
    category: "action", libraryGroup: "productivity", appId: "notion", operationId: operation, operationLabel: `${operation === "create-entry" ? "Create" : "Update"} database page`, operationKind: "action", icon: "notion", available: true,
    defaultConfig: { credentialId: "", dataSourceId: "", ...(operation === "update-entry" ? { pageId: "" } : {}), properties: [] }, configurationFields: getSharedNodeConfigurationFields(`action.notion.${operation}`),
  })),
  { type: "trigger.jira.issue", label: "Jira · Issue event", description: "Start when an issue changes in a selected Jira project.", category: "trigger", libraryGroup: "start", appId: "jira", operationId: "issue-event", operationLabel: "Issue event", operationKind: "trigger", icon: "jira", available: true, defaultConfig: { credentialId: "", project: "", event: "jira:issue_created" }, configurationFields: getSharedNodeConfigurationFields("trigger.jira.issue") },
  { type: "action.jira.search-issues", label: "Jira · Search issues", description: "Find accessible issues using JQL.", category: "action", libraryGroup: "productivity", appId: "jira", operationId: "search-issues", operationLabel: "Search issues", operationKind: "search", icon: "jira", available: true, defaultConfig: { credentialId: "", query: "", limit: 25, cursor: "" }, configurationFields: getSharedNodeConfigurationFields("action.jira.search-issues") },
  { type: "action.jira.create-issue", label: "Jira · Create issue", description: "Create an issue in your selected project.", category: "action", libraryGroup: "productivity", appId: "jira", operationId: "create-issue", operationLabel: "Create issue", operationKind: "action", icon: "jira", available: true, defaultConfig: { credentialId: "", project: "", issueType: "", summary: "", description: "" }, configurationFields: getSharedNodeConfigurationFields("action.jira.create-issue") },
  { type: "action.jira.get-issue", label: "Jira · Get issue", description: "Read an issue by its key.", category: "action", libraryGroup: "productivity", appId: "jira", operationId: "get-issue", operationLabel: "Get issue", operationKind: "search", icon: "jira", available: true, defaultConfig: { credentialId: "", issue: "" }, configurationFields: getSharedNodeConfigurationFields("action.jira.get-issue") },
  { type: "action.jira.update-issue", label: "Jira · Update issue", description: "Update an issue summary.", category: "action", libraryGroup: "productivity", appId: "jira", operationId: "update-issue", operationLabel: "Update issue", operationKind: "action", icon: "jira", available: true, defaultConfig: { credentialId: "", issue: "", summary: "" }, configurationFields: getSharedNodeConfigurationFields("action.jira.update-issue") },
  { type: "action.jira.add-comment", label: "Jira · Add comment", description: "Add a comment to an issue.", category: "action", libraryGroup: "productivity", appId: "jira", operationId: "add-comment", operationLabel: "Add comment", operationKind: "action", icon: "jira", available: true, defaultConfig: { credentialId: "", issue: "", comment: "" }, configurationFields: getSharedNodeConfigurationFields("action.jira.add-comment") },
  { type: "action.gitlab.get-project", label: "GitLab · Get project", description: "Read a project accessible to your token.", category: "action", libraryGroup: "developer-data", appId: "gitlab", operationId: "get-project", operationLabel: "Get project", operationKind: "search", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "" }, configurationFields: getSharedNodeConfigurationFields("action.gitlab.get-project") },
  { type: "action.gitlab.list-issues", label: "GitLab · List issues", description: "Read a bounded page of project issues.", category: "action", libraryGroup: "developer-data", appId: "gitlab", operationId: "list-issues", operationLabel: "List issues", operationKind: "search", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", state: "opened", page: 1, pageSize: 20 }, configurationFields: getSharedNodeConfigurationFields("action.gitlab.list-issues") },
  { type: "action.gitlab.get-issue", label: "GitLab · Get issue", description: "Read one issue by its project issue number.", category: "action", libraryGroup: "developer-data", appId: "gitlab", operationId: "get-issue", operationLabel: "Get issue", operationKind: "search", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", issue: "" }, configurationFields: getSharedNodeConfigurationFields("action.gitlab.get-issue") },
  { type: "action.gitlab.create-issue", label: "GitLab · Create issue", description: "Create an issue in the selected project.", category: "action", libraryGroup: "developer-data", appId: "gitlab", operationId: "create-issue", operationLabel: "Create issue", operationKind: "action", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", title: "", description: "" }, configurationFields: getSharedNodeConfigurationFields("action.gitlab.create-issue") },
  { type: "action.gitlab.add-comment", label: "GitLab · Add issue comment", description: "Add a comment to the selected issue.", category: "action", libraryGroup: "developer-data", appId: "gitlab", operationId: "add-comment", operationLabel: "Add issue comment", operationKind: "action", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", issue: "", body: "" }, configurationFields: getSharedNodeConfigurationFields("action.gitlab.add-comment") },
  { type: "action.gitlab.update-issue", label: "GitLab · Update issue", description: "Update an issue title and optionally its description.", category: "action", libraryGroup: "developer-data", appId: "gitlab", operationId: "update-issue", operationLabel: "Update issue", operationKind: "action", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", issue: "", title: "" }, configurationFields: getSharedNodeConfigurationFields("action.gitlab.update-issue") },
  { type: "action.gitlab.get-pipeline", label: "GitLab · Get pipeline", description: "Read a pipeline in the selected project.", category: "action", libraryGroup: "developer-data", appId: "gitlab", operationId: "get-pipeline", operationLabel: "Get pipeline", operationKind: "search", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", pipeline: "" }, configurationFields: getSharedNodeConfigurationFields("action.gitlab.get-pipeline") },
  { type: "action.gitlab.get-merge-request", label: "GitLab · Get merge request", description: "Read a merge request in the selected project.", category: "action", libraryGroup: "developer-data", appId: "gitlab", operationId: "get-merge-request", operationLabel: "Get merge request", operationKind: "search", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", mergeRequest: "" }, configurationFields: getSharedNodeConfigurationFields("action.gitlab.get-merge-request") },
  { type: "trigger.gitlab.pipeline", label: "GitLab · On pipeline event", description: "Receive authenticated events for the selected project.", category: "trigger", libraryGroup: "start", appId: "gitlab", operationId: "pipeline", operationLabel: "On pipeline event", operationKind: "trigger", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", status: "all" }, configurationFields: getSharedNodeConfigurationFields("trigger.gitlab.pipeline") },
  { type: "trigger.gitlab.merge-request", label: "GitLab · On merge request event", description: "Receive authenticated events for the selected project.", category: "trigger", libraryGroup: "start", appId: "gitlab", operationId: "merge-request", operationLabel: "On merge request event", operationKind: "trigger", icon: "gitlab", available: true, defaultConfig: { credentialId: "", project: "", action: "open" }, configurationFields: getSharedNodeConfigurationFields("trigger.gitlab.merge-request") },
  {
    type: "action.notion.create-page", label: "Notion · Create page", description: "Create a child page in a shared Notion page.",
    category: "action", libraryGroup: "productivity", appId: "notion", operationId: "create-page", operationLabel: "Create page", operationKind: "action", icon: "notion", available: true,
    defaultConfig: { credentialId: "", parentPageId: "", title: "", content: "" },
    configurationFields: getSharedNodeConfigurationFields("action.notion.create-page"),
  },
  {
    type: "action.notion.update-title", label: "Notion · Update page title", description: "Rename a shared Notion page.",
    category: "action", libraryGroup: "productivity", appId: "notion", operationId: "update-title", operationLabel: "Update page title", operationKind: "action", icon: "notion", available: true,
    defaultConfig: { credentialId: "", pageId: "", title: "" },
    configurationFields: getSharedNodeConfigurationFields("action.notion.update-title"),
  },
  {
    type: "action.notion.append-block", label: "Notion · Append text", description: "Append a paragraph to a shared page.", category: "action", libraryGroup: "productivity", appId: "notion", operationId: "append-block", operationLabel: "Append text", operationKind: "action", icon: "notion", available: true,
    defaultConfig: { credentialId: "", pageId: "", content: "" }, configurationFields: getSharedNodeConfigurationFields("action.notion.append-block"),
  },
  {
    type: "action.mongodb",
    label: "MongoDB",
    description: "Find documents in a MongoDB collection.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "mongodb",
    operationId: "query-documents",
    operationLabel: "Find documents",
    operationKind: "action",
    icon: "mongodb",
    available: true,
    defaultConfig: { credentialId: "", database: "", collection: "", operation: "find", filter: "{}", limit: 20 },
    configurationFields: getSharedNodeConfigurationFields("action.mongodb"),
  },
  {
    type: "action.mongodb.insert",
    label: "MongoDB insert",
    description: "Insert one document into a MongoDB collection.",
    category: "action",
    libraryGroup: "developer-data",
    appId: "mongodb",
    operationId: "insert-document",
    operationLabel: "Insert document",
    operationKind: "action",
    icon: "mongodb",
    available: true,
    defaultConfig: { credentialId: "", database: "", collection: "", document: "{}" },
    configurationFields: getSharedNodeConfigurationFields("action.mongodb.insert"),
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
    configurationFields: getSharedNodeConfigurationFields("action.github"),
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
    configurationFields: getSharedNodeConfigurationFields("action.github.add-label"),
  },
  {
    type: "action.github.update-issue", label: "GitHub · Update issue", description: "Update one issue field in a connected repository.", category: "action", libraryGroup: "developer-data", appId: "github", operationId: "update-issue", operationLabel: "Update issue", operationKind: "action", icon: "github", available: true,
    defaultConfig: { credentialId: "", repository: "", issueNumber: "", field: "title", title: "", body: "", state: "open" },
    configurationFields: getSharedNodeConfigurationFields("action.github.update-issue"),
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
    configurationFields: getSharedNodeConfigurationFields("action.github.add-comment"),
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
    configurationFields: getSharedNodeConfigurationFields("action.github.merge-pull-request"),
  },
  ...([
    ["action.github.list-issues", "List issues", "issue", true],
    ["action.github.get-issue", "Get issue", "issue", false],
    ["action.github.list-pull-requests", "List pull requests", "pull-request", true],
    ["action.github.get-pull-request", "Get pull request", "pull-request", false],
  ] as const).map(([type, label, kind, list]): NodeDefinition => ({
    type, label: `GitHub · ${label}`, description: `${label} in a connected repository.`, category: "action", libraryGroup: "developer-data", appId: "github", operationId: type.slice("action.github.".length), operationLabel: label, operationKind: "search", icon: "github", available: true,
    defaultConfig: { credentialId: "", repository: "", ...(list ? { state: "open", page: 1, pageSize: 30 } : kind === "issue" ? { issueNumber: "" } : { pullRequestNumber: "" }) },
    configurationFields: getSharedNodeConfigurationFields(type),
  })),
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
  return libraryCatalog.filter((definition) => definition.appId === appId);
}

const steamActions = [
  ["profile", "Get user profile", "Read a Steam user's profile."],
  ["friends", "Get friend list", "Read the visible friends of a Steam user."],
  ["badges", "Get badges", "Read a Steam user's badges."],
  ["resolveVanity", "Resolve profile URL", "Find a Steam ID from a profile name or URL."],
  ["ownedGames", "Get owned games", "Read games visible in a Steam library."],
  ["recentGames", "Get recently played games", "Read a user's recent Steam games."],
  ["achievements", "Get game achievements", "Read a user's achievements for a game."],
  ["gameNews", "Get game news", "Read recent public news for a Steam game by App ID."],
] as const;

/** Presentation entries reuse the same persisted node type and executor. */
export const libraryCatalog: NodeDefinition[] = nodeCatalog.flatMap((definition) => {
  if (definition.type === "action.steam") return steamActions.map(([operation, label, description]) => ({
    ...definition, libraryId: `action.steam#${operation}`, operationId: operation, operationLabel: label,
    label, description, operationKind: "search" as const, aliases: [], defaultConfig: { ...definition.defaultConfig, operation },
  }));
  if (definition.type === "action.riot-lol") return riotLolActions.map(({ id, label }) => ({
    ...definition, libraryId: `action.riot-lol#${id}`, operationId: id, operationLabel: label,
    label, description: `${label} with Riot's League API.`, aliases: [], defaultConfig: { ...definition.defaultConfig, operation: id },
  }));
  if (definition.type === "action.riot-tft") return riotTftActions.map(({ id, label }) => ({
    ...definition, libraryId: `action.riot-tft#${id}`, operationId: id, operationLabel: label,
    label, description: `${label} with Riot's TFT API.`, aliases: [], defaultConfig: { ...definition.defaultConfig, operation: id },
  }));
  return [definition];
});

export function libraryDefinitionId(definition: NodeDefinition): string {
  return definition.libraryId ?? definition.type;
}

export function getLibraryDefinition(id: string): NodeDefinition | undefined {
  const normalized = id === "action.steam" ? "action.steam#profile" : id === "action.riot-lol" ? "action.riot-lol#accountByRiotId" : id === "action.riot-tft" ? "action.riot-tft#accountByRiotId" : id;
  return libraryCatalog.find((definition) => libraryDefinitionId(definition) === normalized);
}

export function getNodeDefinitionForConfig(type: string, config: Record<string, unknown>): NodeDefinition | undefined {
  if (type === "action.steam") return getLibraryDefinition(`action.steam#${typeof config.operation === "string" ? config.operation : "profile"}`) ?? getNodeDefinition(type);
  if (type === "action.riot-lol") return getLibraryDefinition(`action.riot-lol#${typeof config.operation === "string" ? config.operation : "accountByRiotId"}`) ?? getNodeDefinition(type);
  if (type === "action.riot-tft") return getLibraryDefinition(`action.riot-tft#${typeof config.operation === "string" ? config.operation : "accountByRiotId"}`) ?? getNodeDefinition(type);
  return getNodeDefinition(type);
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
