import assert from "node:assert/strict";
import test from "node:test";
import { driveListOutput, driveListUrl, readDriveCollectPages, readDrivePageToken } from "./google-drive-pagination";
import { executeGoogleDrive } from "./google-workspace-adapter";
import { redactValue } from "./redaction";
import { NodeFailure } from "./node-failure";

test("Drive continuation tokens are opaque, bounded and encoded without changing the query", () => {
  assert.equal(readDrivePageToken({}), undefined);
  assert.equal(readDrivePageToken({ pageToken: "" }), undefined);
  const token = "a+/bot-opaque =đ";
  const url = new URL(driveListUrl("search", { query: "name contains 'a+b'" }, readDrivePageToken({ pageToken: token })));
  assert.equal(url.searchParams.get("q"), "name contains 'a+b'");
  assert.equal(url.searchParams.get("pageToken"), token);
  assert.equal(url.searchParams.get("pageSize"), "100");
  assert.equal(url.searchParams.get("fields"), "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)");
  assert.equal(new URL(driveListUrl("list", { query: "ignored" })).searchParams.has("q"), false);
  for (const bad of [undefined, null, 1, {}, "x".repeat(1025), "bad\nvalue", "\ud800"]) {
    assert.throws(() => readDrivePageToken({ pageToken: bad }), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && !error.retryable);
  }
  assert.equal(readDrivePageToken({ pageToken: "x".repeat(1024) })?.length, 1024);
});

test("Drive can collect short and empty result pages without exceeding its result bound", async () => {
  const previous = globalThis.fetch;
  const requests: URL[] = [];
  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input)); requests.push(url);
      if (requests.length === 1) return Response.json({ files: [], nextPageToken: "page-2" });
      if (requests.length === 2) return Response.json({ files: [{ id: "file-1" }], nextPageToken: "page-3" });
      return Response.json({ files: [{ id: "file-2" }] });
    }) as typeof fetch;
    const output = await executeGoogleDrive({ accessToken: "synthetic-token" }, { operation: "search", query: "name contains 'a'", collectPages: true }, true);
    assert.deepEqual(requests.map((request) => [request.searchParams.get("pageToken"), request.searchParams.get("pageSize"), request.searchParams.get("q")]), [[null, "100", "name contains 'a'"], ["page-2", "100", "name contains 'a'"], ["page-3", "99", "name contains 'a'"]]);
    assert.deepEqual((output as { files: unknown[] }).files, [{ id: "file-1" }, { id: "file-2" }]);
    assert.equal((redactValue(output) as { nextPageToken: string | null }).nextPageToken, null);
  } finally { globalThis.fetch = previous; }
});

test("Drive bounds automatic pagination and rejects cyclic or oversized responses", async () => {
  const previous = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = (async () => Response.json({ files: [], nextPageToken: `page-${++calls}` })) as typeof fetch;
    const capped = await executeGoogleDrive({ accessToken: "synthetic-token" }, { collectPages: true }, true);
    assert.equal(calls, 5);
    assert.equal((redactValue(capped) as { nextPageToken: string }).nextPageToken, "page-5");
    calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({ files: Array.from({ length: 100 }, (_, index) => ({ id: `file-${index}` })), nextPageToken: "more" }); }) as typeof fetch;
    const full = await executeGoogleDrive({ accessToken: "synthetic-token" }, { collectPages: true }, true);
    assert.equal(calls, 1);
    assert.equal((full as { files: unknown[] }).files.length, 100);
    assert.equal((redactValue(full) as { nextPageToken: string }).nextPageToken, "more");
    calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({ files: [], nextPageToken: "same-page" }); }) as typeof fetch;
    await assert.rejects(executeGoogleDrive({ accessToken: "synthetic-token" }, { collectPages: true }, true), /repeated continuation/);
    assert.equal(calls, 2);
    assert.throws(() => driveListOutput("list", { files: [{}, {}] }, "synthetic-token", 1), /invalid file list/);
    for (const invalid of [undefined, null, "true", 0]) assert.throws(() => readDriveCollectPages({ collectPages: invalid }), /Choose whether/);
    assert.equal(readDriveCollectPages({}), false);
  } finally { globalThis.fetch = previous; }
});

test("Drive list output retains legacy fields and only exposes a validated top-level cursor", () => {
  const files = [{ id: "f1", accessToken: "private", nextPageToken: "nested-secret" }];
  const cursor = "a+/bot-opaque";
  const output = driveListOutput("search", { files, nextPageToken: cursor });
  assert.deepEqual(output, { operation: "search", files, nextPageToken: cursor });
  assert.deepEqual(redactValue(output), { operation: "search", files: [{ id: "f1", accessToken: "[REDACTED]", nextPageToken: "[REDACTED]" }], nextPageToken: cursor });
  assert.deepEqual(redactValue(driveListOutput("list", { files: [] })), { operation: "list", files: [], nextPageToken: null });
  assert.deepEqual(redactValue({ operation: "list", files: [], nextPageToken: "untrusted" }), { operation: "list", files: [], nextPageToken: "[REDACTED]" });
  assert.equal(driveListOutput("list", { files: Array(100).fill({}) }).files.length, 100);
  for (const payload of [null, {}, { files: Array(101).fill({}) }, { files: [], nextPageToken: null }, { files: [], nextPageToken: "x".repeat(1025) }, { files: [], nextPageToken: "bad\nvalue" }]) {
    assert.throws(() => driveListOutput("list", payload), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_PROVIDER_RESPONSE" && !error.retryable);
  }
});
