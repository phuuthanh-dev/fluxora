import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { WebhookService, hashWebhookSecret } from "./webhook.service";
import { parseWorkflowGraph, validatePublishableGraph } from "../workflows/workflow-graph";

const secret = "synthetic-sentry-client-secret", installationId = "64bf2cf2-37ee-46ae-a093-b7a52bd41a2a";
const graph = { nodes: [{ id: "sentry", type: "trigger.sentry.issue-created", position: { x: 0, y: 0 }, config: { project: "web", installationId } }], edges: [] };
const vault = { encrypt: (value: unknown) => JSON.stringify(value), decrypt: (value: string) => JSON.parse(value) };

test("Sentry ingress accepts only signed issue-created events for the chosen installation and project", async () => {
  validatePublishableGraph(parseWorkflowGraph(graph));
  const endpoint = { id: "endpoint", path: "sentry-test", workflowId: "workflow", workflowVersionId: "version", isActive: true, secretHash: hashWebhookSecret(secret), encryptedSigningSecret: vault.encrypt({ secret }), workflow: { workspaceId: "workspace", isActive: true, archivedAt: null }, workflowVersion: { graph } };
  const deliveries: unknown[] = [], jobs: unknown[] = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createSentryScheduledExecution: async (input: unknown) => { deliveries.push(input); return { id: "run", status: "QUEUED", startedAt: null }; } } as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never, {} as never, vault as never);
  const body = (project: string, action = "created") => Buffer.from(JSON.stringify({ action, installation: { uuid: installationId }, data: { issue: { id: "12345", project: { slug: project }, title: `Example ${secret}` } } }));
  const sign = (raw: Buffer) => createHmac("sha256", secret).update(raw).digest("hex");
  const selected = body("web"), other = body("other");
  await assert.rejects(service.receive("sentry-test", undefined, {}, undefined, { rawBody: selected }, undefined, undefined, undefined, "bad", "issue"));
  assert.deepEqual(await service.receive("sentry-test", undefined, {}, undefined, { rawBody: other }, undefined, undefined, undefined, sign(other), "issue"), { acknowledged: true });
  assert.deepEqual(await service.receive("sentry-test", undefined, {}, undefined, { rawBody: selected }, undefined, undefined, undefined, sign(selected), "issue"), { executionId: "run" });
  assert.equal((deliveries[0] as { deliveryKey: string }).deliveryKey, `${installationId}:12345`);
  assert.ok(!JSON.stringify(deliveries).includes(secret));
  assert.deepEqual(jobs, [{ executionId: "run", mode: "live", initialOnly: true }]);
});
