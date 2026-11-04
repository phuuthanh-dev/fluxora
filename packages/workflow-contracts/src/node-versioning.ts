import type { ExecutableWorkflowNodeType } from "./index";

/** Map saved legacy favorites to the current library entry, without changing graphs. */
const currentLibraryNodes = {
  "trigger.uptime-kuma.alert": "trigger.uptime-kuma.alert.v2",
  "action.google-drive": "action.google-drive.v2",
  "action.google-sheets": "action.google-sheets.v2",
  "action.google-chat.oauth": "action.google-chat.oauth.v2",
  "action.gmail.read": "action.gmail.read.v2",
  "action.notion.search-pages": "action.notion.search-pages.v2",
  "action.sentry.list-issues": "action.sentry.list-issues.v2",
  "action.vercel.list-deployments": "action.vercel.list-deployments.v2",
  "action.postgres.select": "action.postgres.select.v2",
  "action.supabase.select": "action.supabase.select.v2",
} as const satisfies Partial<Record<ExecutableWorkflowNodeType, ExecutableWorkflowNodeType>>;

export function nodeExecutionType(type: string, version: unknown): string | undefined {
  if (version === undefined || version === 1) return type;
  return undefined;
}

export function currentLibraryNodeType(type: string): string {
  return Object.hasOwn(currentLibraryNodes, type)
    ? currentLibraryNodes[type as keyof typeof currentLibraryNodes]
    : type;
}
