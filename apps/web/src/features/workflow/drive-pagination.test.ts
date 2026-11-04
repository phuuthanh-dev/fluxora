import assert from "node:assert/strict";
import test from "node:test";
import { resetDrivePageToken } from "./drive-pagination";
import { getNodeDefinition } from "./node-catalog";

test("Drive inspector clears a stale cursor when its context changes", () => {
  const original = { credentialId: "c1", query: "name = 'a'", operation: "search", pageToken: "next", name: "report" };
  for (const [key, value] of [["credentialId", "c2"], ["query", "other"], ["operation", "list"]] as const) {
    assert.equal(resetDrivePageToken(original, key, value).pageToken, "");
  }
  assert.equal(resetDrivePageToken(original, "credentialId", "c1").pageToken, "next");
  assert.equal(resetDrivePageToken(original, "name", "other").pageToken, "next");
  assert.equal(resetDrivePageToken(original, "pageToken", "new").pageToken, "new");
  assert.equal(original.pageToken, "next");
  assert.deepEqual(resetDrivePageToken({ credentialId: "c1" }, "credentialId", "c2"), { credentialId: "c2" });
});

test("Drive advanced continuation help appears for list and search only", () => {
  const field = getNodeDefinition("action.google-drive.v2")?.configurationFields?.find((entry) => entry.key === "pageToken");
  assert.ok(field && field.kind === "text");
  assert.deepEqual(field.visibleWhen, { key: "operation", equals: ["list", "search"], fallback: "list" });
  assert.match(field.advanced?.help ?? "", /same connection, operation and query/i);
  assert.match(field.advanced?.help ?? "", /clear it and start again/i);
});
