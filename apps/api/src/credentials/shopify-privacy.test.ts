import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { ShopifyPrivacyService } from "./shopify-privacy.service";

test("Shopify privacy requests require a signed body and are recorded idempotently", async (t) => {
  const previous = { secret: process.env.SHOPIFY_CLIENT_SECRET, key: process.env.APP_ENCRYPTION_KEY };
  process.env.SHOPIFY_CLIENT_SECRET = "synthetic-app-secret";
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  t.after(() => { if (previous.secret === undefined) delete process.env.SHOPIFY_CLIENT_SECRET; else process.env.SHOPIFY_CLIENT_SECRET = previous.secret; if (previous.key === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previous.key; });
  const saved = new Map<string, Record<string, unknown>>();
  const prisma = { shopifyPrivacyRequest: { upsert: async ({ where, create }: { where: { id: string }; create: Record<string, unknown> }) => { if (!saved.has(where.id)) saved.set(where.id, create); } } };
  const vault = { encrypt: () => "encrypted-fixture" };
  const service = new ShopifyPrivacyService(prisma as never, vault as never);
  const raw = Buffer.from(JSON.stringify({ shop_id: 42, shop_domain: "fixture.myshopify.com", customer: { id: 123, email: "private@example.test" }, orders_to_redact: [456] }));
  const signature = createHmac("sha256", process.env.SHOPIFY_CLIENT_SECRET).update(raw).digest("base64");
  await assert.rejects(service.receive("customer-redact", raw, "invalid", "delivery-1"));
  await assert.rejects(service.receive("shop-redact", raw, signature, "delivery-1"));
  await assert.rejects(service.receive("customer-redact", raw, signature));
  assert.equal(saved.size, 0);
  assert.deepEqual(await service.receive("customer-redact", raw, signature, "delivery-1"), { acknowledged: true });
  await service.receive("customer-redact", raw, signature, "delivery-1");
  assert.equal(saved.size, 1);
  await service.receive("customer-redact", raw, signature, "delivery-2");
  assert.equal(saved.size, 2, "a later identical request must not be suppressed");
  assert.equal(JSON.stringify([...saved.values()]).includes("private@example.test"), false);
});
