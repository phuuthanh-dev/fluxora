import assert from "node:assert/strict";
import test from "node:test";
import { createCalendarEvent, executeGoogleCalendar, executeGoogleCalendarAvailability, executeGoogleCalendarCreate, executeGoogleCalendarEvent, listCalendarEvents } from "./google-calendar";

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
  assert.equal(result.nextPageToken, "next");
  assert.equal(result.timeMin, "2029-12-01T00:00:00.000Z");
  assert.ok(!JSON.stringify(result).includes("synthetic-token"));
});

test("calendar pagination requires a stable start time", async () => {
  await assert.rejects(executeGoogleCalendar({ calendarId: "primary", pageToken: "next" }, "mock", "workspace", {} as never));
  const output = await executeGoogleCalendar({ calendarId: "primary", pageToken: "next", timeMin: "2030-01-01T00:00:00Z" }, "mock", "workspace", {} as never);
  assert.equal(output.output.timeMin, "2030-01-01T00:00:00.000Z");
});

test("calendar failures do not expose credentials or provider response", async () => {
  const transport = async () => new Response("private body", { status: 403 });
  await assert.rejects(listCalendarEvents("secret-token", "primary", 3, transport as never), (error: Error) => !error.message.includes("secret-token") && !error.message.includes("private body") && error.message.includes("403"));
  await assert.rejects(listCalendarEvents("token", "primary", 51, transport as never));
  const invalid = async () => new Response("private-invalid-response");
  await assert.rejects(listCalendarEvents("token", "primary", 3, invalid as never), (error: Error) => !error.message.includes("private-invalid-response") && error.message.includes("invalid response"));
});

test("creating a calendar event uses a stable ID and recovers after an ambiguous retry", async () => {
  const input = { calendarId: "primary", summary: "Meeting", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z", description: "", location: "", attendees: ["guest@example.test"], sendUpdates: "none" as const };
  let sent: Record<string, unknown> = {}; let calls = 0;
  const transport = async (_url: string | URL | Request, init?: RequestInit) => {
    calls++;
    if (init?.method === "POST") { sent = JSON.parse(String(init.body)) as Record<string, unknown>; return new Response("conflict", { status: 409 }); }
    return new Response(JSON.stringify({ id: sent.id, extendedProperties: sent.extendedProperties }));
  };
  const result = await createCalendarEvent("token", input, "execution", "node", transport as never);
  assert.equal(calls, 2); assert.equal(result.recovered, true); assert.equal(result.id, sent.id);
  assert.match(String(sent.id), /^[0-9a-v]{5,1024}$/);
  assert.deepEqual(sent.attendees, [{ email: "guest@example.test" }]);
});

test("calendar create validates dates and mock mode does not access credentials", async () => {
  const config = { calendarId: "primary", summary: "Meeting", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z" };
  const result = await executeGoogleCalendarCreate(config, "mock", "workspace", { readGoogleForExecution: () => { throw new Error("unexpected"); } } as never, "execution", "node");
  assert.equal(result.output.summary, "Meeting");
  await assert.rejects(executeGoogleCalendarCreate({ ...config, end: "2029-12-01T00:00:00Z" }, "mock", "workspace", {} as never, "execution", "node"));
  await assert.rejects(executeGoogleCalendarCreate({ ...config, attendees: "bad-email" }, "mock", "workspace", {} as never, "execution", "node"));
});

test("calendar create treats unconfirmed responses as retryable and rejects foreign ID collisions", async () => {
  const input = { calendarId: "primary", summary: "Meeting", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z", description: "", location: "", attendees: [], sendUpdates: "none" as const };
  await assert.rejects(createCalendarEvent("token", input, "execution", "node", (async () => new Response("invalid")) as never), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "CALENDAR_CONFIRMATION_UNKNOWN" && "retryable" in error && error.retryable === true));
  const foreign = async (_url: string | URL | Request, init?: RequestInit) => init?.method === "POST" ? new Response("conflict", { status: 409 }) : new Response(JSON.stringify({ extendedProperties: { private: { fluxoraRun: "other" } } }));
  await assert.rejects(createCalendarEvent("token", input, "execution", "node", foreign as never), /different calendar event/);
});

test("calendar event read and update only send the selected fields", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport = async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ id: "event-id", summary: "Original", start: { dateTime: "2030-01-01T09:00:00Z" }, end: { dateTime: "2030-01-01T10:00:00Z" } })); };
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "secret-token" }) } as never;
  const config = { credentialId: "credential", calendarId: "primary", eventId: "event-id" };
  const read = await executeGoogleCalendarEvent(config, "get", "live", "workspace", credentials, transport as never);
  assert.equal("summary" in read.output ? read.output.summary : undefined, "Original");
  await executeGoogleCalendarEvent({ ...config, summary: "Updated", sendUpdates: "none" }, "update", "live", "workspace", credentials, transport as never);
  assert.equal(calls[1]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { summary: "Updated" });
  assert.ok(!JSON.stringify(read.output).includes("secret-token"));
});

test("calendar delete does not claim that a missing or inaccessible event was deleted", async () => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "token" }) } as never;
  const config = { credentialId: "credential", calendarId: "primary", eventId: "event-id" };
  const result = await executeGoogleCalendarEvent(config, "delete", "live", "workspace", credentials, (async () => new Response("not found", { status: 404 })) as never);
  assert.equal("deleted" in result.output ? result.output.deleted : undefined, false); assert.equal("alreadyAbsentOrInaccessible" in result.output ? result.output.alreadyAbsentOrInaccessible : undefined, true);
  await assert.rejects(executeGoogleCalendarEvent({ ...config, start: "2030-01-01T09:00:00Z" }, "update", "mock", "workspace", {} as never));
  for (const eventId of ["..", "../events", "%2e%2e", "event\\name"]) await assert.rejects(executeGoogleCalendarEvent({ ...config, eventId }, "delete", "mock", "workspace", {} as never));
});

test("calendar availability does not report free when the provider reports a calendar error", async () => {
  const config = { credentialId: "credential", calendarId: "primary", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z" };
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "token" }) } as never;
  const busy = async () => Response.json({ calendars: { primary: { busy: [{ start: "2030-01-01T09:30:00Z", end: "2030-01-01T10:00:00Z" }] } } });
  const result = await executeGoogleCalendarAvailability(config, "live", "workspace", credentials, busy as never);
  assert.equal(result.output.available, false);
  const error = async () => Response.json({ calendars: { primary: { errors: [{ reason: "notFound" }], busy: [] } } });
  await assert.rejects(executeGoogleCalendarAvailability(config, "live", "workspace", credentials, error as never), /could not be determined/);
});

test("an ambiguous update with notifications is not retried automatically", async () => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "token" }) } as never;
  const config = { credentialId: "credential", calendarId: "primary", eventId: "event-id", summary: "New title", sendUpdates: "all" };
  const transport = async () => { throw new Error("network"); };
  await assert.rejects(executeGoogleCalendarEvent(config, "update", "live", "workspace", credentials, transport as never), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "CALENDAR_UPDATE_OUTCOME_UNKNOWN" && "retryable" in error && error.retryable === false));
});
