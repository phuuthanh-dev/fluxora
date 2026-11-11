import assert from "node:assert/strict";
import test from "node:test";
import { driveChanges, driveStartCursor } from "./drive-trigger-protocol";

test("Drive polling uses an opaque cursor and allows an unchanged final checkpoint", async () => {
  const urls: string[] = [];
  const transport = async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(url.includes("startPageToken") ? { startPageToken: "start" } : { changes: [], newStartPageToken: "start" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  assert.equal(await driveStartCursor("example-token", transport as never), "start");
  assert.deepEqual(await driveChanges("example-token", "start", transport as never), { cursor: "start", hasMore: false, changes: [] });
  assert.match(urls[1] ?? "", /pageToken=start/);
});

test("Drive polling rejects expired and looping cursors without moving forward", async () => {
  const expired = async () => new Response("{}", { status: 410 });
  await assert.rejects(driveChanges("example-token", "start", expired as never), /410/);
  const repeated = async () => new Response(JSON.stringify({ changes: [], nextPageToken: "start" }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(driveChanges("example-token", "start", repeated as never), /invalid checkpoint/);
});
