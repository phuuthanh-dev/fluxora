import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { shopifyOAuthCredential } from "./shopify-oauth";

test("one Shopify installation refreshes once across workspace connections", { skip: process.env.FLUXORA_CREDENTIAL_INTEGRATION !== "1", timeout: 30_000 }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient(), suffix = randomUUID();
  const shop = `fixture-${suffix}.myshopify.com`, otherShop = `other-${suffix}.myshopify.com`, userId = `shopify-user-${suffix}`;
  const workspaces = [`shopify-one-${suffix}`, `shopify-two-${suffix}`] as const, credentials = [`shopify-cred-one-${suffix}`, `shopify-cred-two-${suffix}`] as const;
  const names = ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_REDIRECT_URI"] as const;
  const previous = names.map((name) => process.env[name]), originalFetch = globalThis.fetch;
  const vault = { encrypt: (data: unknown) => JSON.stringify(data), decrypt: (data: string) => JSON.parse(data) };
  let calls = 0;
  Object.assign(process.env, { SHOPIFY_CLIENT_ID: "synthetic-client", SHOPIFY_CLIENT_SECRET: "synthetic-secret", SHOPIFY_REDIRECT_URI: "http://localhost:3001/api/v1/oauth/shopify/callback" });
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(String(init?.body)).refresh_token, "old-refresh");
    await new Promise((resolve) => setTimeout(resolve, 100));
    return Response.json({ access_token: "new-token", refresh_token: "new-refresh", expires_in: 3600, scope: "read_orders,read_products" });
  };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    for (const id of workspaces) await prisma.workspace.create({ data: { id, ownerId: userId, name: "Shopify test", slug: id } });
    await prisma.shopifyInstallation.create({ data: { shop, encryptedData: vault.encrypt({ accessToken: "old-token", refreshToken: "old-refresh", expiresAt: 1 }) } });
    await prisma.shopifyInstallation.create({ data: { shop: otherShop, encryptedData: vault.encrypt({ accessToken: "other-token", refreshToken: "other-refresh", expiresAt: Date.now() + 3_600_000 }) } });
    for (const i of [0, 1] as const) await prisma.credential.create({ data: { id: credentials[i], workspaceId: workspaces[i], provider: "SHOPIFY", label: "Synthetic", encryptedData: "{}", shopifyInstallationShop: shop } });
    await assert.rejects(shopifyOAuthCredential(prisma as never, vault as never, workspaces[0], credentials[1], shop));
    await assert.rejects(shopifyOAuthCredential(prisma as never, vault as never, workspaces[0], credentials[0], otherShop));
    const results = await Promise.all(([0, 1] as const).map((i) => shopifyOAuthCredential(prisma as never, vault as never, workspaces[i], credentials[i], shop)));
    assert.equal(calls, 1);
    assert.deepEqual(results.map((item) => item.token), ["new-token", "new-token"]);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { const value = previous[index]; if (value === undefined) delete process.env[name]; else process.env[name] = value; });
    await prisma.credential.deleteMany({ where: { id: { in: [...credentials] } } });
    await prisma.shopifyInstallation.deleteMany({ where: { shop: { in: [shop, otherShop] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [...workspaces] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
