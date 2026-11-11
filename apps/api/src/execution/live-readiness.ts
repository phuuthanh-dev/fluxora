import type { WorkflowGraph } from "@workflow/contracts";
import { CredentialProvider } from "@prisma/client";

export type LiveCredentialRequirement = { nodeId: string; provider: CredentialProvider; credentialId: string | null };

/** Only nodes reachable from the selected trigger can run for this event. */
export function reachableWorkflowGraph(graph: WorkflowGraph, startNodeId: string): WorkflowGraph {
  if (!graph.nodes.some((node) => node.id === startNodeId && node.type.startsWith("trigger."))) {
    throw new Error("Selected workflow trigger was not found.");
  }
  const reachable = new Set([startNodeId]);
  const pending = [startNodeId];
  while (pending.length) {
    const source = pending.pop()!;
    for (const edge of graph.edges) {
      if (edge.source === source && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        pending.push(edge.target);
      }
    }
  }
  return { nodes: graph.nodes.filter((node) => reachable.has(node.id)), edges: graph.edges.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target)) };
}

export function liveCredentialRequirements(graph: WorkflowGraph, triggerNodeId?: string): LiveCredentialRequirement[] {
  const scoped = triggerNodeId ? reachableWorkflowGraph(graph, triggerNodeId) : graph;
  return scoped.nodes.flatMap<LiveCredentialRequirement>((node) => {
    const credentialId = readCredentialId(node.config);
    if (node.type === "trigger.github.issue-opened" || node.type === "trigger.github.pull-request-opened" || node.type === "trigger.github.push" || node.type === "trigger.github.workflow-run-completed") return [{ nodeId: node.id, provider: CredentialProvider.GITHUB, credentialId }];
    if (node.type === "action.steam.account-snapshot" || (node.type === "action.steam" && node.config.operation !== "gameNews")) return [{ nodeId: node.id, provider: CredentialProvider.STEAM, credentialId }];
    if (node.type === "action.riot-lol" || node.type === "action.riot-tft") return [{ nodeId: node.id, provider: CredentialProvider.RIOT, credentialId }];
    if (node.type === "action.google-chat.webhook") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK, credentialId }];
    if (node.type === "action.slack.webhook") return [{ nodeId: node.id, provider: CredentialProvider.SLACK_WEBHOOK, credentialId }];
    if (node.type === "action.slack.message" || node.type === "action.slack.update-message" || node.type === "trigger.slack.event") return [{ nodeId: node.id, provider: CredentialProvider.SLACK_OAUTH, credentialId }];
    if (node.type === "action.discord.webhook") return [{ nodeId: node.id, provider: CredentialProvider.DISCORD_WEBHOOK, credentialId }];
    if (node.type === "action.telegram.message" || node.type === "action.telegram.reply" || node.type === "action.telegram.edit-message") return [{ nodeId: node.id, provider: CredentialProvider.TELEGRAM_BOT, credentialId }];
    if (node.type === "action.email") return [{ nodeId: node.id, provider: CredentialProvider.SMTP, credentialId }];
    if (node.type === "action.gemini") return [{ nodeId: node.id, provider: CredentialProvider.GEMINI, credentialId }];
    if (node.type === "action.openai") return [{ nodeId: node.id, provider: CredentialProvider.OPENAI, credentialId }];
    if (node.type === "action.mongodb" || node.type === "action.mongodb.insert") return [{ nodeId: node.id, provider: CredentialProvider.MONGODB, credentialId }];
    if (node.type.startsWith("action.jira.") || node.type === "trigger.jira.issue") return [{ nodeId: node.id, provider: CredentialProvider.JIRA, credentialId }];
    if (node.type.startsWith("action.gitlab.") || node.type.startsWith("trigger.gitlab.")) return [{ nodeId: node.id, provider: CredentialProvider.GITLAB, credentialId }];
    if (node.type.startsWith("action.notion.") || node.type === "trigger.notion.page") return [{ nodeId: node.id, provider: CredentialProvider.NOTION, credentialId }];
    if ((node.type === "trigger.google-drive.file" || node.type === "trigger.google-sheets.row")) return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE, credentialId }];
    if (node.type.startsWith("action.trello.")) return [{ nodeId: node.id, provider: CredentialProvider.TRELLO, credentialId }];
    if (node.type.startsWith("action.sentry.")) return [{ nodeId: node.id, provider: CredentialProvider.SENTRY, credentialId }];
    if (node.type.startsWith("action.vercel.")) return [{ nodeId: node.id, provider: CredentialProvider.VERCEL, credentialId }];
    if (node.type === "action.supabase.select" || node.type === "action.supabase.insert-row") return [{ nodeId: node.id, provider: CredentialProvider.SUPABASE, credentialId }];
    if (node.type === "action.reddit.list-posts") return [{ nodeId: node.id, provider: CredentialProvider.REDDIT, credentialId }];
    if (["action.postgres.select", "action.postgres.insert-row", "action.postgres.upsert-row"].includes(node.type)) return [{ nodeId: node.id, provider: CredentialProvider.POSTGRES, credentialId }];
    if (node.type.startsWith("action.gmail.") || node.type === "trigger.gmail") return [{ nodeId: node.id, provider: CredentialProvider.GMAIL, credentialId }];
    if (node.type === "trigger.google-calendar.event" || node.type === "action.google-calendar.list-events" || node.type === "action.google-calendar.create-event" || node.type === "action.google-calendar.get-event" || node.type === "action.google-calendar.update-event" || node.type === "action.google-calendar.delete-event" || node.type === "action.google-calendar.availability") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE_CALENDAR, credentialId }];
    if (node.type === "action.google-chat.oauth" || node.type === "action.google-chat.reply" || node.type === "action.google-chat.edit-message") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE_CHAT_OAUTH, credentialId }];
    if (node.type === "action.github" || node.type.startsWith("action.github.")) return [{ nodeId: node.id, provider: CredentialProvider.GITHUB, credentialId }];
    if (node.type === "action.google-drive" || node.type.startsWith("action.google-drive.") || node.type === "action.google-sheets") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE, credentialId }];
    if (node.type === "action.http-request" && credentialId) return [{ nodeId: node.id, provider: CredentialProvider.HTTP, credentialId }];
    if (node.type === "approval.request") {
      const notificationCredentialId = readCredentialId(node.config, "notificationCredentialId");
      return notificationCredentialId ? [{ nodeId: node.id, provider: node.config.notificationProvider === "http_webhook" ? CredentialProvider.HTTP : CredentialProvider.GOOGLE_CHAT_WEBHOOK, credentialId: notificationCredentialId }] : [];
    }
    return [];
  });
}

function readCredentialId(config: Record<string, unknown>, key = "credentialId") {
  const value = config[key];
  return typeof value === "string" && value ? value : null;
}
