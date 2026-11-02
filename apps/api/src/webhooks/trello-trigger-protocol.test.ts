import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizeTrelloAction, readTrelloCallbackUrl, readTrelloTriggerFilter, verifyTrelloSignature } from "./trello-trigger-protocol";

const boardId = "4d5ea62fd76aa1136000000c", actionId = "5d5ea62fd76aa1136000000c", cardId = "6d5ea62fd76aa1136000000c";
const callback = "https://api.example.test/api/v1/webhooks/trello-example", secret = "synthetic-app-secret";
const event = (board = boardId, action = "createCard") => Buffer.from(JSON.stringify({ webhook: { idModel: board }, model: { id: board }, action: { id: actionId, type: action, data: { card: { id: cardId, name: "Sample card" }, text: "Hello", confidential: "not forwarded" } } }));

test("Trello authenticates raw body and the exact callback using its app secret", () => {
  const body = event(), signature = createHmac("sha1", secret).update(body).update(callback).digest("base64");
  assert.equal(verifyTrelloSignature(body, signature, secret, callback), true);
  assert.equal(verifyTrelloSignature(Buffer.concat([body, Buffer.from(" ")]), signature, secret, callback), false);
  assert.equal(verifyTrelloSignature(body, signature, secret, `${callback}/`), false);
  assert.equal(verifyTrelloSignature(body, signature, secret, `http://api.example.test/api/v1/webhooks/trello-example`), false);
  assert.equal(verifyTrelloSignature(body, signature, secret, `${callback}?token=not-allowed`), false);
  assert.equal(verifyTrelloSignature(body, `${signature}x`, secret, callback), false);
  assert.equal(readTrelloCallbackUrl(callback, "trello-example"), callback);
  assert.throws(() => readTrelloCallbackUrl(callback, "other-path"));
  assert.throws(() => readTrelloCallbackUrl(`${callback}?secret=value`, "trello-example"));
});

test("Trello normalizes the watched board and selected action without passing private payload", () => {
  const filter = readTrelloTriggerFilter({ boardId, action: "createCard" });
  assert.deepEqual(normalizeTrelloAction(event(), filter), { kind: "accepted", actionId, payload: { source: "trello", event: "createCard", actionId, boardId, cardId, listId: null, cardName: "Sample card", text: "Hello" } });
  assert.equal(normalizeTrelloAction(event("7d5ea62fd76aa1136000000c"), filter).kind, "ignored");
  assert.equal(normalizeTrelloAction(event(boardId, "updateCard"), filter).kind, "ignored");
  const sensitive = Buffer.from(JSON.stringify({ webhook: { idModel: boardId }, model: { id: boardId }, action: { id: actionId, type: "commentCard", data: { text: `before ${secret} after` } } }));
  const normalized = normalizeTrelloAction(sensitive, { boardId, action: "all" }, secret);
  assert.ok(!JSON.stringify(normalized).includes(secret));
  assert.throws(() => readTrelloTriggerFilter({ boardId: "other", action: "all" }));
  assert.throws(() => normalizeTrelloAction(Buffer.from("{"), filter));
});

test("Trello refuses a signing secret echoed in a routing or deduplication identifier", () => {
  assert.throws(() => normalizeTrelloAction(event(), { boardId, action: "createCard" }, actionId), (error: unknown) => error instanceof Error && !error.message.includes(actionId));
});
