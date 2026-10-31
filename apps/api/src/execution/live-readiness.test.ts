import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { liveCredentialRequirements } from "./live-readiness";
import { ExecutionService } from "./execution.service";

test("live readiness derives credential requirements from executable node types", () => {
  const requirements = liveCredentialRequirements({
    nodes: [
      { id: "steam", type: "action.steam.account-snapshot", position: { x: 0, y: 0 }, config: { credentialId: "steam-credential" } },
      { id: "chat", type: "action.google-chat.webhook", position: { x: 1, y: 0 }, config: {} },
      { id: "discord", type: "action.discord.webhook", position: { x: 1, y: 1 }, config: { credentialId: "discord-cred" } },
      { id: "telegram", type: "action.telegram.message", position: { x: 1, y: 2 }, config: {} },
      { id: "github", type: "action.github", position: { x: 1, y: 3 }, config: { credentialId: "github-cred" } },
      { id: "github-label", type: "action.github.add-label", position: { x: 1, y: 4 }, config: {} },
      { id: "github-comment", type: "action.github.add-comment", position: { x: 1, y: 5 }, config: {} },
      { id: "github-merge", type: "action.github.merge-pull-request", position: { x: 1, y: 6 }, config: {} },
      { id: "github-trigger", type: "trigger.github.issue-opened", position: { x: 1, y: 7 }, config: { credentialId: "github-trigger-cred" } },
      { id: "github-pr-trigger", type: "trigger.github.pull-request-opened", position: { x: 1, y: 8 }, config: { credentialId: "github-pr-trigger-cred" } },
      { id: "github-push-trigger", type: "trigger.github.push", position: { x: 1, y: 9 }, config: { credentialId: "github-push-trigger-cred" } },
      { id: "github-workflow-trigger", type: "trigger.github.workflow-run-completed", position: { x: 1, y: 10 }, config: { credentialId: "github-workflow-trigger-cred" } },
      { id: "http", type: "action.http-request", position: { x: 2, y: 0 }, config: { credentialId: "http-credential" } },
      { id: "email", type: "action.email", position: { x: 2, y: 1 }, config: { credentialId: "smtp-credential" } },
      { id: "gemini", type: "action.gemini", position: { x: 2, y: 2 }, config: { credentialId: "gemini-credential" } },
      { id: "openai", type: "action.openai", position: { x: 2, y: 3 }, config: { credentialId: "openai-credential" } },
      { id: "approval", type: "approval.request", position: { x: 3, y: 0 }, config: { notificationProvider: "http_webhook", notificationCredentialId: "approval-webhook" } },
    ],
    edges: [],
  });
  assert.deepEqual(requirements, [
    { nodeId: "steam", provider: CredentialProvider.STEAM, credentialId: "steam-credential" },
    { nodeId: "chat", provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK, credentialId: null },
    { nodeId: "discord", provider: CredentialProvider.DISCORD_WEBHOOK, credentialId: "discord-cred" },
    { nodeId: "telegram", provider: CredentialProvider.TELEGRAM_BOT, credentialId: null },
    { nodeId: "github", provider: CredentialProvider.GITHUB, credentialId: "github-cred" },
    { nodeId: "github-label", provider: CredentialProvider.GITHUB, credentialId: null },
    { nodeId: "github-comment", provider: CredentialProvider.GITHUB, credentialId: null },
    { nodeId: "github-merge", provider: CredentialProvider.GITHUB, credentialId: null },
    { nodeId: "github-trigger", provider: CredentialProvider.GITHUB, credentialId: "github-trigger-cred" },
    { nodeId: "github-pr-trigger", provider: CredentialProvider.GITHUB, credentialId: "github-pr-trigger-cred" },
    { nodeId: "github-push-trigger", provider: CredentialProvider.GITHUB, credentialId: "github-push-trigger-cred" },
    { nodeId: "github-workflow-trigger", provider: CredentialProvider.GITHUB, credentialId: "github-workflow-trigger-cred" },
    { nodeId: "http", provider: CredentialProvider.HTTP, credentialId: "http-credential" },
    { nodeId: "email", provider: CredentialProvider.SMTP, credentialId: "smtp-credential" },
    { nodeId: "gemini", provider: CredentialProvider.GEMINI, credentialId: "gemini-credential" },
    { nodeId: "openai", provider: CredentialProvider.OPENAI, credentialId: "openai-credential" },
    { nodeId: "approval", provider: CredentialProvider.HTTP, credentialId: "approval-webhook" },
  ]);
});

test("live readiness marks missing credentials without reading secret payloads", async () => {
  const prisma = {
    workflow: {
      findFirst: async () => ({ workspaceId: "workspace-1", publishedVersion: { graph: { nodes: [
        { id: "steam", type: "action.steam.account-snapshot", position: { x: 0, y: 0 }, config: { credentialId: "steam-credential" } },
        { id: "chat", type: "action.google-chat.webhook", position: { x: 1, y: 0 }, config: {} },
      ], edges: [] } } }),
    },
    credential: {
      findMany: async () => [{ id: "steam-credential", provider: CredentialProvider.STEAM }],
    },
  };
  const service = new ExecutionService(prisma as never, {} as never, {} as never);
  const readiness = await service.getLiveReadiness("workflow-1", "user-1");
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.requirements, [
    { nodeId: "steam", provider: CredentialProvider.STEAM, credentialId: "steam-credential", ready: true, reason: null },
    { nodeId: "chat", provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK, credentialId: null, ready: false, reason: "MISSING_CREDENTIAL" },
  ]);
});
