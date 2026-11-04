import assert from "node:assert/strict";
import test from "node:test";
import { WebhookService, hashWebhookSecret } from "./webhook.service";
import { parseWorkflowGraph, validatePublishableGraph } from "../workflows/workflow-graph";

test("Telegram endpoint requires a fresh secret even when the request disables it", async () => {
  const graph = { nodes: [{ id: "telegram", type: "trigger.telegram.update", position: { x: 0, y: 0 }, config: { event: "message", chatMode: "all", allowedChatIds: "" } }], edges: [] };
  let stored: Record<string, unknown> | undefined;
  const transaction = {
    $queryRaw: async () => [{ publishedVersionId: "version" }],
    webhookEndpoint: { findMany: async () => [], create: async ({ data }: { data: Record<string, unknown> }) => { stored = data; return { id: "endpoint", path: data.path, workflowVersionId: "version", createdAt: new Date(), updatedAt: new Date() }; } },
    auditLog: { create: async () => ({}) },
  };
  const service = new WebhookService({ workflow: { findFirst: async () => ({ id: "workflow", workspaceId: "workspace", publishedVersion: { id: "version", graph } }) }, webhookEndpoint: { findFirst: async () => null }, $transaction: async (fn: (client: typeof transaction) => Promise<unknown>) => fn(transaction) } as never, {} as never, {} as never, {} as never);
  const result = await service.createEndpoint("workflow", "owner", "telegram", false, { publishedVersionId: "version", endpoint: null });
  assert.ok(result.secret);
  assert.equal(stored?.secretHash, hashWebhookSecret(result.secret));
});

test("Telegram ingress requires its own secret header, filters chats and queues initial deliveries", async () => {
  const graph = { nodes: [{ id: "telegram", type: "trigger.telegram.update", position: { x: 0, y: 0 }, config: { event: "message", chatMode: "allowlist", allowedChatIds: "123" } }], edges: [] };
  validatePublishableGraph(parseWorkflowGraph(graph));
  const endpoint = { id: "endpoint", path: "telegram", workflowId: "workflow", workflowVersionId: "version", isActive: true, secretHash: hashWebhookSecret("fixture-secret"), encryptedSigningSecret: null, workflow: { workspaceId: "workspace", isActive: true, archivedAt: null }, workflowVersion: { graph } };
  const captured: unknown[] = [], jobs: unknown[] = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createTelegramScheduledExecution: async (input: unknown) => { captured.push(input); return { id: "run", status: "QUEUED", startedAt: null }; } } as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never, {} as never);
  const update = { update_id: 9, message: { message_id: 1, chat: { id: 123 }, text: "Hello" } };
  await assert.rejects(service.receive("telegram", "fixture-secret", update));
  await assert.rejects(service.receive("telegram", undefined, update, undefined, {}, "wrong"));
  assert.deepEqual(await service.receive("telegram", undefined, { ...update, message: { ...update.message, chat: { id: 999 } } }, undefined, {}, "fixture-secret"), { acknowledged: true });
  assert.deepEqual(await service.receive("telegram", undefined, update, undefined, {}, "fixture-secret"), { executionId: "run" });
  assert.equal(captured.length, 1);
  assert.equal((captured[0] as { deliveryKey: string }).deliveryKey, "9");
  assert.deepEqual(jobs, [{ executionId: "run", mode: "live", initialOnly: true }]);
});
