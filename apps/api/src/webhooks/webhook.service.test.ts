import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { WebhookService, hashWebhookSecret, matchesWebhookSecret, verifyGitHubWebhookSignature } from "./webhook.service";
import { WebhookController } from "./webhook.controller";
import { HEADERS_METADATA } from "@nestjs/common/constants";

test("webhook registration responses prohibit caching the one-time secret", () => {
  const headers = Reflect.getMetadata(HEADERS_METADATA, WebhookController.prototype.create) as Array<{ name: string; value: string }>;
  assert.ok(headers.some((header) => header.name.toLowerCase() === "cache-control" && header.value === "no-store"));
});

test("webhook controller forwards and validates the GitHub delivery header", async () => {
  let received: unknown;
  const controller = new WebhookController({ receive: async (...args: unknown[]) => { received = args[4]; return {}; } } as never);
  const request = { body: {} } as never;
  await controller.receive("path", undefined, "push", "signature", undefined, Buffer.from("{}"), request, "delivery-123");
  assert.equal((received as { githubDelivery: string }).githubDelivery, "delivery-123");
  await assert.rejects(() => controller.receive("path", undefined, "push", "signature", undefined, Buffer.from("{}"), request, "invalid delivery"));
});

test("registration rejects old clients that do not supply an observed endpoint version", async () => {
  let writes = 0;
  const controller = new WebhookController({ createEndpoint: async () => { writes++; return {}; } } as never);
  await assert.rejects(() => controller.create("workflow-1", { currentUser: { id: "owner" }, body: { path: "github-push", publishedVersionId: "version-1" } } as never));
  assert.equal(writes, 0);
});

test("signed GitHub setup ping is acknowledged before activation without running a workflow", async () => {
  const body = Buffer.from('{"repository":{"full_name":"acme/project"}}');
  const signature = `sha256=${createHmac("sha256", "registration-secret").update(body).digest("hex")}`;
  let dispatched = 0;
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => ({ id: "endpoint-1", isActive: true, encryptedSigningSecret: "ciphertext", workflow: { workspaceId: "workspace-1", isActive: false, archivedAt: null }, workflowVersion: { graph: { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { event: "push", repository: "acme/project" } }], edges: [] } }, workflowVersionId: "version-1" }) } } as never,
    { createScheduledExecution: async () => { throw new Error("ping must not create an execution"); } } as never,
    { dispatch: async () => { dispatched++; } } as never, {} as never,
    { decrypt: () => ({ secret: "registration-secret" }) } as never);
  const payload = JSON.parse(body.toString());
  assert.deepEqual(await service.receive("github-push", undefined, payload, undefined, { githubEvent: "ping", githubSignature: signature, rawBody: body }), { acknowledged: true });
  await assert.rejects(() => service.receive("github-push", undefined, payload, undefined, { githubEvent: "ping", githubSignature: "sha256=bad", rawBody: body }));
  await assert.rejects(() => service.receive("github-push", undefined, payload, undefined, { githubEvent: "push", githubSignature: signature, rawBody: body }));
  assert.equal(dispatched, 0);
});

test("GitHub delivery IDs are scoped to the registration for idempotency", async () => {
  const body = Buffer.from('{"ref":"refs/heads/main"}');
  const signature = `sha256=${createHmac("sha256", "registration-secret").update(body).digest("hex")}`;
  const keys: Array<string | undefined> = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => ({ id: "endpoint-1", isActive: true, encryptedSigningSecret: "ciphertext", workflow: { workspaceId: "workspace-1", isActive: true, archivedAt: null }, workflowVersion: { graph: { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { event: "push" } }], edges: [] } }, workflowVersionId: "version-1" }) } } as never,
    { createScheduledExecution: async (_version: string, _payload: unknown, key?: string) => { keys.push(key); return { id: "same-execution" }; } } as never,
    { dispatch: async () => undefined } as never, {} as never,
    { decrypt: () => ({ secret: "registration-secret" }) } as never);
  const headers = { githubEvent: "push", githubSignature: signature, githubDelivery: "delivery-123", rawBody: body };
  await service.receive("github-push", undefined, JSON.parse(body.toString()), undefined, headers);
  await service.receive("github-push", undefined, JSON.parse(body.toString()), undefined, headers);
  assert.deepEqual(keys, ["webhook:endpoint-1:github:delivery-123", "webhook:endpoint-1:github:delivery-123"]);
});

test("GitHub registration encrypts its own secret and never stores it in the credential", async () => {
  let stored: Record<string, unknown> | undefined;
  const transaction = {
    $queryRaw: async () => [{ publishedVersionId: "version-1" }],
    webhookEndpoint: { findMany: async () => [], create: async ({ data }: { data: Record<string, unknown> }) => { stored = data; return { id: "endpoint-1", path: data.path, workflowVersionId: "version-1", createdAt: new Date(), updatedAt: new Date() }; } },
    auditLog: { create: async () => ({}) },
  };
  const service = new WebhookService({
    workflow: { findFirst: async () => ({ id: "workflow-1", workspaceId: "workspace-1", publishedVersion: { id: "version-1", graph: { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { event: "push" } }], edges: [] } } }) },
    webhookEndpoint: { findFirst: async () => null },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as never, {} as never, {} as never, {} as never, { encrypt: (data: { secret: string }) => `encrypted:${data.secret}` } as never);
  const result = await service.createEndpoint("workflow-1", "owner-1", "github-push", true, { publishedVersionId: "version-1", endpoint: null });
  assert.ok(result.secret);
  assert.equal(stored?.encryptedSigningSecret, `encrypted:${result.secret}`);
  assert.equal(stored?.secretHash, null);
});

test("failed audit rolls back a GitHub secret rotation", async () => {
  let persisted = "old-secret";
  const transaction = {
    $queryRaw: async () => [{ publishedVersionId: "version-1" }],
    webhookEndpoint: {
      findMany: async () => [{ id: "endpoint-1", updatedAt: new Date("2026-01-01T00:00:00.000Z") }],
      update: async ({ data }: { data: { encryptedSigningSecret: string } }) => ({ id: "endpoint-1", path: "github-push", newSecret: data.encryptedSigningSecret }),
    },
    auditLog: { create: async () => { throw new Error("audit unavailable"); } },
  };
  const service = new WebhookService({
    workflow: { findFirst: async () => ({ id: "workflow-1", workspaceId: "workspace-1", publishedVersion: { id: "version-1", graph: { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { event: "push" } }], edges: [] } } }) },
    webhookEndpoint: { findFirst: async () => null },
    $transaction: async (callback: (client: typeof transaction) => Promise<{ newSecret: string }>) => { const result = await callback(transaction); persisted = result.newSecret; return result; },
  } as never, {} as never, {} as never, {} as never, { encrypt: (data: { secret: string }) => `encrypted:${data.secret}` } as never);
  await assert.rejects(() => service.createEndpoint("workflow-1", "owner-1", "github-push", true, { publishedVersionId: "version-1", endpoint: { id: "endpoint-1", updatedAt: "2026-01-01T00:00:00.000Z" } }), /audit unavailable/);
  assert.equal(persisted, "old-secret");
});

test("stale registration state cannot overwrite another rotation", async () => {
  let writes = 0;
  const transaction = {
    $queryRaw: async () => [{ publishedVersionId: "version-1" }],
    webhookEndpoint: { findMany: async () => [{ id: "endpoint-1", updatedAt: new Date("2026-01-02T00:00:00.000Z") }], update: async () => { writes++; return {}; } },
  };
  const service = new WebhookService({
    workflow: { findFirst: async () => ({ id: "workflow-1", workspaceId: "workspace-1", publishedVersion: { id: "version-1", graph: { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { event: "push" } }], edges: [] } } }) },
    webhookEndpoint: { findFirst: async () => null },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as never, {} as never, {} as never, {} as never, { encrypt: () => "synthetic" } as never);
  await assert.rejects(() => service.createEndpoint("workflow-1", "owner-1", "github-push", true, { publishedVersionId: "version-1", endpoint: { id: "endpoint-1", updatedAt: "2026-01-01T00:00:00.000Z" } }), (error: any) => error.response?.code === "WEBHOOK_REGISTRATION_CHANGED");
  assert.equal(writes, 0);
});

test("existing duplicate registrations must be resolved before rotation", async () => {
  const transaction = { $queryRaw: async () => [{ publishedVersionId: "version-1" }], webhookEndpoint: { findMany: async () => [{ id: "first" }, { id: "second" }] } };
  const service = new WebhookService({
    workflow: { findFirst: async () => ({ id: "workflow-1", workspaceId: "workspace-1", publishedVersion: { id: "version-1", graph: { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { event: "push" } }], edges: [] } } }) },
    webhookEndpoint: { findFirst: async () => null },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as never, {} as never, {} as never, {} as never, { encrypt: () => "synthetic" } as never);
  await assert.rejects(() => service.createEndpoint("workflow-1", "owner-1", "github-push", true, { publishedVersionId: "version-1", endpoint: null }), (error: any) => error.response?.code === "WEBHOOK_REGISTRATION_DUPLICATE");
});

test("GitHub delivery verifies the registration secret independently from the connector", async () => {
  const body = Buffer.from('{"ref":"refs/heads/main"}');
  const signature = `sha256=${createHmac("sha256", "registration-secret").update(body).digest("hex")}`;
  let credentialReads = 0;
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => ({ id: "endpoint-1", isActive: true, encryptedSigningSecret: "ciphertext", workflow: { workspaceId: "workspace-1", isActive: true, archivedAt: null }, workflowVersion: { graph: { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { event: "push" } }], edges: [] } }, workflowVersionId: "version-1" }) } } as never,
    { createScheduledExecution: async () => ({ id: "execution-1" }) } as never,
    { dispatch: async () => undefined } as never,
    { readForExecution: async () => { credentialReads++; return {}; } } as never,
    { decrypt: () => ({ secret: "registration-secret" }) } as never);
  assert.deepEqual(await service.receive("github-push", undefined, JSON.parse(body.toString()), undefined, { githubEvent: "push", githubSignature: signature, rawBody: body }), { executionId: "execution-1" });
  assert.equal(credentialReads, 0);
  const wrongSignature = `sha256=${createHmac("sha256", "legacy-secret").update(body).digest("hex")}`;
  await assert.rejects(() => service.receive("github-push", undefined, JSON.parse(body.toString()), undefined, { githubEvent: "push", githubSignature: wrongSignature, rawBody: body }));
  assert.equal(credentialReads, 0, "an invalid registration signature must not fall back to the legacy credential");
});

test("webhook secret hashes cannot be used as the original secret and only the correct secret matches", () => {
  const secret = "a-random-webhook-secret";
  const hash = hashWebhookSecret(secret);
  assert.notEqual(hash, secret);
  assert.equal(matchesWebhookSecret(secret, hash), true);
  assert.equal(matchesWebhookSecret("wrong-secret", hash), false);
  assert.equal(matchesWebhookSecret(secret, "not-a-sha256-hash"), false);
});

test("GitHub webhook signatures use the raw body and reject tampering", () => {
  const body = Buffer.from('{"action":"opened","issue":{"number":42}}');
  const secret = "github-webhook-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyGitHubWebhookSignature(body, signature, secret), true);
  assert.equal(verifyGitHubWebhookSignature(Buffer.from('{"action":"closed"}'), signature, secret), false);
  assert.equal(verifyGitHubWebhookSignature(body, "sha256=bad", secret), false);
});

test("GitHub issue-opened webhook verifies event, signature, and dispatches the redacted payload", async () => {
  const body = Buffer.from('{"action":"opened","issue":{"number":42}}');
  const signature = `sha256=${createHmac("sha256", "github-webhook-secret").update(body).digest("hex")}`;
  let dispatchedExecutionId = "";
  let receivedPayload: Record<string, unknown> | undefined;
  const service = new WebhookService(
    {
      webhookEndpoint: {
        findUnique: async () => ({
          id: "endpoint-1",
          path: "github-issues",
          isActive: true,
          secretHash: null,
          workflow: { workspaceId: "workspace-1", isActive: true, archivedAt: null },
          workflowVersion: { graph: { nodes: [{ id: "github", type: "trigger.github.issue-opened", position: { x: 0, y: 0 }, config: { credentialId: "github-credential", event: "issues", action: "opened" } }], edges: [] } },
          workflowVersionId: "version-1",
        }),
      },
    } as never,
    {
      createScheduledExecution: async (_versionId: string, payload: Record<string, unknown>) => {
        receivedPayload = payload;
        return { id: "execution-1" };
      },
    } as never,
    { dispatch: async ({ executionId }: { executionId: string }) => { dispatchedExecutionId = executionId; } } as never,
    { readForExecution: async () => ({ webhookSecret: "github-webhook-secret" }) } as never,
  );

  const result = await service.receive(
    "github-issues",
    undefined,
    JSON.parse(body.toString()) as Record<string, unknown>,
    undefined,
    { githubEvent: "issues", githubSignature: signature, rawBody: body },
  );
  assert.deepEqual(result, { executionId: "execution-1" });
  assert.equal(dispatchedExecutionId, "execution-1");
  assert.deepEqual(receivedPayload, { action: "opened", issue: { number: 42 } });
});

test("GitHub issue-opened webhook rejects a different action before dispatch", async () => {
  const body = Buffer.from('{"action":"closed"}');
  const signature = `sha256=${createHmac("sha256", "github-webhook-secret").update(body).digest("hex")}`;
  let dispatched = false;
  const service = new WebhookService(
    { webhookEndpoint: { findUnique: async () => ({ id: "endpoint-1", isActive: true, secretHash: null, workflow: { workspaceId: "workspace-1", isActive: true, archivedAt: null }, workflowVersion: { graph: { nodes: [{ id: "github", type: "trigger.github.issue-opened", position: { x: 0, y: 0 }, config: { credentialId: "github-credential" } }], edges: [] } }, workflowVersionId: "version-1" }) } } as never,
    {} as never,
    { dispatch: async () => { dispatched = true; } } as never,
    { readForExecution: async () => ({ webhookSecret: "github-webhook-secret" }) } as never,
  );
  await assert.rejects(
    () => service.receive("github-issues", undefined, JSON.parse(body.toString()), undefined, { githubEvent: "issues", githubSignature: signature, rawBody: body }),
    (error: any) => error.response?.code === "GITHUB_EVENT_NOT_MATCHED",
  );
  assert.equal(dispatched, false);
});

test("GitHub webhook repository filters reject events from another repository", async () => {
  const body = Buffer.from('{"action":"opened","repository":{"full_name":"acme/other"}}');
  const signature = `sha256=${createHmac("sha256", "github-webhook-secret").update(body).digest("hex")}`;
  let dispatched = false;
  const service = new WebhookService(
    { webhookEndpoint: { findUnique: async () => ({ id: "endpoint-1", isActive: true, secretHash: null, workflow: { workspaceId: "workspace-1", isActive: true, archivedAt: null }, workflowVersion: { graph: { nodes: [{ id: "github", type: "trigger.github.issue-opened", position: { x: 0, y: 0 }, config: { credentialId: "github-credential", repository: "acme/expected", event: "issues", action: "opened" } }], edges: [] } }, workflowVersionId: "version-1" }) } } as never,
    {} as never,
    { dispatch: async () => { dispatched = true; } } as never,
    { readForExecution: async () => ({ webhookSecret: "github-webhook-secret" }) } as never,
  );
  await assert.rejects(
    () => service.receive("github-issues", undefined, JSON.parse(body.toString()), undefined, { githubEvent: "issues", githubSignature: signature, rawBody: body }),
    (error: unknown) => Boolean(error && typeof error === "object" && "response" in error && (error.response as { code?: unknown } | undefined)?.code === "GITHUB_REPOSITORY_NOT_MATCHED"),
  );
  assert.equal(dispatched, false);
});

test("GitHub pull-request-opened webhook verifies its event and dispatches the payload", async () => {
  const body = Buffer.from('{"action":"opened","pull_request":{"number":7}}');
  const signature = `sha256=${createHmac("sha256", "github-webhook-secret").update(body).digest("hex")}`;
  let dispatchedExecutionId = "";
  const service = new WebhookService(
    {
      webhookEndpoint: {
        findUnique: async () => ({
          id: "endpoint-pr-1",
          isActive: true,
          secretHash: null,
          workflow: { workspaceId: "workspace-1", isActive: true, archivedAt: null },
          workflowVersion: { graph: { nodes: [{ id: "github-pr", type: "trigger.github.pull-request-opened", position: { x: 0, y: 0 }, config: { credentialId: "github-credential", event: "pull_request", action: "opened" } }], edges: [] } },
          workflowVersionId: "version-pr-1",
        }),
      },
    } as never,
    { createScheduledExecution: async () => ({ id: "execution-pr-1" }) } as never,
    { dispatch: async ({ executionId }: { executionId: string }) => { dispatchedExecutionId = executionId; } } as never,
    { readForExecution: async () => ({ webhookSecret: "github-webhook-secret" }) } as never,
  );

  const result = await service.receive(
    "github-pull-requests",
    undefined,
    JSON.parse(body.toString()) as Record<string, unknown>,
    undefined,
    { githubEvent: "pull_request", githubSignature: signature, rawBody: body },
  );
  assert.deepEqual(result, { executionId: "execution-pr-1" });
  assert.equal(dispatchedExecutionId, "execution-pr-1");
});

test("GitHub push webhook accepts event-only delivery without an action field", async () => {
  const body = Buffer.from('{"ref":"refs/heads/main","after":"abc123","commits":[]}');
  const signature = `sha256=${createHmac("sha256", "github-webhook-secret").update(body).digest("hex")}`;
  let dispatchedExecutionId = "";
  const service = new WebhookService(
    {
      webhookEndpoint: {
        findUnique: async () => ({
          id: "endpoint-push-1",
          isActive: true,
          secretHash: null,
          workflow: { workspaceId: "workspace-1", isActive: true, archivedAt: null },
          workflowVersion: { graph: { nodes: [{ id: "github-push", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { credentialId: "github-credential", event: "push", action: "" } }], edges: [] } },
          workflowVersionId: "version-push-1",
        }),
      },
    } as never,
    { createScheduledExecution: async () => ({ id: "execution-push-1" }) } as never,
    { dispatch: async ({ executionId }: { executionId: string }) => { dispatchedExecutionId = executionId; } } as never,
    { readForExecution: async () => ({ webhookSecret: "github-webhook-secret" }) } as never,
  );

  const result = await service.receive(
    "github-push",
    undefined,
    JSON.parse(body.toString()) as Record<string, unknown>,
    undefined,
    { githubEvent: "push", githubSignature: signature, rawBody: body },
  );
  assert.deepEqual(result, { executionId: "execution-push-1" });
  assert.equal(dispatchedExecutionId, "execution-push-1");
});

test("GitHub workflow-run completed webhook verifies its action and dispatches the payload", async () => {
  const body = Buffer.from('{"action":"completed","workflow_run":{"id":123,"conclusion":"success"}}');
  const signature = `sha256=${createHmac("sha256", "github-webhook-secret").update(body).digest("hex")}`;
  let dispatchedExecutionId = "";
  const service = new WebhookService(
    {
      webhookEndpoint: {
        findUnique: async () => ({
          id: "endpoint-workflow-1",
          isActive: true,
          secretHash: null,
          workflow: { workspaceId: "workspace-1", isActive: true, archivedAt: null },
          workflowVersion: { graph: { nodes: [{ id: "github-workflow", type: "trigger.github.workflow-run-completed", position: { x: 0, y: 0 }, config: { credentialId: "github-credential", event: "workflow_run", action: "completed" } }], edges: [] } },
          workflowVersionId: "version-workflow-1",
        }),
      },
    } as never,
    { createScheduledExecution: async () => ({ id: "execution-workflow-1" }) } as never,
    { dispatch: async ({ executionId }: { executionId: string }) => { dispatchedExecutionId = executionId; } } as never,
    { readForExecution: async () => ({ webhookSecret: "github-webhook-secret" }) } as never,
  );

  const result = await service.receive(
    "github-workflow-run",
    undefined,
    JSON.parse(body.toString()) as Record<string, unknown>,
    undefined,
    { githubEvent: "workflow_run", githubSignature: signature, rawBody: body },
  );
  assert.deepEqual(result, { executionId: "execution-workflow-1" });
  assert.equal(dispatchedExecutionId, "execution-workflow-1");
});
