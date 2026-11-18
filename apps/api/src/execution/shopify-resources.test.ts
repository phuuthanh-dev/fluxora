import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeShopifyResource } from "./shopify-resources";

const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.SHOPIFY);
  return { shop: "fixture-store", token: "synthetic-token" };
} } as unknown as CredentialService;
const product = { id: "gid://shopify/Product/123", title: "Sample product", status: "ACTIVE" };
const order = { id: "gid://shopify/Order/123", name: "#1001", createdAt: "2026-01-01T00:00:00Z", displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED" };

test("Shopify reads a selected order without exposing other response fields", async () => {
  const result = await executeShopifyResource({ credentialId: "connection", resourceId: order.id }, "get-order", "live", "workspace", credentials, async (url, init) => {
    assert.equal(url, "https://fixture-store.myshopify.com/admin/api/2026-10/graphql.json");
    assert.equal(JSON.parse(String(init.body)).variables.id, order.id);
    return Response.json({ data: { order: { ...order, email: "private@example.test" } } });
  });
  assert.deepEqual(result.output, { order });
  await assert.rejects(executeShopifyResource({ credentialId: "connection", resourceId: "gid://shopify/Order/999" }, "get-order", "live", "workspace", credentials, async () => Response.json({ data: { order } })), /different|invalid/i);
});

test("Shopify product reads are bounded and paginate", async () => {
  const result = await executeShopifyResource({ credentialId: "connection", limit: 1 }, "list-products", "live", "workspace", credentials, async (_url, init) => {
    assert.equal(JSON.parse(String(init.body)).variables.first, 1);
    return Response.json({ data: { products: { nodes: [product], pageInfo: { hasNextPage: true, endCursor: "next" } } } });
  });
  assert.deepEqual(result.output, { products: [product], hasMore: true, nextCursor: "next" });
  await assert.rejects(executeShopifyResource({ limit: 51 }, "list-products", "mock", "workspace", credentials), /50/);
  await assert.rejects(executeShopifyResource({ credentialId: "connection", resourceId: product.id }, "get-product", "live", "workspace", credentials, async () => Response.json({ data: { product: { ...product, title: "synthetic-token" } } })), /safely/);
});
