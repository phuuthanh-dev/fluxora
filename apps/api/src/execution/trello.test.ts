import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { isRetryableFailure } from "./retry-policy";
import { executeTrelloCreateCard, listTrelloBoards, listTrelloLists } from "./trello";

const board = "aaaaaaaaaaaaaaaaaaaaaaaa";
const list = "bbbbbbbbbbbbbbbbbbbbbbbb";
const card = "cccccccccccccccccccccccc";
const credential = { apiKey: "fixturekey", token: "fixturetoken" };
const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.TRELLO);
  return credential;
} } as unknown as CredentialService;
const config = { credentialId: "connection", boardId: board, listId: list, title: "Example", description: "Hello" };

test("board and list discovery uses scoped headers and returns bounded options", async () => {
  const urls: string[] = [];
  const transport = async (url: string, init: RequestInit) => {
    urls.push(url);
    assert.match(String((init.headers as Record<string, string>).authorization), /oauth_consumer_key=/);
    assert.ok(!url.includes(credential.token));
    return Response.json([{ id: urls.length === 1 ? board : list, name: "Example" }]);
  };
  assert.deepEqual(await listTrelloBoards(credential, transport), { boards: [{ id: board, name: "Example" }], hasMore: false });
  assert.deepEqual(await listTrelloLists(credential, board, transport), { lists: [{ id: list, name: "Example" }], hasMore: false });
  assert.match(urls[1]!, /boards\/a{24}\/lists/);
  await assert.rejects(listTrelloLists(credential, "../bad", transport), /Choose a Trello board/);
});

test("create validates the list belongs to the selected board before writing", async () => {
  const methods: string[] = [];
  const transport = async (_url: string, init: RequestInit) => {
    methods.push(String(init.method));
    if (init.method === "GET") return Response.json({ id: list, idBoard: board, closed: false });
    assert.deepEqual(JSON.parse(String(init.body)), { idList: list, name: "Example", desc: "Hello" });
    return Response.json({ id: card, name: "Example", idBoard: board, idList: list, url: "https://trello.com/c/example" });
  };
  assert.equal((await executeTrelloCreateCard(config, "live", "workspace", credentials, transport)).output.id, card);
  assert.deepEqual(methods, ["GET", "POST"]);
  methods.length = 0;
  await assert.rejects(executeTrelloCreateCard(config, "live", "workspace", credentials, async (_url, init) => {
    methods.push(String(init.method)); return Response.json({ id: list, idBoard: card, closed: false });
  }), /does not belong/);
  assert.deepEqual(methods, ["GET"]);
});

test("uncertain and rejected card writes never request automatic retry", async () => {
  for (const status of [429, 500, 503]) {
    await assert.rejects(executeTrelloCreateCard(config, "live", "workspace", credentials, async (_url, init) => init.method === "GET" ? Response.json({ id: list, idBoard: board, closed: false }) : new Response("", { status })), (error: unknown) => {
      const failure = error as { retryable: boolean; code: string; statusCode?: number };
      assert.equal(failure.retryable, false);
      assert.equal(isRetryableFailure(failure), false);
      return true;
    });
  }
  await assert.rejects(executeTrelloCreateCard(config, "live", "workspace", credentials, async (_url, init) => {
    if (init.method === "GET") return Response.json({ id: list, idBoard: board, closed: false });
    throw new Error("connection lost");
  }), /may have created the card/);
});
