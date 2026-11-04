import assert from "node:assert/strict";
import test from "node:test";
import { listNotionPages, listTrelloCards } from "./connector-resource-discovery";

const board = "aaaaaaaaaaaaaaaaaaaaaaaa";
const otherBoard = "bbbbbbbbbbbbbbbbbbbbbbbb";
const card = "cccccccccccccccccccccccc";
const page = "01234567-89ab-cdef-0123-456789abcdef";
const cursor = "11234567-89ab-cdef-0123-456789abcdef";
const trello = { apiKey: "fixture_key", token: "fixture_trello_token" };
const notion = { token: "fixture_notion_token" };

test("Trello card discovery sends credentials only in the header and bounds board-scoped metadata", async () => {
  const result = await listTrelloCards(trello, board, async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, `/1/boards/${board}/cards`);
    assert.equal(parsed.searchParams.get("sort"), "-id");
    assert.equal(parsed.searchParams.get("limit"), "101");
    assert.ok(!url.includes(trello.token) && !url.includes(trello.apiKey));
    assert.equal((init.headers as Record<string, string>).authorization, `OAuth oauth_consumer_key="${trello.apiKey}", oauth_token="${trello.token}"`);
    assert.equal(init.method, "GET");
    assert.ok(init.signal);
    return Response.json([
      { id: card, idBoard: board, name: "x".repeat(400), secret: trello.token },
      ...Array.from({ length: 100 }, (_, index) => ({ id: (0x65000000 - index).toString(16).padStart(8, "0") + "0".repeat(16), idBoard: board, name: "Card" })),
    ]);
  });
  assert.equal(result.hasMore, true);
  assert.equal(result.cards.length, 100);
  assert.equal(result.nextBefore, (0x65000000 - 98).toString(16).padStart(8, "0") + "0".repeat(16));
  assert.equal(result.cards[0]?.name.length, 300);
  assert.ok(!JSON.stringify(result).includes(trello.token));
  await assert.rejects(listTrelloCards(trello, board, async () => Response.json([{ id: card, idBoard: otherBoard, name: "wrong board" }])));
});

test("Trello discovery warns and stops pagination for an ambiguous boundary", async () => {
  const result = await listTrelloCards(trello, board, async () => Response.json(Array.from({ length: 101 }, () => ({ id: card, idBoard: board, name: "Card" }))));
  assert.equal(result.hasMore, true);
  assert.equal(result.nextBefore, null);
  assert.match(result.warning ?? "", /ambiguous/);
});

test("Trello rejects unsafe board IDs and malformed credentials before transport", async () => {
  let calls = 0;
  const transport = async () => { calls++; return Response.json([]); };
  for (const invalid of ["../cards", "https://evil.example", "", "a".repeat(25)]) {
    await assert.rejects(listTrelloCards(trello, invalid, transport));
  }
  await assert.rejects(listTrelloCards({ ...trello, token: 'bad"token' }, board, transport));
  assert.equal(calls, 0);
});

test("Trello discovery redacts credentials in card names before truncation and rejects credential-shaped IDs", async () => {
  const result = await listTrelloCards(trello, board, async () => Response.json([
    { id: card, idBoard: board, name: `${"x".repeat(295)}${trello.token}` },
    { id: card, idBoard: board, name: `Card ${trello.apiKey} ${trello.token}` },
  ]));
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(trello.apiKey) && !serialized.includes(trello.token));
  assert.ok(!result.cards[0]!.name.includes(trello.token.slice(0, 5)));
  assert.match(result.cards[1]!.name, /\[REDACTED\]/);
  await assert.rejects(listTrelloCards({ apiKey: trello.apiKey, token: card }, board, async () => Response.json([{ id: card, idBoard: board, name: "Card" }])));
});

test("Notion discovery uses shared-page search, preserves cursor and projects only metadata", async () => {
  const result = await listNotionPages(notion, "roadmap", cursor, async (url, init) => {
    assert.equal(url, "https://api.notion.com/v1/search");
    assert.equal(init.method, "POST");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.authorization, `Bearer ${notion.token}`);
    assert.equal(headers["notion-version"], "2022-06-28");
    assert.deepEqual(JSON.parse(String(init.body)), { query: "roadmap", page_size: 100, filter: { value: "page", property: "object" }, start_cursor: cursor });
    return Response.json({ results: [
      { object: "page", id: page, properties: { Title: { type: "title", title: [{ plain_text: "Roadmap" }] } }, private: notion.token },
      { object: "page", id: cursor, properties: {} },
      { object: "database", id: page },
    ], has_more: true, next_cursor: cursor });
  });
  assert.deepEqual(result, { pages: [{ id: page, title: "Roadmap" }, { id: cursor, title: "Untitled page" }], hasMore: true, nextCursor: cursor });
  assert.ok(!JSON.stringify(result).includes(notion.token));
});

test("Notion rejects unsafe search inputs and provider cursors", async () => {
  let calls = 0;
  const transport = async () => { calls++; return Response.json({ results: [], has_more: true, next_cursor: "x".repeat(1025) }); };
  await assert.rejects(listNotionPages(notion, "x".repeat(201), undefined, transport));
  await assert.rejects(listNotionPages(notion, "", "invalid\ncursor", transport));
  assert.equal(calls, 0);
  await assert.rejects(listNotionPages(notion, "", undefined, transport), /invalid page list/);
  assert.equal(calls, 1);
});

test("Notion discovery masks credentials across title fragments and rejects them in cursors", async () => {
  const result = await listNotionPages(notion, "", undefined, async () => Response.json({ results: [
    { object: "page", id: page, properties: { Title: { type: "title", title: [{ plain_text: "Title fixture_notion_" }, { plain_text: "token" }] } } },
  ], has_more: false, next_cursor: null }));
  assert.equal(result.pages[0]?.title, "Title [REDACTED]");
  await assert.rejects(listNotionPages(notion, "", undefined, async () => Response.json({ results: [], has_more: true, next_cursor: `cursor-${notion.token}` })), (error: unknown) => !String(error).includes(notion.token));
});

test("Notion limits returned options even if the provider returns too many", async () => {
  const result = await listNotionPages(notion, "", undefined, async (_url, init) => {
    assert.ok(!("start_cursor" in JSON.parse(String(init.body))));
    return Response.json({ results: Array.from({ length: 101 }, () => ({ object: "page", id: page, properties: {} })), has_more: true, next_cursor: cursor });
  });
  assert.equal(result.pages.length, 100);
  assert.equal(result.hasMore, true);
});

test("discovery rejects provider errors, invalid JSON and oversized responses", async () => {
  for (const discover of [
    (transport: (url: string, init: RequestInit) => Promise<Response>) => listTrelloCards(trello, board, transport),
    (transport: (url: string, init: RequestInit) => Promise<Response>) => listNotionPages(notion, "", undefined, transport),
  ]) {
    await assert.rejects(discover(async () => new Response("secret provider body", { status: 403 })), (error: unknown) => {
      assert.ok(!String(error).includes("secret provider body")); return true;
    });
    await assert.rejects(discover(async () => new Response("not json")));
    await assert.rejects(discover(async () => new Response("x".repeat(1_000_001))));
  }
});
