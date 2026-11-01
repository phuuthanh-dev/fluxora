import type { WorkflowGraph } from "@workflow/contracts";
import { CredentialProvider } from "@prisma/client";

export type LiveCredentialRequirement = { nodeId: string; provider: CredentialProvider; credentialId: string | null };

export function liveCredentialRequirements(graph: WorkflowGraph): LiveCredentialRequirement[] {
  return graph.nodes.flatMap<LiveCredentialRequirement>((node) => {
    const credentialId = readCredentialId(node.config);
    if (node.type === "trigger.github.issue-opened" || node.type === "trigger.github.pull-request-opened" || node.type === "trigger.github.push" || node.type === "trigger.github.workflow-run-completed") return [{ nodeId: node.id, provider: CredentialProvider.GITHUB, credentialId }];
    if (node.type === "action.steam.account-snapshot") return [{ nodeId: node.id, provider: CredentialProvider.STEAM, credentialId }];
    if (node.type === "action.google-chat.webhook") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK, credentialId }];
    if (node.type === "action.discord.webhook") return [{ nodeId: node.id, provider: CredentialProvider.DISCORD_WEBHOOK, credentialId }];
    if (node.type === "action.telegram.message") return [{ nodeId: node.id, provider: CredentialProvider.TELEGRAM_BOT, credentialId }];
    if (node.type === "action.email") return [{ nodeId: node.id, provider: CredentialProvider.SMTP, credentialId }];
    if (node.type === "action.gemini") return [{ nodeId: node.id, provider: CredentialProvider.GEMINI, credentialId }];
    if (node.type === "action.openai") return [{ nodeId: node.id, provider: CredentialProvider.OPENAI, credentialId }];
    if (node.type === "action.mongodb" || node.type === "action.mongodb.insert") return [{ nodeId: node.id, provider: CredentialProvider.MONGODB, credentialId }];
    if (node.type === "action.notion.search-pages") return [{ nodeId: node.id, provider: CredentialProvider.NOTION, credentialId }];
    if (node.type === "action.trello.create-card") return [{ nodeId: node.id, provider: CredentialProvider.TRELLO, credentialId }];
    if (node.type === "action.sentry.list-issues") return [{ nodeId: node.id, provider: CredentialProvider.SENTRY, credentialId }];
    if (node.type === "action.postgres.select") return [{ nodeId: node.id, provider: CredentialProvider.POSTGRES, credentialId }];
    if (node.type === "action.gmail.read" || node.type === "trigger.gmail") return [{ nodeId: node.id, provider: CredentialProvider.GMAIL, credentialId }];
    if (node.type === "action.google-calendar.list-events" || node.type === "action.google-calendar.create-event" || node.type === "action.google-calendar.get-event" || node.type === "action.google-calendar.update-event" || node.type === "action.google-calendar.delete-event" || node.type === "action.google-calendar.availability") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE_CALENDAR, credentialId }];
    if (node.type === "action.google-chat.oauth") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE_CHAT_OAUTH, credentialId }];
    if (node.type === "action.github" || node.type === "action.github.add-label" || node.type === "action.github.add-comment" || node.type === "action.github.merge-pull-request") return [{ nodeId: node.id, provider: CredentialProvider.GITHUB, credentialId }];
    if (node.type === "action.google-drive" || node.type === "action.google-sheets") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE, credentialId }];
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
