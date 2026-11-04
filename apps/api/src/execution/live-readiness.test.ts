import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { liveCredentialRequirements } from "./live-readiness";

test("Supabase insert requires its workspace connection for live execution", () => {
  const requirements = liveCredentialRequirements({ nodes: [{ id: "insert", type: "action.supabase.insert-row", position: { x: 0, y: 0 }, config: { credentialId: "supabase-connection" } }], edges: [] });
  assert.deepEqual(requirements, [{ nodeId: "insert", provider: CredentialProvider.SUPABASE, credentialId: "supabase-connection" }]);
});
import { ExecutionService } from "./execution.service";

test("both Steam nodes require the selected workspace Steam connection", () => {
  const nodes = (["action.steam", "action.steam.account-snapshot"] as const).map((type, index) => ({ id: String(index), type, position: { x: 0, y: 0 }, config: { credentialId: `steam-${index}` } }));
  assert.deepEqual(liveCredentialRequirements({ nodes, edges: [] }), nodes.map((node) => ({ nodeId: node.id, provider: CredentialProvider.STEAM, credentialId: node.config.credentialId })));
});

test("versioned Google Sheets writes still require the workspace Google connection", () => {
  const requirements = liveCredentialRequirements({ nodes: [{ id: "sheet", type: "action.google-sheets.v2", position: { x: 0, y: 0 }, config: { credentialId: "google-connection" } }], edges: [] });
  assert.deepEqual(requirements, [{ nodeId: "sheet", provider: CredentialProvider.GOOGLE, credentialId: "google-connection" }]);
});

test("new Trello and Notion operations retain provider-specific live-readiness checks", () => {
  const types = ["action.notion.retrieve-page", "action.notion.list-children", "action.notion.retrieve-property", "action.notion.create-page", "action.notion.update-title", "action.trello.get-card", "action.trello.update-card", "action.trello.move-card", "action.trello.archive-card", "action.trello.list-cards", "action.trello.find-cards"] as const;
  const nodes = types.map((type, index) => ({ id: String(index), type, position: { x: 0, y: 0 }, config: { credentialId: `credential-${index}` } }));
  const requirements = liveCredentialRequirements({ nodes, edges: [] });
  assert.equal(requirements.length, types.length);
  for (let i = 0; i < types.length; i++) {
    assert.equal(requirements[i]?.provider, types[i]!.startsWith("action.notion.") ? CredentialProvider.NOTION : CredentialProvider.TRELLO);
    assert.equal(requirements[i]?.credentialId, `credential-${i}`);
  }
});

test("GitHub issue and pull request operations require the workspace GitHub credential", () => {
  const types = ["action.github.list-issues", "action.github.get-issue", "action.github.update-issue", "action.github.list-pull-requests", "action.github.get-pull-request"] as const;
  const requirements = liveCredentialRequirements({ nodes: types.map((type, index) => ({ id: String(index), type, position: { x: 0, y: 0 }, config: { credentialId: "github" } })), edges: [] });
  assert.equal(requirements.length, types.length);
  assert.ok(requirements.every((entry) => entry.provider === CredentialProvider.GITHUB && entry.credentialId === "github"));
});

test("Gmail get-message requires a Gmail credential", () => {
  const requirements = liveCredentialRequirements({ nodes: [{ id: "message", type: "action.gmail.get-message", position: { x: 0, y: 0 }, config: { credentialId: "gmail" } }], edges: [] });
  assert.deepEqual(requirements, [{ nodeId: "message", provider: CredentialProvider.GMAIL, credentialId: "gmail" }]);
});

test("observability read operations require their own provider credential", () => {
  const types = ["action.sentry.list-issues", "action.sentry.get-issue", "action.vercel.list-deployments", "action.vercel.public-deployment-lookup"] as const;
  const requirements = liveCredentialRequirements({ nodes: types.map((type, index) => ({ id: String(index), type, position: { x: 0, y: 0 }, config: { credentialId: `connection-${index}` } })), edges: [] });
  assert.equal(requirements.length, types.length);
  for (let index = 0; index < types.length; index++) {
    assert.equal(requirements[index]?.credentialId, `connection-${index}`);
    assert.equal(requirements[index]?.provider, index < 2 ? CredentialProvider.SENTRY : CredentialProvider.VERCEL);
  }
});

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
      { id: "notion", type: "action.notion.search-pages", position: { x: 2, y: 4 }, config: { credentialId: "notion-credential" } },
      { id: "trello", type: "action.trello.create-card", position: { x: 2, y: 4 }, config: { credentialId: "trello-credential" } },
      { id: "sentry", type: "action.sentry.list-issues", position: { x: 2, y: 4 }, config: { credentialId: "sentry-credential" } },
      { id: "vercel", type: "action.vercel.list-deployments", position: { x: 2, y: 4 }, config: { credentialId: "vercel-credential" } },
      { id: "supabase", type: "action.supabase.select", position: { x: 2, y: 4 }, config: { credentialId: "supabase-credential" } },
      { id: "postgres", type: "action.postgres.select", position: { x: 2, y: 5 }, config: { credentialId: "postgres-credential" } },
      { id: "gmail", type: "action.gmail.read", position: { x: 2, y: 6 }, config: { credentialId: "gmail-credential" } },
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
    { nodeId: "notion", provider: CredentialProvider.NOTION, credentialId: "notion-credential" },
    { nodeId: "trello", provider: CredentialProvider.TRELLO, credentialId: "trello-credential" },
    { nodeId: "sentry", provider: CredentialProvider.SENTRY, credentialId: "sentry-credential" },
    { nodeId: "vercel", provider: CredentialProvider.VERCEL, credentialId: "vercel-credential" },
    { nodeId: "supabase", provider: CredentialProvider.SUPABASE, credentialId: "supabase-credential" },
    { nodeId: "postgres", provider: CredentialProvider.POSTGRES, credentialId: "postgres-credential" },
    { nodeId: "gmail", provider: CredentialProvider.GMAIL, credentialId: "gmail-credential" },
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

test("published legacy graphs with unavailable nodes fail readiness before a live execution is created", async () => {
  const graph = { nodes: [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "later", type: "action.instagram", position: { x: 1, y: 0 }, config: {} },
  ], edges: [] };
  const version = { id: "version", graph };
  let created = false;
  const prisma = { workflow: { findFirst: async () => ({ workspaceId: "workspace", publishedVersion: version }) }, execution: { create: async () => { created = true; } } };
  const service = new ExecutionService(prisma as never, {} as never, {} as never);
  const readiness = await service.getLiveReadiness("flow", "owner");
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.unavailableNodes, [{ nodeId: "later", type: "action.instagram" }]);
  await assert.rejects(() => service.createManualExecution("flow", "owner", false), (error: any) => error.response?.code === "NODE_UNAVAILABLE");
  assert.equal(created, false);
});
