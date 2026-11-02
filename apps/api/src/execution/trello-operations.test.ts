import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { isRetryableFailure } from "./retry-policy";
import { executeTrelloOperation, findTrelloCards, listTrelloCards, stopTrelloWriteRedirect } from "./trello-operations";

const board = "aaaaaaaaaaaaaaaaaaaaaaaa";
const list = "bbbbbbbbbbbbbbbbbbbbbbbb";
const cardId = "cccccccccccccccccccccccc";
const another = "dddddddddddddddddddddddd";
const credential = { apiKey: "fixturekey", token: "fixturetoken" };
const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.TRELLO);
  return credential;
} } as unknown as CredentialService;
const base = { credentialId: "connection", cardId };
const rawCard = (id = cardId, extra: Record<string, unknown> = {}) => ({ id, name: "Example", desc: "Description", idBoard: board, idList: list, closed: false, url: "https://trello.com/c/example", ...extra });
const failure = (code: string, retryable: boolean) => (error: unknown) => {
  const result = error as { code: string; retryable: boolean; message: string; statusCode?: number };
  assert.equal(result.code, code); assert.equal(result.retryable, retryable); assert.equal(isRetryableFailure(result), retryable);
  assert.doesNotMatch(result.message, /fixturetoken|fixturekey|provider-secret/);
  return true;
};

test("get uses the workspace Trello vault credential and returns normalized bounded fields", async () => {
  const result = await executeTrelloOperation("get", base, "live", "workspace", credentials, async (url, init) => {
    assert.equal(new URL(url).host, "api.trello.com"); assert.match(url, new RegExp(`/cards/${cardId}\\?`));
    assert.equal(init.method, "GET"); assert.equal((init.headers as Record<string, string>).authorization, 'OAuth oauth_consumer_key="fixturekey", oauth_token="fixturetoken"');
    assert.ok(!url.includes(credential.token));
    return Response.json(rawCard(cardId, { name: "x".repeat(600), desc: "d".repeat(17000), url: "https://evil.test/c/example", secret: "provider-secret" }));
  });
  assert.deepEqual(result.output, { id: cardId, name: "x".repeat(600), description: "d".repeat(17000), boardId: board, listId: list, closed: false, url: "" });
});

test("provider card content cannot echo either Trello credential into downstream output", async () => {
  const raw = rawCard(cardId, { name: "Card fixturetoken", desc: "API key fixturekey" });
  const read = await executeTrelloOperation("get", base, "live", "workspace", credentials, async () => Response.json(raw));
  const listResult = await listTrelloCards(credential, { boardId: board, limit: 2 }, async () => Response.json([raw]));
  const write = await executeTrelloOperation("update", { ...base, title: "Card fixturetoken" }, "live", "workspace", credentials, async () => Response.json(raw));
  for (const result of [read.output, listResult, write.output]) {
    assert.ok(!JSON.stringify(result).includes(credential.apiKey));
    assert.ok(!JSON.stringify(result).includes(credential.token));
  }
  assert.equal((read.output as { name: string }).name, "Card ");
});

test("credential echoes in card identity fail closed without inventing a cursor", async () => {
  const embeddedCredential = { apiKey: "fixturekey", token: cardId };
  const embeddedCredentials = { readForExecution: async () => embeddedCredential } as unknown as CredentialService;
  await assert.rejects(executeTrelloOperation("get", base, "live", "workspace", embeddedCredentials, async () => Response.json(rawCard())), failure("INVALID_PROVIDER_RESPONSE", false));
  await assert.rejects(executeTrelloOperation("archive", base, "live", "workspace", embeddedCredentials, async () => Response.json(rawCard(cardId, { closed: true }))), failure("DELIVERY_UNCERTAIN", false));
});

test("list asks for one extra card, scopes the board and returns a continuation", async () => {
  const result = await listTrelloCards(credential, { boardId: board, limit: 1, before: another, filter: "all" }, async (url) => {
    const target = new URL(url); assert.equal(target.pathname, `/1/boards/${board}/cards`);
    assert.equal(target.searchParams.get("limit"), "2"); assert.equal(target.searchParams.get("sort"), "-id");
    assert.equal(target.searchParams.get("before"), new Date(parseInt(another.slice(0, 8), 16) * 1000).toISOString()); assert.equal(target.searchParams.get("filter"), "all");
    return Response.json([rawCard(), rawCard(another)]);
  });
  assert.equal(result.count, 1); assert.equal(result.hasMore, true); assert.equal(result.nextBefore, cardId); assert.match(result.paginationWarning ?? "", /same second/);
  const empty = await listTrelloCards(credential, { boardId: board, limit: 1 }, async () => Response.json([]));
  assert.deepEqual(empty, { cards: [], count: 0, hasMore: false, nextBefore: null });
});

test("find uses provider search on the chosen board and bounds results", async () => {
  const result = await findTrelloCards(credential, { boardId: board, query: 'name:"Bug fix"', limit: 1 }, async (url) => {
    const target = new URL(url); assert.equal(target.pathname, "/1/search");
    assert.equal(target.searchParams.get("query"), 'name:"Bug fix"'); assert.equal(target.searchParams.get("idBoards"), board);
    assert.equal(target.searchParams.get("modelTypes"), "cards"); assert.equal(target.searchParams.get("cards_limit"), "2");
    return Response.json({ cards: [rawCard(), rawCard(another)] });
  });
  assert.equal(result.count, 1); assert.equal(result.hasMore, true);
  await assert.rejects(findTrelloCards(credential, { boardId: board, query: "x", limit: 1 }, async () => Response.json({ cards: [rawCard(cardId, { idBoard: another })] })), failure("INVALID_PROVIDER_RESPONSE", false));
});

test("update sends only explicit fields including an empty description", async () => {
  const result = await executeTrelloOperation("update", { ...base, title: " Updated ", description: "" }, "live", "workspace", credentials, async (_url, init) => {
    assert.equal(init.method, "PUT"); assert.deepEqual(JSON.parse(String(init.body)), { name: "Updated", desc: "" });
    return Response.json(rawCard(cardId, { name: "Updated", desc: "" }));
  });
  assert.equal((result.output as { name: string }).name, "Updated");
});

test("move checks destination membership and open state before PUT, including cross-board moves", async () => {
  const methods: string[] = [];
  const config = { ...base, boardId: board, listId: list };
  await executeTrelloOperation("move", config, "live", "workspace", credentials, async (url, init) => {
    methods.push(String(init.method));
    if (init.method === "GET") { assert.match(url, new RegExp(`/lists/${list}\\?`)); return Response.json({ id: list, idBoard: board, closed: false }); }
    assert.deepEqual(JSON.parse(String(init.body)), { idBoard: board, idList: list }); return Response.json(rawCard());
  });
  assert.deepEqual(methods, ["GET", "PUT"]);
  for (const invalid of [{ id: list, idBoard: another, closed: false }, { id: list, idBoard: board, closed: true }]) {
    let calls = 0;
    await assert.rejects(executeTrelloOperation("move", config, "live", "workspace", credentials, async () => { calls++; return Response.json(invalid); }), failure("INVALID_INPUT", false));
    assert.equal(calls, 1);
  }
});

test("archive uses closed=true and verifies the write receipt", async () => {
  const result = await executeTrelloOperation("archive", base, "live", "workspace", credentials, async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init.body)), { closed: true }); return Response.json(rawCard(cardId, { closed: true }));
  });
  assert.equal((result.output as { closed: boolean }).closed, true);
  await assert.rejects(executeTrelloOperation("archive", base, "live", "workspace", credentials, async () => Response.json(rawCard())), failure("DELIVERY_UNCERTAIN", false));
});

test("write failures and bad receipts never trigger automatic replay or expose error bodies", async () => {
  for (const status of [400, 401, 408, 429, 500, 503, 307]) {
    let calls = 0;
    await assert.rejects(executeTrelloOperation("archive", base, "live", "workspace", credentials, async () => { calls++; return new Response("provider-secret fixturetoken", { status }); }), failure(status >= 500 || status === 307 || status === 408 || status === 429 ? "DELIVERY_UNCERTAIN" : "TRELLO_WRITE_REJECTED", false));
    assert.equal(calls, 1);
  }
  for (const transport of [async () => { throw new Error("provider-secret fixturetoken"); }, async () => new Response("{broken"), async () => Response.json(rawCard(another)), async () => new Response("x".repeat(1_000_001))]) {
    await assert.rejects(executeTrelloOperation("archive", base, "live", "workspace", credentials, transport), failure("DELIVERY_UNCERTAIN", false));
  }
});

test("the write transport intercepts all followable redirects before they can be replayed", async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const redirected = new Response("provider-secret", { status, headers: { location: "https://api.trello.com/1/cards/elsewhere" } });
    const guarded = await stopTrelloWriteRedirect(redirected);
    assert.equal(guarded.status, 599); assert.equal(guarded.headers.get("location"), null); assert.equal(await guarded.text(), "");
    assert.equal(redirected.bodyUsed, true);
  }
  const success = Response.json(rawCard());
  assert.equal(await stopTrelloWriteRedirect(success), success);
});

test("read failures are bounded, redacted, and retryable only when appropriate", async () => {
  for (const status of [401, 429, 503]) {
    await assert.rejects(executeTrelloOperation("get", base, "live", "workspace", credentials, async () => new Response("provider-secret fixturetoken", { status })), failure("HTTP_ERROR", status !== 401));
  }
  await assert.rejects(executeTrelloOperation("get", base, "live", "workspace", credentials, async () => new Response("x".repeat(1_000_001))), failure("RESPONSE_TOO_LARGE", false));
  await assert.rejects(executeTrelloOperation("get", base, "live", "workspace", credentials, async () => Response.json(rawCard(another))), failure("INVALID_PROVIDER_RESPONSE", false));
});

test("invalid input fails before credential access or transport in live and mock mode", async () => {
  const never = { readForExecution: async () => { throw new Error("unexpected credential lookup"); } } as unknown as CredentialService;
  const transport = async () => { throw new Error("unexpected request"); };
  const cases: Array<["get" | "update" | "move" | "list" | "find", Record<string, unknown>]> = [
    ["get", { cardId: "../cards" }], ["update", { cardId }], ["update", { cardId, description: "x".repeat(16001) }],
    ["move", { cardId, boardId: board, listId: "invalid" }], ["list", { boardId: board, limit: 51 }],
    ["list", { boardId: board, before: "../../bad" }], ["find", { boardId: board, query: " " }],
  ];
  for (const [operation, config] of cases) for (const mode of ["mock", "live"] as const) await assert.rejects(executeTrelloOperation(operation, config, mode, "workspace", never, transport), failure("INVALID_INPUT", false));
  await assert.rejects(executeTrelloOperation("get", { cardId }, "live", "workspace", never, transport), failure("CREDENTIAL_REQUIRED", false));
});

test("mock mode is deterministic and makes no credential or network calls", async () => {
  const never = { readForExecution: async () => { throw new Error("unexpected credential lookup"); } } as unknown as CredentialService;
  const result = await executeTrelloOperation("list", { boardId: board }, "mock", "workspace", never, async () => { throw new Error("unexpected network"); });
  assert.equal(result.status, "succeeded"); assert.equal((result.output as { count: number }).count, 1);
});
