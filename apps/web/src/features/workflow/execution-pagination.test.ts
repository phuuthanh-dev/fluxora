import assert from "node:assert/strict";
import test from "node:test";
import { executionPagination } from "./execution-pagination";

test("pagination guidance describes a recorded continuation without exposing its value", () => {
  const guidance = executionPagination("action.gmail.read.v2", { config: { mailbox: "inbox" } }, { messages: [], nextPageToken: "synthetic-private-cursor" });
  assert.deepEqual(guidance, { kind: "continuation", input: "pageToken", next: "nextPageToken", available: true, caveat: undefined });
  assert.doesNotMatch(JSON.stringify(guidance), /synthetic-private-cursor/);
  for (const nextPageToken of [null, "", "[REDACTED]"]) {
    const result = executionPagination("action.gmail.read.v2", {}, { nextPageToken });
    if (result?.kind !== "continuation") assert.fail("expected continuation guidance");
    assert.equal(result.available, false);
  }
});

test("conditional pagination uses the configuration recorded with the execution", () => {
  assert.equal(executionPagination("action.google-drive.v2", { config: { operation: "uploadText" } }, { nextPageToken: "next" }), undefined);
  const guidance = executionPagination("action.google-drive.v2", { config: { operation: "search" } }, { files: [], nextPageToken: "next" });
  assert.equal(guidance?.kind, "continuation");
  assert.equal(guidance?.input, "pageToken");
  assert.equal(executionPagination("action.google-drive.v2", {}, { nextPageToken: "next" }), undefined);
});

test("calendar guidance retains the exact original start time requirement", () => {
  const guidance = executionPagination("action.google-calendar.list-events", {}, { events: [], nextPageToken: "next", timeMin: "2030-01-01T00:00:00.123Z" });
  assert.match(guidance?.caveat ?? "", /exact timeMin.*seconds and milliseconds/i);
});

test("offset and missing output are described without claiming complete results", () => {
  const guidance = executionPagination("action.supabase.select.v2", {}, { rows: [], page: { offset: 20, completeness: "unknown" } });
  assert.equal(guidance?.kind, "offset");
  assert.match(guidance?.caveat ?? "", /completeness is unknown/i);
  assert.equal(executionPagination("action.supabase.select.v2", {}, { rows: [] }), undefined);
  assert.equal(executionPagination("action.gmail.read", {}, { messages: [], hasMore: true }), undefined);
  assert.equal(executionPagination("action.gmail.read", {}, { messages: [], nextPageToken: "next" }, 2)?.kind, "continuation");
  assert.equal(executionPagination("action.facebook-meta", {}, {}), undefined);
});
