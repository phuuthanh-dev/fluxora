import assert from "node:assert/strict";
import test from "node:test";
import { executeGmailRead, getGmailMessage, listGmailMessages } from "./gmail-read";
import { NodeFailure } from "./node-failure";
import { redactValue } from "./redaction";
import type { CredentialService } from "../credentials/credential.service";

test("Gmail list returns and accepts bounded continuation tokens", async () => {
  const transport = async (url: string | URL | Request) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("q"), "in:inbox");
    assert.equal(parsed.searchParams.get("pageToken"), "next-page");
    return Response.json({ messages: [], nextPageToken: "another-page" });
  };
  const page = await listGmailMessages("synthetic-token", "in:inbox", 5, transport as never, "next-page");
  assert.equal(page.hasMore, true);
  assert.equal(page.nextPageToken, "another-page");
  assert.equal((redactValue(page) as { nextPageToken: string }).nextPageToken, "another-page");
  await assert.rejects(listGmailMessages("synthetic-token", "", 5, async () => Response.json({ messages: [], nextPageToken: "cursor-synthetic-token" })), /invalid continuation token/);
  await assert.rejects(executeGmailRead({ pageToken: undefined }, "mock", "workspace", {} as never), /could not be resolved/);
  await assert.rejects(listGmailMessages("synthetic-token", "", 5, transport as never, "bad\nheader"), /page token/);
});

test("Gmail read returns bounded plain text and headers; no credential in output", async () => {
  const urls: string[] = [];
  const transport = async (url: string | URL | Request) => {
    urls.push(String(url));
    if (urls.length === 1) return Response.json({ messages: [{ id: "abc123" }], nextPageToken: "more" });
    return Response.json({ threadId: "thread1", snippet: "Hello", payload: { mimeType: "multipart/alternative", headers: [{ name: "Subject", value: "Test" }, { name: "From", value: "sender@example.test" }], parts: [{ mimeType: "text/html", body: { data: Buffer.from("<p>ignore</p>").toString("base64url") } }, { mimeType: "text/plain", body: { data: Buffer.from("Hello world").toString("base64url") } }] } });
  };
  const output = await listGmailMessages("synthetic-token", "in:inbox", 5, transport as never);
  assert.equal(output.count, 1); assert.equal(output.hasMore, true);
  assert.equal(output.messages[0]?.subject, "Test"); assert.equal(output.messages[0]?.text, "Hello world");
  assert.equal(JSON.stringify(output).includes("synthetic-token"), false);
  assert.ok(urls[1]?.endsWith("/abc123?format=full"));
});

test("Gmail mock does not read credentials; live filters and provider errors are safe", async () => {
  let calls = 0;
  const credentials = { readGoogleForExecution: async (...args: unknown[]) => { calls++; assert.deepEqual(args, ["connection", "workspace", "GMAIL"]); return { accessToken: "synthetic-token" }; } } as unknown as CredentialService;
  await executeGmailRead({ mailbox: "unread" }, "mock", "workspace", credentials);
  assert.equal(calls, 0);
  await executeGmailRead({ credentialId: "connection", mailbox: "unread", query: "from:example.test", limit: 3 }, "live", "workspace", credentials, async (token, query, limit) => { assert.equal(token, "synthetic-token"); assert.equal(query, "in:inbox is:unread from:example.test"); assert.equal(limit, 3); return { messages: [], count: 0, hasMore: false, nextPageToken: null }; });
  await assert.rejects(listGmailMessages("synthetic-token", "", 1, async () => new Response("synthetic-token", { status: 403 }) as never), (error: unknown) => error instanceof Error && /403/.test(error.message) && !error.message.includes("synthetic-token"));
  await assert.rejects(listGmailMessages("synthetic-token", "", 11));
});

test("Gmail rejects unsafe message IDs before requesting a message", async () => {
  let calls = 0;
  await assert.rejects(listGmailMessages("token", "", 1, async () => { calls++; return Response.json({ messages: [{ id: "../profile" }] }); }), /invalid message ID/);
  assert.equal(calls, 1);
});

test("Gmail ignores attachment data and limits decoded message text", async () => {
  let calls = 0;
  const output = await listGmailMessages("token", "", 1, async () => {
    if (++calls === 1) return Response.json({ messages: [{ id: "abc" }] });
    return Response.json({ payload: { parts: [{ mimeType: "text/plain", filename: "attachment.txt", body: { data: Buffer.from("attachment").toString("base64url") } }, { mimeType: "text/plain", body: { data: Buffer.from("x".repeat(51_000)).toString("base64url") } }] } });
  });
  assert.equal(output.messages[0]?.text.length, 50_000);
  assert.ok(!output.messages[0]?.text.includes("attachment"));
});

test("Gmail rejects access token echoes in headers, snippet, labels and decoded text before truncation", async () => {
  const token = "synthetic-gmail-access-token";
  const values = [
    { snippet: `${"x".repeat(1998)}${token}` },
    { labelIds: [token] },
    { threadId: token },
    { payload: { headers: [{ name: "Subject", value: `${"x".repeat(998)}${token}` }] } },
    { payload: { mimeType: "text/plain", body: { data: Buffer.from(`${"x".repeat(49_998)}${token}`).toString("base64url") } } },
  ];
  for (const value of values) {
    await assert.rejects(getGmailMessage(token, "message-id", async () => Response.json(value)), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_RESPONSE" && !error.retryable && !error.message.includes(token));
  }
});
