import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type SearchInput = { token: string; query: string; pageSize: number; cursor?: string };

/** Search only pages shared with the connection; never return a provider token. */
export async function searchNotionPages(input: SearchInput, transport: Transport = fetchSafeOutbound) {
  if (!input.token || input.token.length > 4096 || /\s/.test(input.token) || typeof input.query !== "string" || input.query.length > 200 || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100 || (input.cursor !== undefined && !/^[a-f0-9-]{32,36}$/i.test(input.cursor))) {
    throw new NodeFailure("INVALID_INPUT", "Invalid Notion search parameters.", false);
  }
  let response: Response;
  try {
    response = await transport("https://api.notion.com/v1/search", {
      method: "POST",
      headers: { authorization: `Bearer ${input.token}`, "content-type": "application/json", "notion-version": "2022-06-28" },
      body: JSON.stringify({ query: input.query, page_size: input.pageSize, filter: { value: "page", property: "object" }, ...(input.cursor ? { start_cursor: input.cursor } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Notion returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  let payload: unknown;
  try { payload = await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Notion returned an invalid page list.", false); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new NodeFailure("INVALID_RESPONSE", "Notion returned an invalid page list.", false);
  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.results) || typeof root.has_more !== "boolean" || !(root.next_cursor === null || typeof root.next_cursor === "string")) throw new NodeFailure("INVALID_RESPONSE", "Notion returned an invalid page list.", false);
  const pages = root.results.slice(0, input.pageSize).flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const page = item as Record<string, unknown>;
    if (page.object !== "page" || typeof page.id !== "string" || !/^[a-f0-9-]{32,36}$/i.test(page.id)) return [];
    const properties = page.properties && typeof page.properties === "object" && !Array.isArray(page.properties) ? Object.values(page.properties as Record<string, unknown>) : [];
    const titleProperty = properties.find((p) => p && typeof p === "object" && !Array.isArray(p) && (p as Record<string, unknown>).type === "title") as Record<string, unknown> | undefined;
    const title = Array.isArray(titleProperty?.title) ? titleProperty.title.map((part: unknown) => part && typeof part === "object" && typeof (part as Record<string, unknown>).plain_text === "string" ? (part as Record<string, string>).plain_text : "").join("").slice(0, 300) : "";
    return [{ id: page.id, title: title || "Untitled page" }];
  });
  return { pages, hasMore: root.has_more, nextCursor: root.next_cursor as string | null };
}

export async function executeNotionSearch(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, search: typeof searchNotionPages = searchNotionPages) {
  const query = typeof config.query === "string" ? config.query : "";
  const pageSize = config.pageSize === undefined ? 20 : config.pageSize;
  if (query.length > 200 || typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new NodeFailure("INVALID_INPUT", "Enter a search term and a limit between 1 and 100.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { pages: [{ id: "01234567-89ab-cdef-0123-456789abcdef", title: "Example page" }], hasMore: false, nextCursor: null }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Notion connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.NOTION);
  const token = typeof credential.token === "string" ? credential.token : "";
  return { status: "succeeded" as const, output: await search({ token, query, pageSize }), route: "success" as const };
}
