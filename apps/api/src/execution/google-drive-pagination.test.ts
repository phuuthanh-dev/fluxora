import assert from "node:assert/strict";
import test from "node:test";
import { driveListOutput, driveListUrl, readDrivePageToken } from "./google-drive-pagination";
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
