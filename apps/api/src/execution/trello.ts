import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const idPattern = /^[a-f0-9]{24}$/i;

function auth(data: Record<string, unknown>) {
  const apiKey = typeof data.apiKey === "string" ? data.apiKey : "";
  const token = typeof data.token === "string" ? data.token : "";
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(apiKey) || !/^[A-Za-z0-9_-]{1,512}$/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Trello connection requires an API key and token.", false);
  return `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

async function trelloRequest(path: string, credential: Record<string, unknown>, transport: Transport, body?: Record<string, string>) {
  const authorization = auth(credential);
  let response: Response;
  try {
    response = await transport(`https://api.trello.com/1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { authorization, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const failure = nodeFailureFromOutboundPolicy(error);
    if (!body || failure.code.startsWith("OUTBOUND_")) throw failure;
    throw new NodeFailure("DELIVERY_UNCERTAIN", "Trello may have created the card. Check the list before retrying.", false);
  }
  if (!response.ok) {
    if (body && response.status >= 500) throw new NodeFailure("DELIVERY_UNCERTAIN", "Trello may have created the card. Check the list before retrying.", false);
    // Create is not idempotent. Do not attach a retry-classifying status to writes.
    if (body) throw new NodeFailure("TRELLO_WRITE_REJECTED", `Trello returned ${response.status}.`, false);
    throw new NodeFailure("HTTP_ERROR", `Trello returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  }
  try { return await readBoundedProviderJson(response); }
  catch (error) {
    if (body) throw new NodeFailure("DELIVERY_UNCERTAIN", "Trello may have created the card. Check the list before retrying.", false);
    if (error instanceof NodeFailure) throw error;
    throw new NodeFailure("INVALID_RESPONSE", "Trello returned an invalid response.", false);
  }
}

function mapOptions(value: unknown, name: "boards" | "lists") {
  if (!Array.isArray(value)) throw new NodeFailure("INVALID_RESPONSE", "Trello returned an invalid resource list.", false);
  const options = value.flatMap((entry: unknown) => {
    const item = object(entry);
    return item && typeof item.id === "string" && idPattern.test(item.id) && typeof item.name === "string" ? [{ id: item.id, name: item.name.slice(0, 300) }] : [];
  });
  return { [name]: options.slice(0, 100), hasMore: options.length > 100 };
}

export async function listTrelloBoards(credential: Record<string, unknown>, transport: Transport = fetchSafeOutbound) {
  return mapOptions(await trelloRequest("members/me/boards?filter=open&fields=name", credential, transport), "boards");
}

export async function listTrelloLists(credential: Record<string, unknown>, boardId: string, transport: Transport = fetchSafeOutbound) {
  if (!idPattern.test(boardId)) throw new NodeFailure("INVALID_INPUT", "Choose a Trello board.", false);
  return mapOptions(await trelloRequest(`boards/${boardId}/lists?filter=open&fields=name`, credential, transport), "lists");
}

export async function executeTrelloCreateCard(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const boardId = typeof config.boardId === "string" ? config.boardId.trim() : "";
  const listId = typeof config.listId === "string" ? config.listId.trim() : "";
  const title = typeof config.title === "string" ? config.title.trim() : "";
  const description = typeof config.description === "string" ? config.description : "";
  if (!idPattern.test(boardId) || !idPattern.test(listId) || !title || title.length > 500 || description.length > 16_000) throw new NodeFailure("INVALID_INPUT", "Choose a board and list, and enter a card title of at most 500 characters.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { id: "0123456789abcdef01234567", name: title, boardId, listId, url: "https://trello.com/c/example" }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Trello connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.TRELLO);
  const list = object(await trelloRequest(`lists/${listId}?fields=id,idBoard,closed`, credential, transport));
  if (!list || list.id !== listId || list.idBoard !== boardId || list.closed !== false) throw new NodeFailure("INVALID_INPUT", "The selected list is closed or does not belong to the selected board.", false);
  const result = object(await trelloRequest("cards", credential, transport, { idList: listId, name: title, desc: description }));
  if (!result || typeof result.id !== "string" || !idPattern.test(result.id) || typeof result.name !== "string" || result.idList !== listId || result.idBoard !== boardId) throw new NodeFailure("DELIVERY_UNCERTAIN", "Trello may have created the card. Check the list before retrying.", false);
  const url = typeof result.url === "string" && /^https:\/\/trello\.com\/c\/[A-Za-z0-9_-]+(?:\/[^\s]*)?$/.test(result.url) ? result.url.slice(0, 2048) : "";
  return { status: "succeeded" as const, output: { id: result.id, name: result.name.slice(0, 500), boardId, listId, url }, route: "success" as const };
}
