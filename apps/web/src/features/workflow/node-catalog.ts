import type { Edge, Node } from "@xyflow/react";
import type { WorkflowEdgeKind, WorkflowNodeCategory, WorkflowNodeType } from "@workflow/contracts";

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

export type NodeDefinition = {
  type: WorkflowNodeType;
  label: string;
  description: string;
  category: WorkflowNodeCategory;
  icon: string;
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
    icon: "▶",
    available: true,
    defaultConfig: {},
  },
  {
    type: "trigger.cron",
    label: "Schedule",
    description: "Start on a cron schedule.",
    category: "trigger",
    icon: "◷",
    available: true,
    defaultConfig: { expression: "0 8 * * *", timezone: "Asia/Ho_Chi_Minh" },
  },
  {
    type: "trigger.webhook",
    label: "Webhook",
    description: "Receive an inbound HTTP event.",
    category: "trigger",
    icon: "⌁",
    available: true,
    defaultConfig: { path: "steam-daily-report", secretRequired: true },
  },
  {
    type: "condition.if",
    label: "If / else",
    description: "Route using a condition.",
    category: "condition",
    icon: "◇",
    available: true,
    defaultConfig: { left: "", operator: "equals", right: "" },
  },
  {
    type: "condition.switch",
    label: "Switch",
    description: "Route to multiple cases.",
    category: "condition",
    icon: "⇆",
    available: true,
    defaultConfig: { value: "", cases: [] },
  },
  {
    type: "action.steam.account-snapshot",
    label: "Steam account snapshot",
    description: "Read public Steam account data.",
    category: "action",
    icon: "◉",
    available: true,
    defaultConfig: { credentialId: "", steamId: "", includeOwnedGames: true },
  },
  {
    type: "action.google-chat.webhook",
    label: "Google Chat message",
    description: "Send a message through an incoming webhook.",
    category: "action",
    icon: "✦",
    available: true,
    defaultConfig: { credentialId: "", message: "" },
  },
  {
    type: "action.google-drive",
    label: "Google Drive",
    description: "Search, read, or upload a file.",
    category: "action",
    icon: "△",
    available: true,
    defaultConfig: { credentialId: "", operation: "search", query: "", fileId: "", name: "daily-report.txt", text: "" },
  },
  {
    type: "action.google-sheets",
    label: "Google Sheets",
    description: "Read or write spreadsheet data.",
    category: "action",
    icon: "▤",
    available: true,
    defaultConfig: { credentialId: "", operation: "append", spreadsheetId: "", range: "Sheet1!A1", values: [["", ""]] },
  },
  {
    type: "action.http-request",
    label: "HTTP request",
    description: "Call any REST API.",
    category: "action",
    icon: "↗",
    available: true,
    defaultConfig: { credentialId: "", method: "GET", url: "", headers: {}, body: "", timeoutMs: 15_000 },
  },
  {
    type: "approval.request",
    label: "Approval",
    description: "Pause until a person approves or rejects.",
    category: "approval",
    icon: "✓",
    available: true,
    defaultConfig: { message: "", expiresInHours: 24 },
  },
  {
    type: "action.email",
    label: "Email",
    description: "Email delivery is planned for a later release.",
    category: "action",
    icon: "✉",
    available: false,
    defaultConfig: { to: "", subject: "", body: "" },
  },
];

export function matchesNodeSearch(node: NodeDefinition, query: string) {
  const normalized = query.trim().toLowerCase();
  return !normalized || [node.label, node.description, node.category, node.type].some((value) => value.toLowerCase().includes(normalized));
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
