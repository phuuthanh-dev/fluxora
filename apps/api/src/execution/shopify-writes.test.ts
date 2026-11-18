import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { executeShopifyWrite } from "./shopify-writes";

const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "credential"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.SHOPIFY);
  return { shop: "fixture", token: "synthetic-secret-token" };
} } as unknown as CredentialService;
const productId = "gid://shopify/Product/123", orderId = "gid://shopify/Order/123", variantId = "gid://shopify/ProductVariant/123";
const examples = [
  { op: "create-product", config: { title: "Sample", status: "DRAFT" }, field: "productCreate", result: { product: { id: productId, title: "Sample", status: "DRAFT" } } },
  { op: "update-product", config: { resourceId: productId, field: "title", title: "Sample" }, field: "productUpdate", result: { product: { id: productId, title: "Sample", status: "DRAFT" } } },
  { op: "delete-product", config: { resourceId: productId }, field: "productDelete", result: { deletedProductId: productId } },
  { op: "create-order", config: { variantId, quantity: 1 }, field: "orderCreate", result: { order: { id: orderId, name: "#1001" } } },
  { op: "update-order", config: { resourceId: orderId, note: "Sample" }, field: "orderUpdate", result: { order: { id: orderId, name: "#1001" } } },
  { op: "delete-order", config: { resourceId: orderId }, field: "orderDelete", result: { deletedId: orderId } },
] as const;

test("Shopify writes use scoped credentials and bounded mutation inputs", async () => {
  for (const example of examples) {
    let calls = 0;
    const result = await executeShopifyWrite({ ...example.config, credentialId: "credential" }, example.op, "live", "workspace", credentials, async (url, init) => {
      calls++; assert.equal(url, "https://fixture.myshopify.com/admin/api/2026-10/graphql.json"); assert.equal(init.method, "POST");
      const body = JSON.parse(String(init.body)); assert.match(body.query, new RegExp(example.field));
      if (example.op === "create-order") assert.deepEqual(body.variables.order.lineItems, [{ variantId, quantity: 1 }]);
      return Response.json({ data: { [example.field]: { ...example.result, userErrors: [] } } });
    });
    assert.equal(calls, 1); assert.equal(result.status, "succeeded");
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-token/);
  }
});

test("Shopify write failures do not leak secrets or retry uncertain delivery", async () => {
  for (const transport of [
    async () => { throw new Error("synthetic-secret-token"); },
    async () => new Response("secret", { status: 429 }),
    async () => Response.json({ errors: [{ message: "synthetic-secret-token" }] }),
    async () => Response.json({ data: { productCreate: { product: { id: "gid://shopify/Product/999", title: "synthetic-secret-token", status: "ACTIVE" }, userErrors: [] } } }),
  ]) {
    await assert.rejects(() => executeShopifyWrite({ credentialId: "credential", title: "Sample", status: "DRAFT" }, "create-product", "live", "workspace", credentials, transport), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable && !error.message.includes("synthetic-secret-token"));
  }
});

test("Shopify rejects invalid IDs and quantities before contacting the provider", async () => {
  let calls = 0;
  for (const [operation, config] of [["delete-product", { resourceId: "invalid" }], ["create-order", { variantId, quantity: 0 }]] as const) {
    await assert.rejects(() => executeShopifyWrite(config, operation, "live", "workspace", credentials, async () => { calls++; throw Error("unexpected"); }));
  }
  assert.equal(calls, 0);
});

test("Shopify rejects confirmed user errors without exposing provider details or retrying", async () => {
  await assert.rejects(() => executeShopifyWrite({ credentialId: "credential", title: "Sample", status: "DRAFT" }, "create-product", "live", "workspace", credentials, async () => Response.json({ data: { productCreate: { product: null, userErrors: [{ field: ["title"], message: "private provider details" }] } } })), (error: unknown) => error instanceof NodeFailure && error.code === "SHOPIFY_REQUEST_REJECTED" && !error.retryable && !error.message.includes("private provider details"));
});

test("Shopify treats a mismatched or ambiguous write result as uncertain", async () => {
  for (const result of [
    { deletedProductId: "gid://shopify/Product/999", userErrors: [] },
    { deletedProductId: productId, userErrors: [{ message: "ambiguous" }] },
    { deletedProductId: null, userErrors: [] },
  ]) {
    await assert.rejects(() => executeShopifyWrite({ credentialId: "credential", resourceId: productId }, "delete-product", "live", "workspace", credentials, async () => Response.json({ data: { productDelete: result } })), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable);
  }
});

test("Shopify order updates allow clearing the note without leaking it in output", async () => {
  const result = await executeShopifyWrite({ credentialId: "credential", resourceId: orderId, note: "" }, "update-order", "live", "workspace", credentials, async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init.body)).variables.input, { id: orderId, note: "" });
    return Response.json({ data: { orderUpdate: { order: { id: orderId, name: "#1001" }, userErrors: [] } } });
  });
  assert.deepEqual(result.output, { order: { id: orderId, name: "#1001" } });
});
