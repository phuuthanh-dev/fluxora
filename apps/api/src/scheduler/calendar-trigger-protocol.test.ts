import assert from "node:assert/strict";
import test from "node:test";
import { calendarSyncPage } from "./calendar-trigger-protocol";
import { NodeFailure } from "../execution/node-failure";

const token = "synthetic-token";

test("Calendar sync pages preserve the checkpoint until the final page", async () => {
  let requested = "";
  const page = await calendarSyncPage(token, "primary", "sync-old", "page-next", async (path) => { requested = path; return { items: [{ id: "event1", etag: '"revision"', status: "confirmed", summary: "Demo", start: { dateTime: "2026-11-10T10:00:00Z" }, end: { dateTime: "2026-11-10T11:00:00Z" } }], nextSyncToken: "sync-new" }; });
  assert.match(requested, /syncToken=sync-old/); assert.match(requested, /pageToken=page-next/);
  assert.equal(page.nextSync, "sync-new"); assert.equal(page.events[0]?.summary, "Demo");
  assert.ok(!JSON.stringify(page).includes(token));
});

test("Calendar sync fails closed on expired checkpoints and incomplete pages", async () => {
  await assert.rejects(calendarSyncPage(token, "primary", "expired", undefined, async () => { throw new NodeFailure("CALENDAR_ERROR", "expired", false, 410); }), (error) => error instanceof NodeFailure && error.code === "CALENDAR_SYNC_EXPIRED");
  await assert.rejects(calendarSyncPage(token, "primary", undefined, undefined, async () => ({ items: [] })), (error) => error instanceof NodeFailure && error.code === "INVALID_RESPONSE");
  const empty = await calendarSyncPage(token, "primary", undefined, undefined, async () => ({ nextSyncToken: "sync-new" }));
  assert.deepEqual(empty.events, []);
});
