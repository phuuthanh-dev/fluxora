import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { WebhookService, hashWebhookSecret } from "./webhook.service";
import { parseWorkflowGraph, validatePublishableGraph } from "../workflows/workflow-graph";

const secret = "synthetic-trello-app-secret", callbackUrl = "https://api.example.test/api/v1/webhooks/trello-test";
const boardId = "4d5ea62fd76aa1136000000c", actionId = "5d5ea62fd76aa1136000000c";
const graph = { nodes: [{ id: "trello", type: "trigger.trello.board-action", position: { x: 0, y: 0 }, config: { boardId, action: "all" } }], edges: [] };
const vault = { encrypt: (value: unknown) => JSON.stringify(value), decrypt: (value: string) => JSON.parse(value) };

test("Trello registration keeps the app secret and exact callback private", async () => {
  let stored: Record<string, unknown> | undefined;
  const tx = {
    $queryRaw: async () => [{ publishedVersionId: "version" }],
    webhookEndpoint: { findMany: async () => [], create: async ({ data }: { data: Record<string, unknown> }) => { stored = data; return { id: "endpoint", path: data.path, workflowVersionId: "version", createdAt: new Date(), updatedAt: new Date() }; } },
    auditLog: { create: async () => ({}) },
  };
  const prisma = { workflow: { findFirst: async () => ({ id: "workflow", workspaceId: "workspace", publishedVersion: { id: "version", graph } }) }, webhookEndpoint: { findFirst: async () => null }, $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) };
  const service = new WebhookService(prisma as never, {} as never, {} as never, {} as never, vault as never);
  const expected = { publishedVersionId: "version", endpoint: null };
  await assert.rejects(service.createEndpoint("workflow", "owner", "trello-test", true, expected, secret, "https://other.test/api/v1/webhooks/wrong"));
  const result = await service.createEndpoint("workflow", "owner", "trello-test", true, expected, secret, callbackUrl);
  assert.equal(result.secret, null);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(stored?.secretHash, hashWebhookSecret(JSON.stringify([secret, callbackUrl])));
  assert.deepEqual(vault.decrypt(stored?.encryptedSigningSecret as string), { secret, callbackUrl });
});

test("Trello HEAD is accepted before activation and signed events are scoped to the board", async () => {
  validatePublishableGraph(parseWorkflowGraph(graph));
  const endpoint = { id: "endpoint", path: "trello-test", workflowId: "workflow", workflowVersionId: "version", isActive: true, secretHash: hashWebhookSecret(JSON.stringify([secret, callbackUrl])), encryptedSigningSecret: vault.encrypt({ secret, callbackUrl }), workflow: { workspaceId: "workspace", isActive: false, archivedAt: null, publishedVersionId: "version" }, workflowVersion: { graph } };
  const deliveries: unknown[] = [], jobs: unknown[] = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createTrelloScheduledExecution: async (input: unknown) => { deliveries.push(input); return { id: "run", status: "QUEUED", startedAt: null }; } } as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never, {} as never, vault as never);
  await service.checkTrelloEndpoint("trello-test");
  const body = (id: string) => Buffer.from(JSON.stringify({ model: { id }, webhook: { idModel: id }, action: { id: actionId, type: "createCard", data: { confidential: "not forwarded" } } }));
  const sign = (raw: Buffer) => createHmac("sha1", secret).update(raw).update(callbackUrl).digest("base64");
  const selected = body(boardId), other = body("7d5ea62fd76aa1136000000c");
  await assert.rejects(service.receive("trello-test", undefined, {}, undefined, { rawBody: selected }, undefined, undefined, sign(selected)));
  endpoint.workflow.isActive = true;
  await assert.rejects(service.receive("trello-test", undefined, {}, undefined, { rawBody: selected }, undefined, undefined, "invalid"));
  assert.deepEqual(await service.receive("trello-test", undefined, {}, undefined, { rawBody: other }, undefined, undefined, sign(other)), { acknowledged: true });
  assert.deepEqual(await service.receive("trello-test", undefined, {}, undefined, { rawBody: selected }, undefined, undefined, sign(selected)), { executionId: "run" });
  assert.equal(deliveries.length, 1);
  assert.ok(!JSON.stringify(deliveries).includes(secret));
  assert.ok(!JSON.stringify(deliveries).includes("not forwarded"));
  assert.equal((deliveries[0] as { deliveryKey: string }).deliveryKey, actionId);
  assert.deepEqual(jobs, [{ executionId: "run", mode: "live", initialOnly: true }]);
});
