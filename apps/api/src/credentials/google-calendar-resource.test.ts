import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { GoogleCalendarResourceController } from "./google-calendar-resource.controller";

test("calendar discovery checks workspace ownership and returns bounded names without tokens", async () => {
  let ownerChecks = 0; let credentialReads = 0;
  const controller = new GoogleCalendarResourceController({ requireOwner: async () => { ownerChecks++; }, readGoogleForExecution: async () => { credentialReads++; return { accessToken: "secret" }; } } as never);
  Object.defineProperty(controller, "getCalendar", { value: async () => ({ items: [{ id: "owner@example.test", summary: "Personal", primary: true }, { id: "work@example.test", summary: "Work" }], nextPageToken: "next" }) });
  const result = await controller.calendars("workspace", "credential", { currentUser: { id: "owner" } } as never);
  assert.equal(ownerChecks, 1); assert.equal(credentialReads, 1);
  assert.deepEqual(result.calendars, [{ id: "primary", name: "Personal · primary" }, { id: "work@example.test", name: "Work" }]);
  assert.ok(!JSON.stringify(result).includes("secret"));
  await assert.rejects(controller.calendars("workspace", "credential", { currentUser: { id: "owner" } } as never, "bad token"));
});

test("calendar discovery does not read a credential when owner access is denied", async () => {
  let reads = 0;
  const controller = new GoogleCalendarResourceController({ requireOwner: async () => { throw new Error("denied"); }, readGoogleForExecution: async () => { reads++; } } as never);
  await assert.rejects(controller.calendars("workspace", "credential", { currentUser: { id: "other" } } as never));
  assert.equal(reads, 0);
});

test("calendar discovery does not return an access token echoed in a name, ID or cursor", async () => {
  const token = "synthetic-calendar-access-token";
  const variants = [
    { items: [{ id: "owner@example.test", summary: `${"x".repeat(198)}${token}` }] },
    { items: [{ id: `calendar-${token}`, summary: "Work" }] },
    { items: [], nextPageToken: `cursor-${token}` },
  ];
  for (const data of variants) {
    const controller = new GoogleCalendarResourceController({ requireOwner: async () => {}, readGoogleForExecution: async () => ({ accessToken: token }) } as never);
    Object.defineProperty(controller, "getCalendar", { value: async () => data });
    await assert.rejects(controller.calendars("workspace", "credential", { currentUser: { id: "owner" } } as never), (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as { code: string }).code, "INVALID_RESPONSE");
      assert.ok(!JSON.stringify(error.getResponse()).includes(token));
      return true;
    });
  }
});

test("event discovery returns upcoming event names after owner and credential checks", async () => {
  const controller = new GoogleCalendarResourceController({ requireOwner: async () => {}, readGoogleForExecution: async () => ({ accessToken: "token" }) } as never);
  Object.defineProperty(controller, "getEvents", { value: async () => ({ events: [{ id: "event", summary: "Meeting", start: "2030-01-01T09:00:00Z" }], hasMore: true, nextPageToken: "next", timeMin: "2030-01-01T00:00:00.000Z" }) });
  const result = await controller.events("workspace", "credential", { currentUser: { id: "owner" } } as never, "primary");
  assert.deepEqual(result, { events: [{ id: "event", name: "Meeting · 2030-01-01T09:00:00Z" }], hasMore: true, nextPageToken: "next", timeMin: "2030-01-01T00:00:00.000Z" });
  await assert.rejects(controller.events("workspace", "credential", { currentUser: { id: "owner" } } as never));
});

test("event discovery keeps the original time for the next page and rejects incomplete continuation", async () => {
  let reads = 0;
  const controller = new GoogleCalendarResourceController({ requireOwner: async () => {}, readGoogleForExecution: async () => { reads++; return { accessToken: "token" }; } } as never);
  const calls: Array<{ start: Date | undefined; page: string | undefined }> = [];
  Object.defineProperty(controller, "getEvents", { value: async (_token: string, _calendar: string, _limit: number, _transport: unknown, start: Date | undefined, page: string | undefined) => {
    calls.push({ start, page });
    return { events: [], hasMore: false, nextPageToken: null, timeMin: start?.toISOString() };
  } });
  const request = { currentUser: { id: "owner" } } as never;
  await controller.events("workspace", "credential", request, "primary", "page-2", "2030-01-01T09:00:00.000Z");
  assert.equal(calls[0]?.start?.toISOString(), "2030-01-01T09:00:00.000Z");
  assert.equal(calls[0]?.page, "page-2");
  for (const [page, time] of [["page-2", undefined], [undefined, "2030-01-01T09:00:00.000Z"], ["bad token", "2030-01-01T09:00:00.000Z"], ["page-2", "2030-02-30T09:00:00.000Z"]]) {
    await assert.rejects(controller.events("workspace", "credential", request, "primary", page, time));
  }
  assert.equal(reads, 1);
});
