import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeShopifyOrders } from "./shopify";
import { validShopifyCredential } from "./shopify-credential";

const credentials = { readForExecution: async (_id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.SHOPIFY);
  return { shop: "fixture-store", token: "synthetic-token" };
} } as unknown as CredentialService;
const order = { id: "gid://shopify/Order/123", name: "#1001", createdAt: "2026-01-01T00:00:00Z", displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED" };

test("Shopify credentials constrain requests to a canonical shop subdomain", () => {
  assert.equal(validShopifyCredential({ shop: "fixture-store", token: "synthetic-token" }), true);
  for (const shop of ["fixture-store.myshopify.com", "https://fixture-store", "../admin", "fixture-store@evil", "-invalid", "invalid-"]) assert.equal(validShopifyCredential({ shop, token: "synthetic-token" }), false);
});

test("Shopify order read sends a bounded GraphQL query and returns a continuation", async () => {
  const result = await executeShopifyOrders({ credentialId: "connection", limit: 1 }, "live", "workspace", credentials, async (url, init) => {
    assert.equal(url, "https://fixture-store.myshopify.com/admin/api/2026-10/graphql.json");
    assert.equal((init.headers as Record<string, string>)["x-shopify-access-token"], "synthetic-token");
    assert.equal(JSON.parse(String(init.body)).variables.first, 1);
    return Response.json({ data: { orders: { nodes: [order], pageInfo: { hasNextPage: true, endCursor: "next" } } } });
  });
  assert.deepEqual(result.output, { orders: [order], hasMore: true, nextCursor: "next" });
});

test("Shopify filters an exact order and rejects an unexpected result", async () => {
  const result = await executeShopifyOrders({ orderName: "#1001", limit: 1 }, "live", "workspace", credentials, async (_url, init) => {
    assert.equal(JSON.parse(String(init.body)).variables.search, "name:1001");
    return Response.json({ data: { orders: { nodes: [order], pageInfo: { hasNextPage: false, endCursor: null } } } });
  });
  assert.equal(result.output.orders[0]?.name, "#1001");
  await assert.rejects(executeShopifyOrders({ orderName: "#1002" }, "live", "workspace", credentials, async () => Response.json({ data: { orders: { nodes: [order], pageInfo: { hasNextPage: false, endCursor: null } } } })), /outside the requested filter/);
});

test("Shopify mock never reads credentials; invalid and unsafe responses fail closed", async () => {
  const unavailable = { readForExecution: () => { throw new Error("must not read credentials"); } } as unknown as CredentialService;
  assert.equal((await executeShopifyOrders({}, "mock", "workspace", unavailable)).output.orders.length, 1);
  await assert.rejects(executeShopifyOrders({ limit: 51 }, "mock", "workspace", unavailable), /50/);
  await assert.rejects(executeShopifyOrders({}, "live", "workspace", credentials, async () => Response.json({ errors: [{ message: "access denied" }] })), /Shopify could not read orders/);
  await assert.rejects(executeShopifyOrders({}, "live", "workspace", credentials, async () => Response.json({ data: { orders: { nodes: [{ ...order, name: "synthetic-token" }], pageInfo: { hasNextPage: false, endCursor: null } } } })), /safely/);
});
