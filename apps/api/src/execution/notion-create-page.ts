import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { NodeFailure } from "./node-failure";
import { readProviderJson, uncertainDelivery } from "./provider-request-policy";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const notionId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const sameId = (a: string, b: string) => a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();

async function writePage(url: string, method: "POST" | "PATCH", body: object, token: string, write: Transport): Promise<string> {
  let response: Response;
  try {
    response = await write(url, { method, headers: { authorization: `Bearer ${token}`, "notion-version": "2022-06-28", "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  } catch { throw uncertainDelivery("Notion"); }
  if (wasOutboundRedirected(response) || (response.status >= 300 && response.status < 400) || response.status === 408 || response.status === 429 || response.status >= 500) {
    await response.body?.cancel().catch(() => undefined);
    throw uncertainDelivery("Notion", response.status);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new NodeFailure("NOTION_WRITE_REJECTED", `Notion returned ${response.status}.`, false, response.status);
  }
  const result = await readProviderJson(response, "Notion", true);
  const page = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : undefined;
  if (!page || page.object !== "page" || typeof page.id !== "string" || !notionId.test(page.id) || page.id.includes(token)) throw uncertainDelivery("Notion", response.status);
  return page.id;
}

async function notionToken(config: Record<string, unknown>, workspaceId: string, credentials: CredentialService, resourceId: string) {
  const credentialId = typeof config.credentialId === "string" ? config.credentialId.trim() : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Notion connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.NOTION);
  const token = typeof credential.token === "string" ? credential.token : "";
  if (!token || token.length > 4096 || /[\s\u0000-\u001f\u007f-\u009f]/.test(token) || resourceId.includes(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Notion connection is invalid.", false);
  return token;
}

const titleProperty = (title: string) => ({ type: "title", title: [{ type: "text", text: { content: title } }] });

/** Create a child page, never retrying an ambiguous provider write. */
export async function executeNotionCreatePage(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, write: Transport = fetchSafeOutboundWrite) {
  const parentPageId = typeof config.parentPageId === "string" ? config.parentPageId.trim() : "";
  const title = typeof config.title === "string" ? config.title.trim() : "";
  const content = config.content;
  if (!notionId.test(parentPageId) || !title || title.length > 2000 || (Object.hasOwn(config, "content") && typeof content !== "string") || (typeof content === "string" && content.length > 2000)) {
    throw new NodeFailure("INVALID_INPUT", "Choose a parent page and enter a title and optional text of at most 2,000 characters each.", false);
  }
  if (mode === "mock") return { status: "succeeded" as const, output: { pageId: "00000000-0000-4000-8000-000000000001", parentPageId }, route: "success" as const };
  const token = await notionToken(config, workspaceId, credentials, parentPageId);
  const body = {
    parent: { type: "page_id", page_id: parentPageId },
    properties: { title: titleProperty(title) },
    ...(content ? { children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content } }] } }] } : {}),
  };
  const pageId = await writePage("https://api.notion.com/v1/pages", "POST", body, token, write);
  return { status: "succeeded" as const, output: { pageId, parentPageId }, route: "success" as const };
}

/** Replaces only the page's title; concurrent changes to that title can be overwritten. */
export async function executeNotionUpdateTitle(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, write: Transport = fetchSafeOutboundWrite) {
  const pageId = typeof config.pageId === "string" ? config.pageId.trim() : "";
  const title = typeof config.title === "string" ? config.title.trim() : "";
  if (!notionId.test(pageId) || !title || title.length > 2000) throw new NodeFailure("INVALID_INPUT", "Choose a page and enter a title of at most 2,000 characters.", false);
  const output = { pageId, updatedField: "title" };
  if (mode === "mock") return { status: "succeeded" as const, output, route: "success" as const };
  const token = await notionToken(config, workspaceId, credentials, pageId);
  const updatedId = await writePage(`https://api.notion.com/v1/pages/${pageId}`, "PATCH", { properties: { title: titleProperty(title) } }, token, write);
  if (!sameId(updatedId, pageId)) throw uncertainDelivery("Notion");
  return { status: "succeeded" as const, output, route: "success" as const };
}
