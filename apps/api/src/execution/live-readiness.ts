import type { WorkflowGraph } from "@workflow/contracts";
import { CredentialProvider } from "@prisma/client";

export type LiveCredentialRequirement = { nodeId: string; provider: CredentialProvider; credentialId: string | null };

export function liveCredentialRequirements(graph: WorkflowGraph): LiveCredentialRequirement[] {
  return graph.nodes.flatMap<LiveCredentialRequirement>((node) => {
    const credentialId = readCredentialId(node.config);
    if (node.type === "trigger.github.issue-opened") return [{ nodeId: node.id, provider: CredentialProvider.GITHUB, credentialId }];
    if (node.type === "action.steam.account-snapshot") return [{ nodeId: node.id, provider: CredentialProvider.STEAM, credentialId }];
    if (node.type === "action.google-chat.webhook") return [{ nodeId: node.id, provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK, credentialId }];
    if (node.type === "action.discord.webhook") return [{ nodeId: node.id, provider: CredentialProvider.DISCORD_WEBHOOK, credentialId }];
    if (node.type === "action.telegram.message") return [{ nodeId: node.id, provider: CredentialProvider.TELEGRAM_BOT, credentialId }];
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
