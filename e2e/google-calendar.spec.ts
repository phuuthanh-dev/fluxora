import { expect, test } from "@playwright/test";

test("Google Calendar lists upcoming events using a dedicated credential", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "calendar", type: "action.google-calendar.list-events", position: { x: 400, y: 100 }, config: { credentialId: "calendar-1", calendarId: "primary", limit: 10 } },
  ], edges: [] };
  const workflow = { id: "calendar-test", workspaceId: "workspace-1", name: "Calendar test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "calendar-1", provider: "GOOGLE_CALENDAR", label: "My calendar" }] });
    if (path.endsWith("/google-calendar/calendars")) return send({ calendars: [{ id: "calendar-primary", name: "Personal · primary" }, { id: "calendar-work", name: "Work" }], nextPageToken: null });
    if (path.endsWith("/workflows/calendar-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=calendar-test");
  await page.locator(".react-flow__node").filter({ hasText: "List upcoming events" }).click();
  await expect(page.getByLabel("Google Calendar credential")).toHaveValue("calendar-1");
  await expect(page.getByRole("combobox", { name: "Calendar", exact: true }).locator("option", { hasText: "Work" })).toHaveCount(1);
  await page.getByRole("combobox", { name: "Calendar", exact: true }).selectOption("calendar-work");
  await expect(page.getByRole("combobox", { name: "Calendar", exact: true })).toHaveValue("calendar-work");
  await expect(page.getByLabel("Maximum events (1–50)")).toHaveValue("10");
});

test("calendar event selection resets when the calendar changes", async ({ page }) => {
  const graph = { nodes: [{ id: "calendar", type: "action.google-calendar.delete-event", position: { x: 100, y: 100 }, config: { credentialId: "calendar-1", calendarId: "primary", eventId: "event-1", sendUpdates: "none" } }], edges: [] };
  const workflow = { id: "calendar-event-test", workspaceId: "workspace-1", name: "Calendar test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "calendar-1", provider: "GOOGLE_CALENDAR", label: "My calendar" }] });
    if (path.endsWith("/google-calendar/calendars")) return send({ calendars: [{ id: "primary", name: "Personal · primary" }, { id: "work", name: "Work" }] });
    if (path.endsWith("/google-calendar/events")) return send({ events: [{ id: "event-1", name: "Meeting · 2030-01-01" }], hasMore: false });
    if (path.endsWith("/workflows/calendar-event-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=calendar-event-test");
  await page.locator(".react-flow__node").filter({ hasText: "Delete event" }).click();
  await expect(page.getByRole("combobox", { name: "Event", exact: true })).toHaveValue("event-1");
  await page.getByRole("combobox", { name: "Calendar", exact: true }).selectOption("work");
  await expect(page.getByRole("combobox", { name: "Event", exact: true })).toHaveValue("");
});

test("create event offers date controls and explicit invitation options", async ({ page }) => {
  const graph = { nodes: [{ id: "calendar", type: "action.google-calendar.create-event", position: { x: 100, y: 100 }, config: { credentialId: "calendar-1", calendarId: "primary", summary: "", start: "", end: "", sendUpdates: "none" } }], edges: [] };
  const workflow = { id: "calendar-create-test", workspaceId: "workspace-1", name: "Calendar test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "calendar-1", provider: "GOOGLE_CALENDAR", label: "My calendar" }] });
    if (path.endsWith("/google-calendar/calendars")) return send({ calendars: [{ id: "primary", name: "Personal · primary" }] });
    if (path.endsWith("/workflows/calendar-create-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=calendar-create-test");
  await page.locator(".react-flow__node").filter({ hasText: "Create event" }).click();
  await expect(page.getByLabel("Start", { exact: true })).toHaveAttribute("type", "datetime-local");
  await page.getByLabel("Start", { exact: true }).fill("2030-01-01T09:00");
  await expect(page.getByLabel("Start", { exact: true })).toHaveValue("2030-01-01T09:00");
  await expect(page.getByLabel("Send email invitations")).toHaveValue("none");
});
