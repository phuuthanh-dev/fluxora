import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { readProviderJson, requireProviderSuccess, uncertainDelivery } from "./provider-request-policy";
import { assertNoCredentialInProviderValue } from "./provider-credential-safety";
import { validShopifyCredential } from "./shopify-credential";

type Operation = "create-product" | "update-product" | "delete-product" | "create-order" | "update-order" | "delete-order";
type Transport = (url: string, init: RequestInit) => Promise<Response>;
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const mutations: Record<Operation, { field: string; query: string; result: "product" | "order" | "deletedId" }> = {
  "create-product": { field: "productCreate", result: "product", query: "mutation CreateProduct($product: ProductCreateInput!) { productCreate(product: $product) { product { id title status } userErrors { field message } } }" },
  "update-product": { field: "productUpdate", result: "product", query: "mutation UpdateProduct($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id title status } userErrors { field message } } }" },
  "delete-product": { field: "productDelete", result: "deletedId", query: "mutation DeleteProduct($input: ProductDeleteInput!) { productDelete(input: $input, synchronous: true) { deletedProductId userErrors { field message } } }" },
  "create-order": { field: "orderCreate", result: "order", query: "mutation CreateOrder($order: OrderCreateOrderInput!) { orderCreate(order: $order) { order { id name } userErrors { field message } } }" },
  "update-order": { field: "orderUpdate", result: "order", query: "mutation UpdateOrder($input: OrderInput!) { orderUpdate(input: $input) { order { id name } userErrors { field message } } }" },
  "delete-order": { field: "orderDelete", result: "deletedId", query: "mutation DeleteOrder($orderId: ID!) { orderDelete(orderId: $orderId) { deletedId userErrors { field message } } }" },
};

export async function executeShopifyWrite(config: Record<string, unknown>, operation: Operation, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutboundWrite) {
  const issue = nodeConfigIssues(`action.shopify.${operation}`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const id = config.resourceId as string;
  const mutation = mutations[operation];
  const variables = operation === "create-product" ? { product: { title: config.title, status: config.status || "DRAFT", ...(config.description ? { descriptionHtml: config.description } : {}), ...(config.productType ? { productType: config.productType } : {}) } }
    : operation === "update-product" ? { product: { id, ...(config.field === "status" ? { status: config.status } : config.field === "description" ? { descriptionHtml: config.description } : config.field === "productType" ? { productType: config.productType } : { title: config.title }) } }
    : operation === "delete-product" ? { input: { id } }
    : operation === "create-order" ? { order: { lineItems: [{ variantId: config.variantId, quantity: config.quantity }] } }
    : operation === "update-order" ? { input: { id, note: config.note } }
    : { orderId: id };
  const sample = operation.endsWith("product") ? { id: id || "gid://shopify/Product/123", title: String(config.title || "Sample product"), status: String(config.status || "DRAFT") } : { id: id || "gid://shopify/Order/123", name: "#1001" };
  if (mode === "mock") return { status: "succeeded" as const, route: "success" as const, output: mutation.result === "deletedId" ? { deletedId: id } : { [mutation.result]: sample } };
  const connection = await credentials.readForExecution(String(config.credentialId ?? ""), workspaceId, CredentialProvider.SHOPIFY);
  if (!validShopifyCredential(connection) || typeof connection.token !== "string") throw new NodeFailure("CREDENTIAL_INVALID", "Shopify connection is invalid.", false);
  const token = connection.token;
  let response: Response;
  try {
    response = await transport(`https://${connection.shop}.myshopify.com/admin/api/2026-10/graphql.json`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": token }, body: JSON.stringify({ query: mutation.query, variables }), signal: AbortSignal.timeout(15_000) });
  } catch { throw uncertainDelivery("Shopify"); }
  if (wasOutboundRedirected(response) || response.status === 429) { await response.body?.cancel().catch(() => undefined); throw uncertainDelivery("Shopify", response.status); }
  await requireProviderSuccess(response, "Shopify", true);
  const payload = await readProviderJson(response, "Shopify", true);
  try { assertNoCredentialInProviderValue(payload, token); } catch { throw uncertainDelivery("Shopify"); }
  const root = object(payload), result = object(object(root?.data)?.[mutation.field]);
  if (!result || !Array.isArray(result.userErrors) || Array.isArray(root?.errors) && root.errors.length) throw uncertainDelivery("Shopify");
  const value = mutation.result === "deletedId" ? (operation === "delete-product" ? result.deletedProductId : result.deletedId) : object(result[mutation.result]);
  if (result.userErrors.length) {
    if (value) throw uncertainDelivery("Shopify");
    throw new NodeFailure("SHOPIFY_REQUEST_REJECTED", "Shopify rejected this request. Check the connection, permissions, and selected values.", false);
  }
  const returnedId = mutation.result === "deletedId" ? value : object(value)?.id;
  const kind = operation.endsWith("product") ? "Product" : "Order";
  if (typeof returnedId !== "string" || !new RegExp(`^gid://shopify/${kind}/[1-9][0-9]{0,29}$`).test(returnedId) || (id && returnedId !== id)) throw uncertainDelivery("Shopify");
  if (mutation.result === "deletedId") return { status: "succeeded" as const, route: "success" as const, output: { deletedId: returnedId } };
  const record = object(value)!;
  if (mutation.result === "product") {
    if (typeof record.title !== "string" || record.title.length > 512 || typeof record.status !== "string" || record.status.length > 50) throw uncertainDelivery("Shopify");
    return { status: "succeeded" as const, route: "success" as const, output: { product: { id: returnedId, title: record.title, status: record.status } } };
  }
  if (typeof record.name !== "string" || record.name.length > 256) throw uncertainDelivery("Shopify");
  return { status: "succeeded" as const, route: "success" as const, output: { order: { id: returnedId, name: record.name } } };
}
