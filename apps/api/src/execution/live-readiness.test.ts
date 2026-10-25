import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { liveCredentialRequirements } from "./live-readiness";

test("live readiness derives credential requirements from executable node types", () => {
  const requirements = liveCredentialRequirements({
    nodes: [
      { id: "steam", type: "action.steam.account-snapshot", position: { x: 0, y: 0 }, config: { credentialId: "steam-credential" } },
      { id: "chat", type: "action.google-chat.webhook", position: { x: 1, y: 0 }, config: {} },
      { id: "discord", type: "action.discord.webhook", position: { x: 1, y: 1 }, config: { credentialId: "discord-cred" } },
      { id: "telegram", type: "action.telegram.message", position: { x: 1, y: 2 }, config: {} },
      { id: "http", type: "action.http-request", position: { x: 2, y: 0 }, config: { credentialId: "http-credential" } },
      { id: "approval", type: "approval.request", position: { x: 3, y: 0 }, config: { notificationProvider: "http_webhook", notificationCredentialId: "approval-webhook" } },
    ],
    edges: [],
  });
  assert.deepEqual(requirements, [
    { nodeId: "steam", provider: CredentialProvider.STEAM, credentialId: "steam-credential" },
    { nodeId: "chat", provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK, credentialId: null },
    { nodeId: "discord", provider: CredentialProvider.DISCORD_WEBHOOK, credentialId: "discord-cred" },
    { nodeId: "telegram", provider: CredentialProvider.TELEGRAM_BOT, credentialId: null },
    { nodeId: "http", provider: CredentialProvider.HTTP, credentialId: "http-credential" },
    { nodeId: "approval", provider: CredentialProvider.HTTP, credentialId: "approval-webhook" },
  ]);
});
