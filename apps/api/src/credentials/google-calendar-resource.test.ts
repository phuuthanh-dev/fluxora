import assert from "node:assert/strict";
import test from "node:test";
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

test("event discovery returns upcoming event names after owner and credential checks", async () => {
  const controller = new GoogleCalendarResourceController({ requireOwner: async () => {}, readGoogleForExecution: async () => ({ accessToken: "token" }) } as never);
  Object.defineProperty(controller, "getEvents", { value: async () => ({ events: [{ id: "event", summary: "Meeting", start: "2030-01-01T09:00:00Z" }], hasMore: true }) });
  const result = await controller.events("workspace", "credential", { currentUser: { id: "owner" } } as never, "primary");
  assert.deepEqual(result, { events: [{ id: "event", name: "Meeting · 2030-01-01T09:00:00Z" }], hasMore: true });
  await assert.rejects(controller.events("workspace", "credential", { currentUser: { id: "owner" } } as never));
});
