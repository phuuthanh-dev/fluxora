import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readProviderJson, requireProviderSuccess } from "./provider-request-policy";
import { assertNoCredentialInProviderValue } from "./provider-credential-safety";
import { validShopifyCredential } from "./shopify-credential";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
export async function executeShopifyOrders(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const issue = nodeConfigIssues("action.shopify.list-orders", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const limit = typeof config.limit === "number" ? config.limit : 20;
  const cursor = typeof config.cursor === "string" && config.cursor ? config.cursor : null;
  const orderName = typeof config.orderName === "string" && config.orderName ? config.orderName.replace(/^#/, "") : null;
  if (mode === "mock") return { status: "succeeded" as const, route: "success" as const, output: { orders: [{ id: "gid://shopify/Order/123", name: "#1001", createdAt: "2026-01-01T00:00:00Z", displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED" }], hasMore: false, nextCursor: null } };
  const data = await credentials.readForExecution(String(config.credentialId ?? ""), workspaceId, CredentialProvider.SHOPIFY);
  if (!validShopifyCredential(data)) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a Shopify store and Admin API access token.", false);
  const token = data.token as string;
  let response: Response;
  try {
    response = await transport(`https://${data.shop}.myshopify.com/admin/api/2026-10/graphql.json`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": token }, body: JSON.stringify({ query: "query Orders($first: Int!, $after: String, $search: String) { orders(first: $first, after: $after, query: $search, sortKey: CREATED_AT, reverse: true) { nodes { id name createdAt displayFinancialStatus displayFulfillmentStatus } pageInfo { hasNextPage endCursor } } }", variables: { first: limit, after: cursor, search: orderName ? `name:${orderName}` : null } }), signal: AbortSignal.timeout(15_000) });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  await requireProviderSuccess(response, "Shopify", false);
  const payload = await readProviderJson(response, "Shopify");
  assertNoCredentialInProviderValue(payload, token);
  const root = object(payload);
  if (Array.isArray(root?.errors) && root.errors.length) throw new NodeFailure("SHOPIFY_QUERY_FAILED", "Shopify could not read orders. Check the connection and order access.", false);
  const result = object(object(root?.data)?.orders);
  const pageInfo = object(result?.pageInfo);
  if (!result || !Array.isArray(result.nodes) || result.nodes.length > limit || !pageInfo || typeof pageInfo.hasNextPage !== "boolean" || !(pageInfo.endCursor === null || typeof pageInfo.endCursor === "string" && pageInfo.endCursor.length <= 1024 && !/[\s\u0000-\u001f\u007f]/.test(pageInfo.endCursor))) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an invalid order list.", false);
  const orders = result.nodes.map((entry: unknown) => {
    const row = object(entry);
    if (!row || typeof row.id !== "string" || !/^gid:\/\/shopify\/Order\/\d+$/.test(row.id) || typeof row.name !== "string" || row.name.length > 256 || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt)) || !(row.displayFinancialStatus === null || typeof row.displayFinancialStatus === "string" && row.displayFinancialStatus.length <= 100) || typeof row.displayFulfillmentStatus !== "string" || row.displayFulfillmentStatus.length > 100) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an invalid order.", false);
    return { id: row.id, name: row.name, createdAt: row.createdAt, displayFinancialStatus: row.displayFinancialStatus, displayFulfillmentStatus: row.displayFulfillmentStatus };
  });
  if (orderName && orders.some((order) => order.name.replace(/^#/, "").toLowerCase() !== orderName.toLowerCase())) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an order outside the requested filter.", false);
  if (pageInfo.hasNextPage && !pageInfo.endCursor) throw new NodeFailure("INVALID_RESPONSE", "Shopify did not return a continuation cursor.", false);
  return { status: "succeeded" as const, route: "success" as const, output: { orders, hasMore: pageInfo.hasNextPage, nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null } };
}
