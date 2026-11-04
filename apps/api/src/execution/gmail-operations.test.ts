import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { gmailOperations, type GmailMessageInput } from "./gmail-operations";
import { NodeFailure } from "./node-failure";

type Call = { url: string; init: RequestInit };
const mail: GmailMessageInput = { to: ["recipient@example.test"], subject: "Hello", text: "Hello\nworld" };
const modifyScope = "https://www.googleapis.com/auth/gmail.modify";
function fixture(handler: (call: Call) => Response | Promise<Response>, grantedScopes: string[] | null = [modifyScope], hashOverride?: string) {
  const calls: Call[] = []; const credentialCalls: unknown[][] = [];
  const credentials = { readGoogleForExecution: async (...args: unknown[]) => { credentialCalls.push(args); return { accessToken: "synthetic-secret", ...(grantedScopes === null ? {} : { grantedScopes, scopeTokenHash: hashOverride ?? createHash("sha256").update("synthetic-secret").digest("hex") }) }; } };
  const api = gmailOperations({ workspaceId: "workspace-a", credentialId: "connection-a", credentials: credentials as never, transport: async (url, init) => { const call = { url, init }; calls.push(call); return handler(call); } });
  return { api, calls, credentialCalls };
}
const isFailure = (code: string) => (error: unknown) => error instanceof NodeFailure && error.code === code && !error.retryable && !error.message.includes("synthetic-secret");
const rawFrom = (call: Call, draft = false) => {
  const data = JSON.parse(String(call.init.body)) as { raw?: string; message?: { raw: string; threadId?: string }; threadId?: string };
  return { data, mime: Buffer.from(draft ? data.message!.raw : data.raw!, "base64url").toString("utf8") };
};

test("get confines credential lookup to the selected Gmail workspace and sanitizes bounded output", async () => {
  const { api, calls, credentialCalls } = fixture(() => Response.json({ id: "m1", threadId: "t1", labelIds: ["INBOX"], snippet: "synthetic-secret\u0000x", payload: { headers: [{ name: "Subject", value: "Hi\r\nBcc: injected" }], parts: [{ mimeType: "text/plain", filename: "attachment.txt", body: { data: Buffer.from("hidden").toString("base64url") } }, { mimeType: "text/plain", body: { data: Buffer.from("hello synthetic-secret").toString("base64url") } }] } }));
  const output = await api.getMessage("m1");
  assert.deepEqual(credentialCalls, [["connection-a", "workspace-a", "GMAIL"]]);
  assert.match(calls[0]!.url, /\/messages\/m1\?format=full$/);
  assert.equal(calls[0]!.init.redirect, "manual");
  assert.equal(output.subject, "Hi Bcc: injected");
  assert.equal(output.text, "hello [redacted]");
  assert.ok(!JSON.stringify(output).includes("synthetic-secret"));
});

test("message and thread modifications use native label deltas and reject conflicts", async () => {
  const { api, calls } = fixture(({ url }) => Response.json(url.includes("/threads/") ? { id: "t1" } : { id: "m1", labelIds: ["STARRED"] }));
  assert.deepEqual(await api.modifyMessage("m1", { addLabelIds: ["STARRED"], removeLabelIds: ["UNREAD"] }), { id: "m1", labels: ["STARRED"] });
  assert.deepEqual(await api.modifyThread("t1", { addLabelIds: ["Label_1"] }), { id: "t1" });
  assert.match(calls[1]!.url, /\/threads\/t1\/modify$/);
  assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { addLabelIds: ["Label_1"], removeLabelIds: [] });
  await assert.rejects(api.modifyMessage("m1", { addLabelIds: ["X"], removeLabelIds: ["X"] }), isFailure("INVALID_INPUT"));
  await assert.rejects(api.modifyThread("../m1", { addLabelIds: ["X"] }), isFailure("INVALID_INPUT"));
  assert.equal(calls.length, 2);
});

test("compose encodes MIME safely and returns only a send receipt", async () => {
  const { api, calls } = fixture(() => Response.json({ id: "sent1", threadId: "thread1", raw: "synthetic-secret" }));
  const result = await api.sendMessage({ ...mail, subject: "Xin chào", bcc: ["private@example.test"], text: "body\r\nBcc: text" });
  assert.deepEqual(result, { messageId: "sent1", threadId: "thread1", status: "accepted", acceptance: "gmail_api_receipt", inboxDelivery: "unconfirmed", deliveryConfirmed: false });
  const { mime } = rawFrom(calls[0]!);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /Content-Transfer-Encoding: base64/);
  assert.ok(!mime.includes("\r\nBcc: text"));
  assert.ok(!JSON.stringify(result).includes("private@example.test"));
});

test("rejects header injection, invalid addresses, oversized text and unsafe identifiers before transport", async () => {
  const { api, calls, credentialCalls } = fixture(() => { throw new Error("unexpected transport"); });
  await assert.rejects(api.sendMessage({ ...mail, subject: "Hi\r\nBcc: attacker@example.test" }), isFailure("INVALID_INPUT"));
  await assert.rejects(api.sendMessage({ ...mail, to: ["a@example.test\r\nBcc: b@example.test"] }), isFailure("INVALID_INPUT"));
  await assert.rejects(api.sendMessage({ ...mail, text: "a".repeat(100_001) }), isFailure("INVALID_INPUT"));
  await assert.rejects(api.sendMessage({ ...mail, to: Array(51).fill("a@example.test") }), isFailure("INVALID_INPUT"));
  await assert.rejects(api.getMessage("../profile"), isFailure("INVALID_INPUT"));
  assert.equal(calls.length, 0); assert.equal(credentialCalls.length, 0);
});

test("reply fetches parent metadata and uses one credential with matching thread and reply headers", async () => {
  const { api, calls, credentialCalls } = fixture(({ url }) => url.includes("format=metadata")
    ? Response.json({ id: "parent1", threadId: "thread1", payload: { headers: [{ name: "Message-ID", value: "<parent@example.test>" }, { name: "References", value: "<old@example.test>" }, { name: "Subject", value: "Original" }] } })
    : Response.json({ id: "sent1", threadId: "thread1" }));
  await api.reply("parent1", { ...mail, subject: "ignored" });
  assert.equal(credentialCalls.length, 1);
  const { data, mime } = rawFrom(calls[1]!);
  assert.equal(data.threadId, "thread1");
  assert.match(mime, /Subject: Original\r\n/);
  assert.match(mime, /In-Reply-To: <parent@example.test>/);
  assert.match(mime, /References: <old@example.test>\r\n <parent@example.test>/);
});

test("invalid or ambiguous parent metadata never sends a reply", async () => {
  const { api, calls } = fixture(() => Response.json({ id: "p1", threadId: "t1", payload: { headers: [{ name: "Message-ID", value: "<p@example.test>\r\nBcc: evil" }, { name: "Subject", value: "Subject" }] } }));
  await assert.rejects(api.reply("p1", mail), isFailure("INVALID_RESPONSE"));
  assert.equal(calls.length, 1);
});

test("draft creation, replacement and label patch normalize receipts; draft send is disabled", async () => {
  const { api, calls } = fixture(({ url, init }) => {
    if (url.endsWith("/drafts/send")) return Response.json({ id: "sent1", threadId: "t1" });
    if (url.includes("/labels/")) return Response.json({ id: "Label_1", name: "Renamed", extra: "synthetic-secret" });
    return Response.json({ id: "d1", message: { id: init.method === "PUT" ? "m2" : "m1", threadId: "t1" } });
  });
  assert.deepEqual(await api.createDraft(mail), { draftId: "d1", messageId: "m1", threadId: "t1" });
  assert.deepEqual(await api.updateDraft("d1", mail), { draftId: "d1", messageId: "m2", threadId: "t1" });
  assert.match(calls[1]!.url, /\/drafts\/d1$/); assert.equal(calls[1]!.init.method, "PUT");
  assert.match(rawFrom(calls[0]!, true).mime, /Subject: Hello/);
  await assert.rejects(api.sendDraft("d1"), isFailure("GMAIL_OPERATION_DISABLED"));
  assert.equal(calls.length, 2);
  assert.deepEqual(await api.updateLabel("Label_1", { name: "Renamed" }), { id: "Label_1", name: "Renamed" });
  await assert.rejects(api.updateLabel("Label_1", { name: "x\ninjected" }), isFailure("INVALID_INPUT"));
});

test("writes never retry or follow redirects and malformed receipts remain uncertain", async () => {
  for (const response of [() => new Response(null, { status: 307, headers: { location: "https://gmail.googleapis.com/other" } }), () => new Response("sensitive", { status: 503 }), () => Response.json({ unexpected: "synthetic-secret" })]) {
    const { api, calls } = fixture(response);
    await assert.rejects(api.sendMessage(mail), (error: unknown) => error instanceof NodeFailure && !error.retryable && !error.message.includes("sensitive") && !error.message.includes("synthetic-secret"));
    assert.equal(calls.length, 1); assert.equal(calls[0]!.init.redirect, "manual");
  }
  const { api, calls } = fixture(() => { throw new Error("synthetic-secret"); });
  await assert.rejects(api.sendMessage(mail), isFailure("GMAIL_WRITE_UNCERTAIN"));
  assert.equal(calls.length, 1);
});

test("oversized read fails safely, oversized write receipt remains uncertain", async () => {
  const huge = () => new Response("x".repeat(1_000_001));
  const read = fixture(huge); const write = fixture(huge);
  await assert.rejects(read.api.getMessage("m1"), isFailure("INVALID_RESPONSE"));
  await assert.rejects(write.api.sendMessage(mail), isFailure("GMAIL_WRITE_UNCERTAIN"));
});

test("reply thread mismatch after a write is uncertain", async () => {
  const { api, calls } = fixture(({ url }) => url.includes("format=metadata")
    ? Response.json({ id: "p1", threadId: "t1", payload: { headers: [{ name: "Message-ID", value: "<p@example.test>" }, { name: "Subject", value: "Hi" }] } })
    : Response.json({ id: "sent1", threadId: "another" }));
  await assert.rejects(api.reply("p1", mail), isFailure("GMAIL_WRITE_UNCERTAIN"));
  assert.equal(calls.length, 2);
});

test("credential lookup failures never fall back to a different account or reach Gmail", async () => {
  let requests = 0;
  const api = gmailOperations({ workspaceId: "workspace-b", credentialId: "connection-a", credentials: { readGoogleForExecution: async () => { throw new Error("synthetic-secret"); } } as never, transport: async () => { requests++; return Response.json({}); } });
  await assert.rejects(api.getMessage("m1"), isFailure("CREDENTIAL_UNAVAILABLE"));
  assert.equal(requests, 0);
});

test("reply draft keeps the parent's thread, with no implicit recipients", async () => {
  const { api, calls } = fixture(({ url }) => url.includes("format=metadata")
    ? Response.json({ id: "p1", threadId: "t1", payload: { headers: [{ name: "Message-ID", value: "<p@example.test>" }, { name: "Subject", value: "Topic" }] } })
    : Response.json({ id: "d1", message: { id: "m1", threadId: "t1" } }));
  await api.createDraft(mail, "p1");
  const { data, mime } = rawFrom(calls[1]!, true);
  assert.equal(data.message!.threadId, "t1");
  assert.match(mime, /To: recipient@example.test/);
  assert.match(mime, /References: <p@example.test>/);
});

test("token-shaped provider identifiers never escape through results", async () => {
  const { api } = fixture(() => Response.json({ id: "synthetic-secret", threadId: "thread1" }));
  await assert.rejects(api.sendMessage(mail), isFailure("GMAIL_WRITE_UNCERTAIN"));
});

test("redacts an entire token before truncating headers, snippets and text", async () => {
  const text = `${"x".repeat(49_995)}synthetic-secret tail`;
  const { api } = fixture(() => Response.json({ id: "m1", threadId: "t1", snippet: `${"x".repeat(1_995)}synthetic-secret`, payload: { mimeType: "text/plain", headers: [{ name: "Subject", value: `${"x".repeat(995)}synthetic-secret` }], body: { data: Buffer.from(text).toString("base64url") } } }));
  const output = await api.getMessage("m1");
  assert.equal(output.subject.slice(-5), "[reda");
  assert.equal(output.snippet.slice(-5), "[reda");
  assert.equal(output.text.slice(-5), "[reda");
  assert.equal(output.bodyStatus, "truncated");
  assert.ok(!JSON.stringify(output).includes("synthetic-"));
});

test("body state distinguishes empty text, attachments, HTML, charset, invalid encoding and bounded traversal", async () => {
  const cases: Array<{ payload: unknown; expected: string }> = [
    { payload: { mimeType: "text/plain", body: { data: "" } }, expected: "available" },
    { payload: { mimeType: "text/plain", body: { attachmentId: "a1", size: 50 } }, expected: "attachment_backed" },
    { payload: { mimeType: "text/html", body: { data: "PGI-" } }, expected: "html_only" },
    { payload: { mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=iso-8859-1" }], body: { data: "aGVsbG8" } }, expected: "unsupported_charset" },
    { payload: { mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=us-ascii" }], body: { data: Buffer.from("é").toString("base64url") } }, expected: "invalid_encoding" },
    { payload: { mimeType: "text/plain", body: { data: "!!!!" } }, expected: "invalid_encoding" },
    { payload: { mimeType: "multipart/mixed", parts: Array.from({ length: 51 }, () => ({ mimeType: "application/octet-stream" })) }, expected: "partial" },
    { payload: {}, expected: "missing" },
  ];
  for (const entry of cases) {
    const { api } = fixture(() => Response.json({ id: "m1", threadId: "t1", payload: entry.payload }));
    const output = await api.getMessage("m1");
    assert.equal(output.bodyStatus, entry.expected);
  }
  const mixed = fixture(() => Response.json({ id: "m1", threadId: "t1", payload: { mimeType: "multipart/mixed", parts: [{ mimeType: "text/plain", body: { data: "aGVsbG8" } }, { mimeType: "text/plain", body: { attachmentId: "a1" } }] } }));
  const output = await mixed.api.getMessage("m1");
  assert.equal(output.text, "hello"); assert.equal(output.bodyStatus, "partial");
  assert.equal(output.attachmentsPresent, true); assert.equal(output.attachmentBacked, true);
});

test("only legacy full reads work without scope evidence; bound scopes gate each operation", async () => {
  const handler = () => Response.json({ id: "m1", threadId: "t1", payload: {} });
  const legacy = fixture(handler, null);
  await legacy.api.getMessage("m1");
  await assert.rejects(legacy.api.sendMessage(mail), isFailure("GMAIL_SCOPE_UNVERIFIED"));
  await assert.rejects(legacy.api.modifyMessage("m1", { addLabelIds: ["INBOX"] }), isFailure("GMAIL_SCOPE_UNVERIFIED"));
  assert.equal(legacy.calls.length, 1);

  const sendOnly = fixture(handler, ["https://www.googleapis.com/auth/gmail.send"]);
  await assert.rejects(sendOnly.api.getMessage("m1"), isFailure("GMAIL_SCOPE_MISSING"));
  await assert.rejects(sendOnly.api.reply("m1", mail), isFailure("GMAIL_SCOPE_MISSING"));
  assert.equal(sendOnly.calls.length, 0);
  const stale = fixture(handler, [modifyScope], "0".repeat(64));
  await assert.rejects(stale.api.getMessage("m1"), isFailure("GMAIL_SCOPE_UNVERIFIED"));
  await assert.rejects(stale.api.sendMessage(mail), isFailure("GMAIL_SCOPE_UNVERIFIED"));
  assert.equal(stale.calls.length, 0);
  const labelOnly = fixture(() => Response.json({ id: "Label_1", name: "Name" }), ["https://www.googleapis.com/auth/gmail.labels"]);
  assert.deepEqual(await labelOnly.api.updateLabel("Label_1", { name: "Name" }), { id: "Label_1", name: "Name" });
  await assert.rejects(labelOnly.api.modifyMessage("m1", { addLabelIds: ["Label_1"] }), isFailure("GMAIL_SCOPE_MISSING"));
  assert.equal(labelOnly.calls.length, 1);
});

test("reply unfolds valid header folds and uses the parent's In-Reply-To as a references fallback", async () => {
  const { api, calls } = fixture(({ url }) => url.includes("format=metadata")
    ? Response.json({ id: "p1", threadId: "t1", payload: { headers: [{ name: "Message-ID", value: "<p@example.test>" }, { name: "In-Reply-To", value: "\r\n <root@example.test>" }, { name: "Subject", value: "Original\r\n \tthread" }] } })
    : Response.json({ id: "sent1", threadId: "t1" }));
  await api.reply("p1", mail);
  assert.match(calls[0]!.url, /metadataHeaders=In-Reply-To/);
  const { mime } = rawFrom(calls[1]!);
  assert.match(mime, /Subject: Original thread\r\n/);
  assert.match(mime, /References: <root@example.test>\r\n <p@example.test>/);
});

test("ambiguous In-Reply-To or invalid folding stops before writing", async () => {
  for (const value of ["<one@example.test> <two@example.test>", "<one@example.test>\n injection", "<one@example.test>\r\nBcc: bad"]) {
    const { api, calls } = fixture(() => Response.json({ id: "p1", threadId: "t1", payload: { headers: [{ name: "Message-ID", value: "<p@example.test>" }, { name: "In-Reply-To", value }, { name: "Subject", value: "Topic" }] } }));
    await assert.rejects(api.reply("p1", mail), isFailure("INVALID_RESPONSE"));
    assert.equal(calls.length, 1);
  }
});

test("reply requires both metadata and send grants and rejects provider metadata containing the token", async () => {
  const scopes = ["https://www.googleapis.com/auth/gmail.metadata", "https://www.googleapis.com/auth/gmail.send"];
  const good = fixture(({ url }) => url.includes("format=metadata")
    ? Response.json({ id: "p1", threadId: "t1", payload: { headers: [{ name: "Message-ID", value: "<p@example.test>" }, { name: "Subject", value: "Topic" }] } })
    : Response.json({ id: "sent1", threadId: "t1" }), scopes);
  const result = await good.api.reply("p1", mail);
  assert.equal("inboxDelivery" in result && result.inboxDelivery, "unconfirmed");
  const bad = fixture(() => Response.json({ id: "p1", threadId: "t1", payload: { headers: [{ name: "Message-ID", value: "<p@example.test>" }, { name: "Subject", value: "synthetic-secret" }] } }), scopes);
  await assert.rejects(bad.api.reply("p1", mail), isFailure("INVALID_RESPONSE"));
  assert.equal(bad.calls.length, 1);
});
