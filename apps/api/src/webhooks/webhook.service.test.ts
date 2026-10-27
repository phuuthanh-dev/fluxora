import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { WebhookService, hashWebhookSecret, matchesWebhookSecret, verifyGitHubWebhookSignature } from "./webhook.service";

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
