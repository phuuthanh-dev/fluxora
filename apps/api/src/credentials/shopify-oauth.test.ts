import test from "node:test";
import assert from "node:assert/strict";
import { shopifyOAuthCredential } from "./shopify-oauth";

test("Shopify OAuth requires a workspace-owned connection and refreshes the shared installation", async (t) => {
  const names = ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_REDIRECT_URI"] as const;
  const previous = names.map((name) => process.env[name]);
  const original = globalThis.fetch;
  Object.assign(process.env, { SHOPIFY_CLIENT_ID: "synthetic-client", SHOPIFY_CLIENT_SECRET: "synthetic-secret", SHOPIFY_REDIRECT_URI: "http://localhost:3001/api/v1/oauth/shopify/callback" });
  t.after(() => { names.forEach((name, index) => { const value = previous[index]; if (value === undefined) delete process.env[name]; else process.env[name] = value; }); globalThis.fetch = original; });
  const shop = "fixture-store.myshopify.com";
  let stored = JSON.stringify({ accessToken: "old-token", refreshToken: "old-refresh", expiresAt: Date.now() - 1 });
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, `https://${shop}/admin/oauth/access_token`);
    assert.equal(init?.redirect, "error");
    assert.equal(JSON.parse(String(init?.body)).refresh_token, "old-refresh");
    return Response.json({ access_token: "new-token", refresh_token: "new-refresh", expires_in: 3600, scope: "read_orders,read_products" });
  };
  const tx = {
    $queryRaw: async () => [],
    credential: { findFirst: async ({ where }: { where: { workspaceId: string; id: string; shopifyInstallationShop: string } }) => where.workspaceId === "workspace" && where.id === "connection" && where.shopifyInstallationShop === shop ? { id: "connection" } : null },
    shopifyInstallation: { findUnique: async () => ({ encryptedData: stored }), update: async ({ data }: { data: { encryptedData: string } }) => { stored = data.encryptedData; } },
  };
  const prisma = { $transaction: async (run: (value: typeof tx) => unknown) => run(tx) };
  const vault = { decrypt: (value: string) => JSON.parse(value), encrypt: (value: unknown) => JSON.stringify(value) };
  await assert.rejects(shopifyOAuthCredential(prisma as never, vault as never, "other-workspace", "connection", shop));
  assert.equal(calls, 0);
  assert.deepEqual(await shopifyOAuthCredential(prisma as never, vault as never, "workspace", "connection", shop), { shop: "fixture-store", token: "new-token" });
  assert.equal(JSON.parse(stored).refreshToken, "new-refresh");
  assert.deepEqual(await shopifyOAuthCredential(prisma as never, vault as never, "workspace", "connection", shop), { shop: "fixture-store", token: "new-token" });
  assert.equal(calls, 1);
});
