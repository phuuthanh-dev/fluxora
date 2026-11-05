import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import { Agent } from "undici";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { createSafeSocketLookup, fetchSafeOutbound, wasOutboundRedirected } from "./outbound-url-policy";
import { readProviderJson, requireProviderSuccess, uncertainDelivery } from "./provider-request-policy";
import { trelloPageBoundary } from "./trello-pagination";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Operation = "get" | "update" | "move" | "archive" | "list" | "find";
const idPattern = /^[a-f0-9]{24}$/i;
const fields = "id,name,desc,idBoard,idList,closed,url";
const writeDispatcher = new Agent({ connect: { lookup: createSafeSocketLookup() } });

/** Turn a redirect into an uncertain response before the shared transport can follow it. */
export async function stopTrelloWriteRedirect(response: Response): Promise<Response> {
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    await response.body?.cancel().catch(() => undefined);
    return new Response(null, { status: 599 });
  }
  return response;
}

// fetchSafeOutbound normally follows same-origin redirects, including 307/308
// with the original method. Intercept every redirect before it can replay a PUT.
const safeWriteTransport: Transport = (url, init) => fetchSafeOutbound(url, init, {
  fetchImplementation: async (target, requestInit) => {
    const response = await fetch(target, { ...requestInit, dispatcher: writeDispatcher } as unknown as RequestInit);
    return stopTrelloWriteRedirect(response);
  },
});

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function resourceId(value: unknown, label: string): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw new NodeFailure("INVALID_INPUT", `Choose a valid Trello ${label} ID.`, false);
  return value;
}
function authorization(credential: Record<string, unknown>) {
  const { apiKey, token } = credential;
  if (typeof apiKey !== "string" || typeof token !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(apiKey) || !/^[A-Za-z0-9_-]{1,512}$/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Trello connection requires an API key and token.", false);
  return `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`;
}
async function request(path: string, credential: Record<string, unknown>, transport: Transport, body?: Record<string, string | boolean>) {
  const write = body !== undefined;
  const auth = authorization(credential);
  let response: Response;
  try {
    response = await transport(`https://api.trello.com/1/${path}`, {
      method: write ? "PUT" : "GET",
      headers: { authorization: auth, accept: "application/json", ...(write ? { "content-type": "application/json" } : {}) },
      ...(write ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (write) throw uncertainDelivery("Trello");
    throw nodeFailureFromOutboundPolicy(error);
  }
  // Even a successful response following a redirect cannot prove the PUT's outcome.
  if (write && (wasOutboundRedirected(response) || (response.status >= 300 && response.status < 400))) {
    await response.body?.cancel().catch(() => undefined);
    throw uncertainDelivery("Trello", response.status);
  }
  if (write && (response.status === 408 || response.status === 429)) {
    await response.body?.cancel().catch(() => undefined);
    throw uncertainDelivery("Trello", response.status);
  }
  if (write && !response.ok && response.status < 500) {
    await response.body?.cancel().catch(() => undefined);
    throw new NodeFailure("TRELLO_WRITE_REJECTED", `Trello returned ${response.status}.`, false, response.status);
  }
  await requireProviderSuccess(response, "Trello", write);
  return readProviderJson(response, "Trello", write);
}
function card(value: unknown, write = false) {
  const item = object(value);
  if (!item || typeof item.id !== "string" || !idPattern.test(item.id) || typeof item.idBoard !== "string" || !idPattern.test(item.idBoard) || typeof item.idList !== "string" || !idPattern.test(item.idList) || typeof item.name !== "string" || typeof item.desc !== "string" || typeof item.closed !== "boolean") {
    if (write) throw uncertainDelivery("Trello");
    throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned an invalid card.", false);
  }
  const url = typeof item.url === "string" && /^https:\/\/trello\.com\/c\/[A-Za-z0-9_-]+(?:\/[^\s?#]*)?$/.test(item.url) ? item.url.slice(0, 2048) : "";
  return { id: item.id, name: item.name, description: item.desc, boardId: item.idBoard, listId: item.idList, closed: item.closed, url };
}

/** Remove credential echoes from provider-controlled text before any step sees it. */
function protectOutput<T>(value: T, credential: Record<string, unknown>, write = false): T {
  const secrets = [credential.apiKey, credential.token].filter((item): item is string => typeof item === "string" && item.length > 0).sort((a, b) => b.length - a.length);
  const invalid = () => { throw write ? uncertainDelivery("Trello") : new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned an unsafe identifier.", false); };
  const visit = (item: unknown, key = ""): unknown => {
    if (typeof item === "string") {
      if (["id", "boardId", "listId", "nextBefore", "url"].includes(key) && secrets.some((secret) => item.includes(secret))) return invalid();
      let clean = item;
      for (const secret of secrets) clean = clean.split(secret).join("");
      if (secrets.some((secret) => clean.includes(secret))) return invalid();
      return clean;
    }
    if (Array.isArray(item)) return item.map((entry) => visit(entry));
    const record = object(item);
    if (record) return Object.fromEntries(Object.entries(record).map(([name, entry]) => [name, visit(entry, name)]));
    return item;
  };
  return visit(value) as T;
}

/** One bounded provider page; before is Trello's creation-time cursor, not an offset. */
export async function listTrelloCards(credential: Record<string, unknown>, input: { boardId: string; limit: number; before?: string; filter?: "open" | "closed" | "all" | "visible" }, transport: Transport = fetchSafeOutbound) {
  const boardId = resourceId(input.boardId, "board");
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50 || (input.before !== undefined && !idPattern.test(input.before)) || (input.filter !== undefined && !["open", "closed", "all", "visible"].includes(input.filter))) throw new NodeFailure("INVALID_INPUT", "Invalid Trello card list parameters.", false);
  const beforeDate = input.before ? new Date(parseInt(input.before.slice(0, 8), 16) * 1000).toISOString() : undefined;
  const params = new URLSearchParams({ fields, filter: input.filter ?? "open", limit: String(input.limit + 1), sort: "-id", ...(beforeDate ? { before: beforeDate } : {}) });
  const result = await request(`boards/${boardId}/cards?${params}`, credential, transport);
  if (!Array.isArray(result) || result.length > input.limit + 1) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned an invalid card list.", false);
  const cards = result.map((item) => card(item));
  if (cards.some((item) => item.boardId.toLowerCase() !== boardId.toLowerCase())) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned a card from another board.", false);
  const hasMore = cards.length > input.limit;
  const page = cards.slice(0, input.limit);
  const boundary = trelloPageBoundary(cards.map((item) => item.id), input.limit, input.before);
  if (boundary.invalidCutoff) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned cards outside the requested page boundary.", false);
  return protectOutput({ cards: page, count: page.length, hasMore, nextBefore: boundary.nextBefore, ...(boundary.warning ? { paginationWarning: boundary.warning } : {}) }, credential);
}

/** Search uses Trello's query language, scoped to one board; it is not exact-name matching. */
export async function findTrelloCards(credential: Record<string, unknown>, input: { boardId: string; query: string; limit: number; page?: number }, transport: Transport = fetchSafeOutbound) {
  const boardId = resourceId(input.boardId, "board");
  if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 200 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50 || (input.page !== undefined && (!Number.isInteger(input.page) || input.page < 0 || input.page > 100))) throw new NodeFailure("INVALID_INPUT", "Enter a Trello search query, limit between 1 and 50, and page between 0 and 100.", false);
  const fetchPage = async (limit: number, page?: number) => {
    const params = new URLSearchParams({ query: input.query, idBoards: boardId, modelTypes: "cards", card_fields: fields, cards_limit: String(limit), ...(page === undefined ? {} : { cards_page: String(page) }) });
    const result = object(await request(`search?${params}`, credential, transport));
    if (!result || !Array.isArray(result.cards) || result.cards.length > limit) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned an invalid search result.", false);
    const cards = result.cards.map((item) => card(item));
    if (cards.some((item) => item.boardId.toLowerCase() !== boardId.toLowerCase())) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned a card from another board.", false);
    return cards;
  };
  // Preserve the original output and single request for graphs saved before
  // page selection existed. Explicit page mode uses equal-sized pages so the
  // extra record used by the old first-page probe is never skipped.
  if (input.page === undefined) {
    const cards = await fetchPage(input.limit + 1);
    const page = cards.slice(0, input.limit);
    return protectOutput({ cards: page, count: page.length, hasMore: cards.length > input.limit }, credential);
  }
  const cards = await fetchPage(input.limit, input.page);
  const ids = new Set(cards.map((item) => item.id.toLowerCase()));
  if (ids.size !== cards.length) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned duplicate cards in a search page.", false);
  let hasMore: boolean | null = false;
  let paginationWarning: string | undefined;
  if (cards.length === input.limit) {
    if (input.page === 100) hasMore = null;
    else {
      const following = await fetchPage(input.limit, input.page + 1);
      const followingIds = new Set(following.map((item) => item.id.toLowerCase()));
      if (followingIds.size !== following.length) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned duplicate cards in a search page.", false);
      if (following.some((item) => ids.has(item.id.toLowerCase()))) {
        hasMore = null;
        paginationWarning = "Trello returned overlapping search pages. Refine the search before continuing.";
      } else hasMore = following.length > 0;
    }
  }
  return protectOutput({ cards, count: cards.length, page: input.page, hasMore, nextPage: hasMore === true ? input.page + 1 : null, continuationUnknown: hasMore === null, ...(paginationWarning ? { paginationWarning } : {}) }, credential);
}

export async function executeTrelloOperation(operation: Operation, config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport?: Transport) {
  if (!["get", "update", "move", "archive", "list", "find"].includes(operation)) throw new NodeFailure("INVALID_INPUT", "Invalid Trello operation.", false);
  const issue = nodeConfigIssues(`action.trello.${operation}-card${operation === "list" || operation === "find" ? "s" : ""}`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const optionalFields = operation === "list" ? ["limit", "before", "filter"] : operation === "find" ? ["limit", "searchPagination"] : operation === "update" ? ["title", "description"] : [];
  if (optionalFields.some((key) => Object.hasOwn(config, key) && config[key] === undefined)) throw new NodeFailure("INVALID_INPUT", "Trello configuration could not be resolved.", false);
  const isCollection = operation === "list" || operation === "find";
  const cardId = isCollection ? "" : resourceId(config.cardId, "card");
  const boardId = isCollection || operation === "move" ? resourceId(config.boardId, "board") : "";
  const listId = operation === "move" ? resourceId(config.listId, "list") : "";
  const limit = config.limit === undefined ? 20 : config.limit;
  const before = config.before === "" ? undefined : config.before;
  const filter = config.filter === undefined ? "open" : config.filter;
  if (isCollection && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50)) throw new NodeFailure("INVALID_INPUT", "Enter a limit between 1 and 50.", false);
  if (operation === "list" && ((before !== undefined && (typeof before !== "string" || !idPattern.test(before))) || typeof filter !== "string" || !["open", "closed", "all", "visible"].includes(filter))) throw new NodeFailure("INVALID_INPUT", "Invalid Trello card list parameters.", false);
  if (operation === "find" && (typeof config.query !== "string" || !config.query.trim() || config.query.length > 200)) throw new NodeFailure("INVALID_INPUT", "Enter a Trello search query of at most 200 characters.", false);
  if (operation === "find" && config.searchPagination !== undefined && (typeof config.searchPagination !== "string" || !["first", "pages"].includes(config.searchPagination))) throw new NodeFailure("INVALID_INPUT", "Choose a valid Trello search pagination mode.", false);
  const searchPage = operation === "find" && config.searchPagination === "pages" ? config.page : undefined;
  if (operation === "find" && config.searchPagination === "pages" && (typeof searchPage !== "number" || !Number.isInteger(searchPage) || searchPage < 0 || searchPage > 100)) throw new NodeFailure("INVALID_INPUT", "Enter a Trello search page between 0 and 100.", false);
  const changes: Record<string, string | boolean> = {};
  if (operation === "update") {
    if (config.title !== undefined) {
      if (typeof config.title !== "string" || !config.title.trim() || config.title.trim().length > 500) throw new NodeFailure("INVALID_INPUT", "Enter a card title of at most 500 characters.", false);
      changes.name = config.title.trim();
    }
    if (config.description !== undefined) {
      if (typeof config.description !== "string" || config.description.length > 16_000) throw new NodeFailure("INVALID_INPUT", "Enter a card description of at most 16000 characters.", false);
      changes.desc = config.description;
    }
    if (!Object.keys(changes).length) throw new NodeFailure("INVALID_INPUT", "Provide a title or description to update.", false);
  }
  if (operation === "move") { changes.idBoard = boardId; changes.idList = listId; }
  if (operation === "archive") changes.closed = true;
  const mockCard = { id: cardId || "cccccccccccccccccccccccc", name: typeof changes.name === "string" ? changes.name : "Example card", description: typeof changes.desc === "string" ? changes.desc : "", boardId: boardId || "aaaaaaaaaaaaaaaaaaaaaaaa", listId: listId || "bbbbbbbbbbbbbbbbbbbbbbbb", closed: operation === "archive", url: "https://trello.com/c/example" };
  if (mode === "mock") return { status: "succeeded" as const, output: isCollection ? { cards: [mockCard], count: 1, hasMore: false, ...(operation === "list" ? { nextBefore: null } : {}), ...(typeof searchPage === "number" ? { page: searchPage, nextPage: null, continuationUnknown: false } : {}) } : mockCard, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Trello connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.TRELLO);
  const readTransport = transport ?? fetchSafeOutbound;
  let output;
  if (operation === "list") output = await listTrelloCards(credential, { boardId, limit: limit as number, filter: filter as "open" | "closed" | "all" | "visible", ...(typeof before === "string" ? { before } : {}) }, readTransport);
  else if (operation === "find") output = await findTrelloCards(credential, { boardId, query: config.query as string, limit: limit as number, ...(typeof searchPage === "number" ? { page: searchPage } : {}) }, readTransport);
  else if (operation === "get") {
    output = card(await request(`cards/${cardId}?${new URLSearchParams({ fields })}`, credential, readTransport));
    if (output.id.toLowerCase() !== cardId.toLowerCase()) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Trello returned a different card.", false);
  } else {
    if (operation === "move") {
      const list = object(await request(`lists/${listId}?fields=id,idBoard,closed`, credential, readTransport));
      if (!list || typeof list.id !== "string" || list.id.toLowerCase() !== listId.toLowerCase() || typeof list.idBoard !== "string" || list.idBoard.toLowerCase() !== boardId.toLowerCase() || list.closed !== false) throw new NodeFailure("INVALID_INPUT", "The selected list is closed or does not belong to the selected board.", false);
    }
    output = card(await request(`cards/${cardId}`, credential, transport ?? safeWriteTransport, changes), true);
    if (output.id.toLowerCase() !== cardId.toLowerCase() || (operation === "move" && (output.boardId.toLowerCase() !== boardId.toLowerCase() || output.listId.toLowerCase() !== listId.toLowerCase())) || (operation === "archive" && !output.closed) || (typeof changes.name === "string" && output.name !== changes.name) || (typeof changes.desc === "string" && output.description !== changes.desc)) throw uncertainDelivery("Trello");
  }
  return { status: "succeeded" as const, output: protectOutput(output, credential, !["get", "list", "find"].includes(operation)), route: "success" as const };
}
