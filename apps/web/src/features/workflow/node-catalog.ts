import type { Edge, Node } from "@xyflow/react";
import type { WorkflowEdgeKind, WorkflowNodeCategory, WorkflowNodeType } from "@workflow/contracts";
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

export type NodeLibraryFilter = "all" | "trigger" | "logic" | "apps" | "approval" | "roadmap";

export type NodeDefinition = {
  type: WorkflowNodeType;
  label: string;
  description: string;
  category: WorkflowNodeCategory;
  libraryGroup: NodeLibraryGroup;
  icon: NodeIconName;
  available: boolean;
  defaultConfig: Record<string, unknown>;
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
  { id: "trigger", label: "Triggers" },
  { id: "logic", label: "Logic" },
  { id: "apps", label: "Apps" },
  { id: "approval", label: "Approval" },
  { id: "roadmap", label: "Roadmap" },
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
    icon: "webhook",
    available: true,
    defaultConfig: { path: "steam-daily-report", secretRequired: true },
  },
  {
    type: "condition.if",
    label: "If / else",
    description: "Route using a condition.",
    category: "condition",
    libraryGroup: "logic",
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
    icon: "google-chat",
    available: true,
    defaultConfig: { credentialId: "", message: "" },
  },
  {
    type: "action.discord.webhook",
    label: "Discord webhook",
    description: "Post a message to a Discord channel via incoming webhook.",
    category: "action",
    libraryGroup: "communication",
    icon: "discord",
    available: true,
    defaultConfig: { credentialId: "", content: "", username: "", avatarUrl: "", embeds: "" },
  },
  {
    type: "action.telegram.message",
    label: "Telegram message",
    description: "Send a message via Telegram Bot API.",
    category: "action",
    libraryGroup: "communication",
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
    icon: "google-drive",
    available: true,
    defaultConfig: { credentialId: "", operation: "search", query: "", fileId: "", name: "daily-report.txt", text: "" },
  },
  {
    type: "action.google-sheets",
    label: "Google Sheets",
    description: "Read or write spreadsheet data.",
    category: "action",
    libraryGroup: "google-workspace",
    icon: "google-sheets",
    available: true,
    defaultConfig: { credentialId: "", operation: "append", spreadsheetId: "", range: "Sheet1!A1", values: [["", ""]] },
  },
  {
    type: "action.http-request",
    label: "HTTP request",
    description: "Call any REST API.",
    category: "action",
    libraryGroup: "developer-data",
    icon: "http",
    available: true,
    defaultConfig: { credentialId: "", method: "GET", url: "", headers: {}, body: "", timeoutMs: 15_000 },
  },
  {
    type: "approval.request",
    label: "Approval",
    description: "Pause until a person approves or rejects.",
    category: "approval",
    libraryGroup: "approval",
    icon: "approval",
    available: true,
    defaultConfig: { message: "", expiresInHours: 24, notificationProvider: "google_chat", notificationCredentialId: "" },
  },
  {
    type: "action.email",
    label: "Email",
    description: "Send an email notification.",
    category: "action",
    libraryGroup: "communication",
    icon: "email",
    available: false,
    defaultConfig: { to: "", subject: "", body: "" },
  },
  {
    type: "action.google-chat.oauth",
    label: "Google Chat OAuth",
    description: "Send a Google Chat message with OAuth.",
    category: "action",
    libraryGroup: "google-workspace",
    icon: "google-chat",
    available: false,
    defaultConfig: { credentialId: "", space: "", message: "" },
  },
  {
    type: "action.openai",
    label: "OpenAI",
    description: "Generate text with an OpenAI model.",
    category: "action",
    libraryGroup: "ai",
    icon: "openai",
    available: false,
    defaultConfig: { credentialId: "", model: "gpt-4.1-mini", prompt: "" },
  },
  {
    type: "action.gemini",
    label: "Gemini",
    description: "Generate text with a Gemini model.",
    category: "action",
    libraryGroup: "ai",
    icon: "gemini",
    available: false,
    defaultConfig: { credentialId: "", model: "gemini-2.5-flash", prompt: "" },
  },
  {
    type: "action.mongodb",
    label: "MongoDB",
    description: "Read or write MongoDB documents.",
    category: "action",
    libraryGroup: "developer-data",
    icon: "mongodb",
    available: false,
    defaultConfig: { credentialId: "", database: "", collection: "", operation: "find" },
  },
  {
    type: "action.github",
    label: "GitHub",
    description: "Automate repositories, issues, and pull requests.",
    category: "action",
    libraryGroup: "developer-data",
    icon: "github",
    available: false,
    defaultConfig: { credentialId: "", repository: "", operation: "createIssue" },
  },
  {
    type: "action.facebook-meta",
    label: "Facebook Meta",
    description: "Publish and manage Facebook content.",
    category: "action",
    libraryGroup: "social",
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
    icon: "instagram",
    available: false,
    defaultConfig: { credentialId: "", operation: "" },
  },
];

export function matchesNodeSearch(node: NodeDefinition, query: string) {
  const normalized = query.trim().toLowerCase();
  const group = nodeLibraryGroups.find((candidate) => candidate.id === node.libraryGroup);
  return !normalized || [node.label, node.description, node.category, node.type, group?.label ?? "", group?.description ?? ""]
    .some((value) => value.toLowerCase().includes(normalized));
}

export function matchesNodeLibraryFilter(node: NodeDefinition, filter: NodeLibraryFilter, query = "") {
  if (!matchesNodeSearch(node, query)) return false;
  if (filter === "roadmap") return !node.available;
  if (!query.trim() && !node.available) return false;
  if (filter === "all") return true;
  if (filter === "trigger") return node.category === "trigger";
  if (filter === "logic") return node.category === "condition";
  if (filter === "apps") return node.category === "action";
  return node.category === "approval";
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
    data: { ...createNodeData(nodeCatalog[1]!), label: "Daily schedule" },
  },
  {
    id: "steam",
    type: "workflowNode",
    position: { x: 385, y: 210 },
    data: createNodeData(nodeCatalog[5]!),
  },
  {
    id: "chat",
    type: "workflowNode",
    position: { x: 700, y: 210 },
    data: createNodeData(nodeCatalog[6]!),
  },
];

export const initialEdges: WorkflowCanvasEdge[] = [
  { id: "schedule-steam", source: "schedule", target: "steam", sourceHandle: "success", animated: true, kind: "success" },
  { id: "steam-chat", source: "steam", target: "chat", sourceHandle: "success", animated: true, kind: "success" },
];
