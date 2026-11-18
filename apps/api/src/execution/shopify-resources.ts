import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readProviderJson, requireProviderSuccess } from "./provider-request-policy";
import { assertNoCredentialInProviderValue } from "./provider-credential-safety";
import { validShopifyCredential } from "./shopify-credential";

type Operation = "get-order" | "get-product" | "list-products";
type Transport = (url: string, init: RequestInit) => Promise<Response>;
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const queries: Record<Operation, string> = {
  "get-order": "query Order($id: ID!) { order(id: $id) { id name createdAt displayFinancialStatus displayFulfillmentStatus } }",
  "get-product": "query Product($id: ID!) { product(id: $id) { id title status } }",
  "list-products": "query Products($first: Int!, $after: String) { products(first: $first, after: $after) { nodes { id title status } pageInfo { hasNextPage endCursor } } }",
};
const sampleProduct = { id: "gid://shopify/Product/123", title: "Sample product", status: "ACTIVE" };
const sampleOrder = { id: "gid://shopify/Order/123", name: "#1001", createdAt: "2026-01-01T00:00:00Z", displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED" };

export async function executeShopifyResource(config: Record<string, unknown>, operation: Operation, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const issue = nodeConfigIssues(`action.shopify.${operation}`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const limit = typeof config.limit === "number" ? config.limit : 20;
  if (mode === "mock") return { status: "succeeded" as const, route: "success" as const, output: operation === "get-order" ? { order: sampleOrder } : operation === "get-product" ? { product: sampleProduct } : { products: [sampleProduct], hasMore: false, nextCursor: null } };
  const connection = await credentials.readForExecution(String(config.credentialId ?? ""), workspaceId, CredentialProvider.SHOPIFY);
  if (!validShopifyCredential(connection)) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a Shopify store and Admin API access token.", false);
  const token = connection.token as string;
  const variables = operation === "list-products" ? { first: limit, after: typeof config.cursor === "string" && config.cursor ? config.cursor : null } : { id: config.resourceId };
  let response: Response;
  try {
    response = await transport(`https://${connection.shop}.myshopify.com/admin/api/2026-10/graphql.json`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": token }, body: JSON.stringify({ query: queries[operation], variables }), signal: AbortSignal.timeout(15_000) });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  await requireProviderSuccess(response, "Shopify", false);
  const payload = await readProviderJson(response, "Shopify");
  assertNoCredentialInProviderValue(payload, token);
  const root = object(payload), data = object(root?.data);
  if (!data || Array.isArray(root?.errors) && root.errors.length) throw new NodeFailure("SHOPIFY_QUERY_FAILED", "Shopify could not read this resource. Check the connection and access.", false);
  const readProduct = (value: unknown) => {
    const product = object(value);
    if (!product || typeof product.id !== "string" || !/^gid:\/\/shopify\/Product\/[1-9][0-9]{0,29}$/.test(product.id) || typeof product.title !== "string" || product.title.length > 512 || typeof product.status !== "string" || product.status.length > 50) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an invalid product.", false);
    return { id: product.id, title: product.title, status: product.status };
  };
  if (operation === "get-product") {
    const product = data.product === null ? null : readProduct(data.product);
    if (product && product.id !== config.resourceId) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned a different product.", false);
    return { status: "succeeded" as const, route: "success" as const, output: { product } };
  }
  if (operation === "get-order") {
    const order = object(data.order);
    if (data.order === null) return { status: "succeeded" as const, route: "success" as const, output: { order: null } };
    if (!order || order.id !== config.resourceId || typeof order.name !== "string" || order.name.length > 256 || typeof order.createdAt !== "string" || order.createdAt.length > 64 || !Number.isFinite(Date.parse(order.createdAt)) || !(order.displayFinancialStatus === null || typeof order.displayFinancialStatus === "string" && order.displayFinancialStatus.length <= 100) || typeof order.displayFulfillmentStatus !== "string" || order.displayFulfillmentStatus.length > 100) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an invalid order.", false);
    return { status: "succeeded" as const, route: "success" as const, output: { order: { id: order.id, name: order.name, createdAt: order.createdAt, displayFinancialStatus: order.displayFinancialStatus, displayFulfillmentStatus: order.displayFulfillmentStatus } } };
  }
  const products = object(data.products), page = object(products?.pageInfo);
  if (!products || !Array.isArray(products.nodes) || products.nodes.length > limit || !page || typeof page.hasNextPage !== "boolean" || !(page.endCursor === null || typeof page.endCursor === "string" && page.endCursor.length <= 1024 && !/[\s\u0000-\u001f\u007f]/.test(page.endCursor)) || page.hasNextPage && !page.endCursor) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an invalid product list.", false);
  return { status: "succeeded" as const, route: "success" as const, output: { products: products.nodes.map(readProduct), hasMore: page.hasNextPage, nextCursor: page.hasNextPage ? page.endCursor : null } };
}
