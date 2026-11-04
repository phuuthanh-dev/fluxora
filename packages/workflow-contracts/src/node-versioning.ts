import type { ExecutableWorkflowNodeType } from "./index";

/** Reader-first mapping of canonical types to the existing v2 behavior.
 * This does not change which graph formats the API or editor accepts or saves. */
const versionTwoNodes = {
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
  if (version !== 2 || !Object.hasOwn(versionTwoNodes, type)) return undefined;
  return versionTwoNodes[type as keyof typeof versionTwoNodes];
}
