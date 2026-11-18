import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { WebhookService, hashWebhookSecret } from "./webhook.service";

test("Shopify accepts only signed orders from the connected shop without forwarding customer data", async () => {
  const secret = "synthetic-shopify-secret";
  const vault = { encrypt: (value: unknown) => JSON.stringify(value), decrypt: (value: string) => JSON.parse(value) };
  const graph = { nodes: [{ id: "shopify", type: "trigger.shopify.order-created", position: { x: 0, y: 0 }, config: { credentialId: "connection" } }], edges: [] };
  const endpoint = { id: "endpoint", path: "shopify-test", workflowId: "workflow", workflowVersionId: "version", isActive: true, secretHash: hashWebhookSecret(secret), encryptedSigningSecret: vault.encrypt({ secret }), workflow: { workspaceId: "workspace", isActive: true, archivedAt: null, publishedVersionId: "version" }, workflowVersion: { graph } };
  const deliveries: unknown[] = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createShopifyScheduledExecution: async (input: unknown) => { deliveries.push(input); return { id: "run", status: "SUCCEEDED", startedAt: new Date() }; } } as never, {} as never, { readForExecution: async () => ({ shop: "fixture-store", token: "synthetic-token" }) } as never, vault as never);
  const body = Buffer.from(JSON.stringify({ admin_graphql_api_id: "gid://shopify/Order/123", name: "#1001", created_at: "2026-01-01T00:00:00Z", email: "private@example.test" }));
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  const receive = (sig: string, shop: string, topic = "orders/create") => service.receive("shopify-test", undefined, {}, undefined, { rawBody: body }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { signature: sig, shop, topic });
  await assert.rejects(receive("invalid", "fixture-store.myshopify.com"));
  await assert.rejects(receive(signature, "other.myshopify.com"));
  assert.deepEqual(await receive(signature, "fixture-store.myshopify.com", "orders/updated"), { acknowledged: true });
  assert.deepEqual(await receive(signature, "fixture-store.myshopify.com"), { acknowledged: true });
  assert.equal(deliveries.length, 1);
  assert.equal((deliveries[0] as { deliveryKey: string }).deliveryKey, "123");
  assert.ok(!JSON.stringify(deliveries).includes("private@example.test"));
  assert.ok(!JSON.stringify(deliveries).includes(secret));
});
