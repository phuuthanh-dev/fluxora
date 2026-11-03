import { NodeFailure, nodeFailureFromOutboundPolicy } from "../execution/node-failure";
import { searchNotionPages, validNotionCursor } from "../execution/notion-search";
import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { readBoundedProviderJson } from "../execution/provider-json";
import { trelloPageBoundary } from "../execution/trello-pagination";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const trelloId = /^[a-f0-9]{24}$/i;

/** One bounded page of open cards, restricted to the selected board. */
export async function listTrelloCards(credential: Record<string, unknown>, board: string, transport: Transport = fetchSafeOutbound, before?: string) {
  if (typeof board !== "string" || !trelloId.test(board) || (before !== undefined && !trelloId.test(before))) throw new NodeFailure("INVALID_INPUT", "Choose a Trello board and valid continuation.", false);
  const { apiKey, token } = credential;
  if (typeof apiKey !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(apiKey) || typeof token !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(token)) {
    throw new NodeFailure("CREDENTIAL_INVALID", "Trello connection requires an API key and token.", false);
  }
  let response: Response;
  try {
    const beforeDate = before ? new Date(parseInt(before.slice(0, 8), 16) * 1000).toISOString() : undefined;
    const params = new URLSearchParams({ filter: "open", fields: "name,idBoard", limit: "101", sort: "-id", ...(beforeDate ? { before: beforeDate } : {}) });
    response = await transport(`https://api.trello.com/1/boards/${board}/cards?${params}`, {
      method: "GET", headers: { authorization: `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`, accept: "application/json" }, signal: AbortSignal.timeout(10_000),
    });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Trello returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  let payload: unknown;
  try { payload = await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Trello returned an invalid card list.", false); }
  if (!Array.isArray(payload)) throw new NodeFailure("INVALID_RESPONSE", "Trello returned an invalid card list.", false);
  if (payload.length > 101) throw new NodeFailure("INVALID_RESPONSE", "Trello returned an invalid card list.", false);
  const allCards = payload.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new NodeFailure("INVALID_RESPONSE", "Trello returned an invalid card list.", false);
    const card = value as Record<string, unknown>;
    if (typeof card.id !== "string" || !trelloId.test(card.id) || card.id.includes(apiKey) || card.id.includes(token) || typeof card.idBoard !== "string" || card.idBoard.toLowerCase() !== board.toLowerCase() || typeof card.name !== "string") throw new NodeFailure("INVALID_RESPONSE", "Trello returned an invalid card list.", false);
    // The response is sent to the browser, so sanitize before truncating:
    // a credential can straddle the 300-character display boundary.
    const name = card.name.split(apiKey).join("[REDACTED]").split(token).join("[REDACTED]");
    return { id: card.id, name: name.slice(0, 300) };
  });
  const cards = allCards.slice(0, 100);
  const hasMore = payload.length > 100;
  const boundary = trelloPageBoundary(allCards.map((item) => item.id), 100, before);
  if (boundary.invalidCutoff) throw new NodeFailure("INVALID_RESPONSE", "Trello returned cards outside the requested page boundary.", false);
  return { cards, hasMore, nextBefore: boundary.nextBefore, ...(boundary.warning ? { warning: boundary.warning } : {}) };
}

/** Search only pages shared with this integration, using the existing pinned API version. */
export async function listNotionPages(credential: Record<string, unknown>, query: string, cursor?: string, transport: Transport = fetchSafeOutbound) {
  if (typeof query !== "string" || query.length > 200 || (cursor !== undefined && (typeof cursor !== "string" || !validNotionCursor(cursor)))) {
    throw new NodeFailure("INVALID_INPUT", "Invalid Notion search parameters.", false);
  }
  const token = typeof credential.token === "string" ? credential.token : "";
  const result = await searchNotionPages({ token, query, pageSize: 100, ...(cursor ? { cursor } : {}) }, transport);
  return result;
}
