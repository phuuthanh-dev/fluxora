import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "./credential.service";
import { NodeFailure } from "../execution/node-failure";
import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { readProviderJson } from "../execution/provider-request-policy";
import { assertNoCredentialInProviderFields, assertNoCredentialInProviderValue } from "../execution/provider-credential-safety";
import { executeSentryListIssues } from "../execution/sentry";
import { executeVercelListDeployments } from "../execution/vercel";
import { listGitLabResources } from "../execution/gitlab";
import { jiraPickerJql, searchJiraIssues } from "../execution/jira";
import { executeShopifyOrders } from "../execution/shopify";
import { executeShopifyResource } from "../execution/shopify-resources";

export type ItemResource = "shopify-order" | "shopify-product" | "shopify-variant" | "jira-issue" | "gitlab-pipeline" | "gitlab-merge-request" | "github-label" | "sentry-issue" | "vercel-deployment";
export type ItemOptionPage = { items: Array<{ id: string; name: string }>; nextCursor: string | null; warning?: string };
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Options = { parent?: string; context?: string; query?: string; cursor?: string };

/** Fixed provider routes, owner authorization in the controller, minimal labels only. */
export async function discoverConnectorItems(resource: ItemResource, credentialId: string, workspaceId: string, options: Options, credentials: CredentialService, read: Transport = fetchSafeOutbound): Promise<ItemOptionPage> {
  const { parent = "", context = "", query = "", cursor = "" } = options;
  if (query.length > 200 || cursor.length > 2048 || /[\u0000-\u001f]/.test(query + cursor)) throw new NodeFailure("INVALID_INPUT", "Use a valid resource search and continuation.", false);
  if (resource === "shopify-order") {
    const result = await executeShopifyOrders({ credentialId, limit: 25, ...(cursor ? { cursor } : {}) }, "live", workspaceId, credentials, read);
    return { items: result.output.orders.map((item) => ({ id: item.id, name: item.name })), nextCursor: result.output.nextCursor };
  }
  if (resource === "shopify-product") {
    const result = await executeShopifyResource({ credentialId, limit: 25, ...(cursor ? { cursor } : {}) }, "list-products", "live", workspaceId, credentials, read);
    if (!("products" in result.output) || !result.output.products) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an invalid product list.", false);
    return { items: result.output.products.map((item) => ({ id: item.id, name: item.title })), nextCursor: result.output.nextCursor ?? null };
  }
  if (resource === "shopify-variant") {
    if (cursor && (cursor.length > 1024 || /[\s\u0000-\u001f\u007f]/.test(cursor))) throw new NodeFailure("INVALID_INPUT", "Enter a valid cursor.", false);
    const data = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SHOPIFY);
    const token = typeof data.token === "string" ? data.token : "";
    if (typeof data.shop !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(data.shop) || !/^[\x21-\x7e]{1,4096}$/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Shopify connection is invalid.", false);
    const response = await read(`https://${data.shop}.myshopify.com/admin/api/2026-10/graphql.json`, { method: "POST", headers: { "content-type": "application/json", "x-shopify-access-token": token }, body: JSON.stringify({ query: "query Variants($after: String) { productVariants(first: 25, after: $after) { nodes { id title product { title } } pageInfo { hasNextPage endCursor } } }", variables: { after: cursor || null } }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) { await response.body?.cancel(); throw new NodeFailure("HTTP_ERROR", `Shopify returned ${response.status}.`, false, response.status); }
    const payload = await readProviderJson(response, "Shopify");
    assertNoCredentialInProviderValue(payload, token);
    const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
    const root = record(payload), variants = record(record(root?.data)?.productVariants), page = record(variants?.pageInfo);
    if (Array.isArray(root?.errors) && root.errors.length || !variants || !Array.isArray(variants.nodes) || variants.nodes.length > 25 || !page || typeof page.hasNextPage !== "boolean" || !(page.endCursor === null || typeof page.endCursor === "string" && page.endCursor.length <= 1024 && !/[\s\u0000-\u001f\u007f]/.test(page.endCursor)) || page.hasNextPage && !page.endCursor) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an invalid product list.", false);
    const items = variants.nodes.map((entry: unknown) => {
      const row = record(entry), product = record(row?.product);
      if (!row || typeof row.id !== "string" || !/^gid:\/\/shopify\/ProductVariant\/[1-9][0-9]{0,29}$/.test(row.id) || typeof row.title !== "string" || row.title.length > 256 || typeof product?.title !== "string" || product.title.length > 256) throw new NodeFailure("INVALID_RESPONSE", "Shopify returned an invalid product.", false);
      assertNoCredentialInProviderFields([row.id, row.title, product.title], token);
      return { id: row.id, name: `${product.title} · ${row.title}` };
    });
    return { items, nextCursor: page.hasNextPage ? page.endCursor as string : null };
  }
  if (resource === "jira-issue") {
    const result = await searchJiraIssues(credentialId, workspaceId, credentials, jiraPickerJql(query), cursor, 25, read);
    return { items: result.items.map((item) => ({ id: item.key, name: `${item.key} · ${item.summary}` })), nextCursor: result.nextCursor };
  }
  if (resource === "gitlab-pipeline" || resource === "gitlab-merge-request") {
    if (cursor && !/^[1-9]\d{0,4}$/.test(cursor)) throw new NodeFailure("INVALID_INPUT", "Use a valid GitLab page.", false);
    const data = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITLAB);
    const result = await listGitLabResources(String(data.token ?? ""), parent, resource === "gitlab-pipeline" ? "pipelines" : "merge_requests", cursor ? Number(cursor) : 1, read);
    return { items: result.items, nextCursor: result.nextPage ? String(result.nextPage) : null };
  }
  if (resource === "github-label") {
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(parent) || parent.length > 200 || parent.split("/").some((part) => part === "." || part === "..") || (cursor && !/^[1-9]\d{0,3}$/.test(cursor))) throw new NodeFailure("INVALID_INPUT", "Choose a repository and valid page.", false);
    const data = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITHUB);
    const token = typeof data.token === "string" ? data.token.trim() : "";
    if (!token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Reconnect GitHub.", false);
    const page = cursor ? Number(cursor) : 1;
    const response = await read(`https://api.github.com/repos/${parent.split("/").map(encodeURIComponent).join("/")}/labels?per_page=50&page=${page}`, { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Fluxora" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); throw new NodeFailure("HTTP_ERROR", `GitHub returned ${response.status}.`, false, response.status); }
    const payload = await readProviderJson(response, "GitHub", false);
    if (!Array.isArray(payload) || payload.length > 50) throw new NodeFailure("INVALID_RESPONSE", "GitHub returned invalid labels.", false);
    const items = payload.map((entry: unknown) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 50 || /[\u0000-\u001f\u007f]/.test(item.name)) throw new NodeFailure("INVALID_RESPONSE", "GitHub returned an invalid label.", false);
      assertNoCredentialInProviderFields([item.name], token);
      return { id: item.name, name: item.name };
    });
    const next = (response.headers.get("link") ?? "").split(",").some((v) => /rel="next"/.test(v));
    return { items, nextCursor: next && page < 9999 ? String(page + 1) : null };
  }
  if (resource === "sentry-issue") {
    const result = await executeSentryListIssues({ credentialId, organization: context, project: parent, status: "all", limit: 25, ...(cursor ? { cursor } : {}) }, "live", workspaceId, credentials, read);
    return { items: result.output.issues.filter((item) => /^\d+$/.test(item.id)).map((item) => ({ id: item.id, name: `${item.shortId || item.id} · ${item.title}` })), nextCursor: result.output.nextCursor ?? null, ...(result.output.partial ? { warning: "Some Sentry results or continuation may be unavailable." } : {}) };
  }
  const result = await executeVercelListDeployments({ credentialId, team: context || "personal", project: parent, limit: 25, ...(cursor ? { cursor } : {}) }, "live", workspaceId, credentials, read);
  return { items: result.output.deployments.map((item) => ({ id: item.id, name: `${item.name} · ${item.state} · ${item.id}` })), nextCursor: result.output.nextCursor ?? null, ...(result.output.partial ? { warning: "Some Vercel results or continuation may be unavailable." } : {}) };
}
