import assert from "node:assert/strict";
import test from "node:test";
import { executeGoogleCalendar, listCalendarEvents } from "./google-calendar";

test("calendar mock never reads a credential and uses bounded synthetic events", async () => {
  const result = await executeGoogleCalendar({}, "mock", "workspace", { readGoogleForExecution: () => { throw new Error("should not read"); } } as never);
  assert.equal(result.output.count, 1);
  assert.equal(result.output.events[0]?.id, "example-event");
});

test("calendar list calls the fixed provider with read-only parameters and bounded results", async () => {
  let requested = "";
  const transport = async (url: string | URL | Request) => { requested = String(url); return new Response(JSON.stringify({ items: [{ id: "one", summary: "Meeting", start: { date: "2030-01-01" }, end: { date: "2030-01-02" } }], nextPageToken: "next" })); };
  const result = await listCalendarEvents("synthetic-token", "primary", 5, transport as never, new Date("2029-12-01T00:00:00Z"));
  assert.match(requested, /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/);
  assert.match(requested, /singleEvents=true/);
  assert.equal(result.events[0]?.start, "2030-01-01");
  assert.equal(result.hasMore, true);
  assert.ok(!JSON.stringify(result).includes("synthetic-token"));
});

test("calendar failures do not expose credentials or provider response", async () => {
  const transport = async () => new Response("private body", { status: 403 });
  await assert.rejects(listCalendarEvents("secret-token", "primary", 3, transport as never), (error: Error) => !error.message.includes("secret-token") && !error.message.includes("private body") && error.message.includes("403"));
  await assert.rejects(listCalendarEvents("token", "primary", 51, transport as never));
  const invalid = async () => new Response("private-invalid-response");
  await assert.rejects(listCalendarEvents("token", "primary", 3, invalid as never), (error: Error) => !error.message.includes("private-invalid-response") && error.message.includes("invalid response"));
});
