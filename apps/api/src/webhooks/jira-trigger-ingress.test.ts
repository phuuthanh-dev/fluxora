import assert from "node:assert/strict";
import test from "node:test";
import { JwtService } from "@nestjs/jwt";
import { WebhookService, hashWebhookSecret } from "./webhook.service";
import { jiraDeliveryToken } from "./jira-trigger-protocol";

test("Jira ingress requires a signed endpoint-bound event from the recorded site and hook", async (t) => {
  const previous = process.env.JIRA_CLIENT_SECRET;
  const secret = "synthetic-jira-client-secret", path = "jira-test";
  process.env.JIRA_CLIENT_SECRET = secret;
  t.after(() => { if (previous === undefined) delete process.env.JIRA_CLIENT_SECRET; else process.env.JIRA_CLIENT_SECRET = previous; });
  const now = Math.floor(Date.now() / 1000), deliveryToken = jiraDeliveryToken(secret, "endpoint");
  const authorization = `Bearer ${new JwtService().sign({ iat: now, exp: now + 60 }, { secret, algorithm: "HS256" })}`;
  const graph = { nodes: [{ id: "jira", type: "trigger.jira.issue", position: { x: 0, y: 0 }, config: { credentialId: "connection", project: "10001", event: "jira:issue_created" } }], edges: [] };
  const endpoint = { id: "endpoint", path, workflowId: "workflow", workflowVersionId: "version", isActive: true, secretHash: hashWebhookSecret("identity"), workflow: { workspaceId: "space", publishedVersionId: "version", isActive: true, archivedAt: null }, workflowVersion: { graph } };
  const registration = { id: "registration", endpointId: "endpoint", workflowVersionId: "version", credentialId: "connection", provider: "JIRA", state: "ACTIVE", remoteHookId: 42n, repository: "12345678-1234-1234-1234-123456789abc:10001", event: "jira:issue_created" };
  const captured: Array<Record<string, unknown>> = [], jobs: unknown[] = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint }, providerWebhookRegistration: { findUnique: async () => registration } } as never,
    { createJiraScheduledExecution: async (input: Record<string, unknown>) => { captured.push(input); return { id: "run", status: "QUEUED", startedAt: null }; } } as never,
    { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never,
    { readForExecution: async () => ({ cloudId: "12345678-1234-1234-1234-123456789abc" }) } as never);
  const payload = { webhookEvent: "jira:issue_created", matchedWebhookIds: [42], issue: { id: "10002", key: "DEMO-1", fields: { project: { id: "10001" }, summary: "Example", description: "private description" } } };
  const receive = (auth = authorization, data = payload, token = deliveryToken) => service.receive(path, undefined, data, undefined, {}, undefined, undefined, undefined, undefined, undefined, {}, {}, { authorization: auth, deliveryId: "delivery-1", deliveryToken: token });
  await assert.rejects(receive("Bearer invalid"));
  await assert.rejects(receive(authorization, payload, jiraDeliveryToken(secret, "other-endpoint")));
  await receive(authorization, { ...payload, matchedWebhookIds: [43] });
  assert.equal(captured.length, 0);
  assert.deepEqual(await receive(), { acknowledged: true });
  await service.onModuleDestroy();
  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.deliveryKey, "delivery-1");
  assert.equal(captured[0]?.registrationId, "registration");
  assert.ok(!JSON.stringify(captured[0]?.payload).includes("private description"));
  assert.deepEqual(jobs, [{ executionId: "run", mode: "live", initialOnly: true }]);
  endpoint.workflow.publishedVersionId = "other";
  await assert.rejects(receive());
});
