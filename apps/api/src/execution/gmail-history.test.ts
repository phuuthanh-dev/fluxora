import assert from "node:assert/strict";
import test from "node:test";
import { getGmailHistoryBaseline, getGmailHistoryPage } from "./gmail-history";

test("captures Gmail baseline without reading messages", async () => {
  let requested = "";
  const original = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  const transport = async (url: string | URL | Request) => { requested = String(url); return new Response(JSON.stringify({ historyId: "123", emailAddress: "person@example.test" })); };
  try {
    const baseline = await getGmailHistoryBaseline("token", transport as never);
    assert.equal(baseline.historyId, "123");
    assert.match(baseline.mailboxHash, /^[0-9a-f]{64}$/);
    assert.equal(requested, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
  } finally { if (original === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = original; }
});

test("history pages expose distinct added message IDs and preserve continuation", async () => {
  let requested = "";
  const transport = async (url: string | URL | Request) => { requested = String(url); return new Response(JSON.stringify({ historyId: "125", nextPageToken: "page-2", history: [{ messagesAdded: [{ message: { id: "abc" } }, { message: { id: "abc" } }, { message: { id: "def" } }] }] })); };
  const page = await getGmailHistoryPage("token", "123", "page-1", transport as never);
  assert.deepEqual(page, { messageIds: ["abc", "def"], historyId: "125", nextPageToken: "page-2" });
  assert.match(requested, /startHistoryId=123/); assert.match(requested, /pageToken=page-1/);
});

test("expired and malformed history are visible and never return provider content", async () => {
  const expired = async () => new Response("private body", { status: 404 });
  await assert.rejects(getGmailHistoryPage("token", "123", undefined, expired as never), (error: Error & { code?: string }) => error.code === "GMAIL_HISTORY_EXPIRED" && !error.message.includes("private body"));
  const invalid = async () => new Response(JSON.stringify({ historyId: "125", history: [{ messagesAdded: [{ message: { id: "not valid" } }] }] }));
  await assert.rejects(getGmailHistoryPage("token", "123", undefined, invalid as never));
});
