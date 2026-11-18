import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CredentialService } from "../credentials/credential.service";
import { executeTrelloCardAction } from "./trello-card-actions";
import { listTrelloLabels } from "./trello";

const cardId = "c".repeat(24);
const labelId = "b".repeat(24);
const boardId = "a".repeat(24);
const credential = { apiKey: "testkey", token: "testtoken" };
const credentials = { readForExecution: async () => credential } as unknown as CredentialService;

test("Trello label discovery returns only the selected board's bounded labels", async () => {
  const result = await listTrelloLabels(credential, boardId, async (url, init) => {
    assert.match(url, /\/boards\/a{24}\/labels\?/);
    assert.match(String((init.headers as Record<string, string>).authorization), /testtoken/);
    return Response.json([{ id: labelId, name: "Urgent", color: "red", idBoard: boardId }]);
  });
  assert.deepEqual(result, { labels: [{ id: labelId, name: "Urgent" }], hasMore: false });
  await assert.rejects(listTrelloLabels(credential, boardId, async () => Response.json([{ id: labelId, name: "Urgent", idBoard: cardId }])), /invalid/i);
});

test("Trello comment uses the documented endpoint and never retries an uncertain write", async () => {
  let calls = 0;
  const config = { credentialId: "connection", cardId, text: "Hello" };
  const result = await executeTrelloCardAction("add-comment", config, "live", "workspace", credentials, async (url, init) => {
    calls++;
    assert.equal(init.method, "POST");
    assert.equal(new URL(url).searchParams.get("text"), "Hello");
    return Response.json({ id: "d".repeat(24) });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.output, { cardId, commentId: "d".repeat(24) });
  await assert.rejects(executeTrelloCardAction("add-comment", config, "live", "workspace", credentials, async () => new Response("", { status: 503 })), (error: unknown) => {
    assert.equal((error as { retryable: boolean }).retryable, false);
    return true;
  });
});

test("Trello label changes check card and label belong to the same board", async () => {
  for (const operation of ["add-label", "remove-label"] as const) {
    let writes = 0;
    const config = { credentialId: "connection", cardId, labelId };
    const transport = async (url: string, init: RequestInit) => {
      if (!init.method) return Response.json({ id: url.includes("/cards/") ? cardId : labelId, idBoard: boardId });
      writes++;
      assert.equal(init.method, operation === "add-label" ? "POST" : "DELETE");
      if (operation === "add-label") assert.equal(new URL(url).searchParams.get("value"), labelId);
      return Response.json({});
    };
    await executeTrelloCardAction(operation, config, "live", "workspace", credentials, transport);
    assert.equal(writes, 1);
    await assert.rejects(executeTrelloCardAction(operation, config, "live", "workspace", credentials, async (url, init) => {
      if (init.method) throw new Error("unexpected write");
      return Response.json({ id: url.includes("/cards/") ? cardId : labelId, idBoard: url.includes("/cards/") ? boardId : cardId });
    }), /label/i);
  }
});
