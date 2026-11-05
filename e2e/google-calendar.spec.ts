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

test("event picker loads later pages and resets pagination when the calendar changes", async ({ page }) => {
  const graph = { nodes: [{ id: "calendar", type: "action.google-calendar.delete-event", position: { x: 100, y: 100 }, config: { credentialId: "calendar-1", calendarId: "primary", eventId: "", sendUpdates: "none" } }], edges: [] };
  const workflow = { id: "calendar-picker-pages", workspaceId: "workspace-1", name: "Calendar pages", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  const requests: URL[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "calendar-1", provider: "GOOGLE_CALENDAR", label: "My calendar" }] });
    if (url.pathname.endsWith("/google-calendar/calendars")) return send({ calendars: [{ id: "primary", name: "Personal" }, { id: "work", name: "Work" }] });
    if (url.pathname.endsWith("/google-calendar/events")) {
      requests.push(url);
      const second = url.searchParams.has("pageToken");
      return send({ events: [{ id: second ? "event-2" : "event-1", name: second ? "Second event" : "First event" }], hasMore: !second, nextPageToken: second ? null : "next-page", timeMin: "2030-01-01T09:00:00.000Z" });
    }
    if (url.pathname.endsWith("/workflows/calendar-picker-pages")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=calendar-picker-pages");
  await page.locator('.react-flow__node[data-id="calendar"]').click();
  const search = page.getByLabel("Event search");
  await search.fill("Second");
  await expect(page.getByText("Search only includes loaded events. Load more to search additional results.")).toBeVisible();
  await page.getByRole("button", { name: "Load more events" }).click();
  const event = page.getByRole("combobox", { name: "Event", exact: true });
  await expect(event.locator("option", { hasText: "Second event" })).toHaveCount(1);
  expect(requests[1]?.searchParams.get("pageToken")).toBe("next-page");
  expect(requests[1]?.searchParams.get("timeMin")).toBe("2030-01-01T09:00:00.000Z");
  await page.getByRole("combobox", { name: "Calendar", exact: true }).selectOption("work");
  await expect.poll(() => requests.some((request) => request.searchParams.get("calendarId") === "work")).toBe(true);
  expect(requests.filter((request) => request.searchParams.get("calendarId") === "work").every((request) => !request.searchParams.has("pageToken") && !request.searchParams.has("timeMin"))).toBe(true);
});

test("calendar continuation is cleared when its query context changes", async ({ page }) => {
  const graph = { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 10, y: 350 }, config: {} }, { id: "calendar", type: "action.google-calendar.list-events", position: { x: 100, y: 100 }, config: { credentialId: "calendar-1", calendarId: "primary", limit: 10, timeMin: "2030-01-01T09:00:00.000Z", pageToken: "previous-page" } }], edges: [] };
  const workflow = { id: "calendar-page-test", workspaceId: "workspace-1", name: "Calendar pages", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  const saves: Array<{ graph: { nodes: Array<{ id: string; config: Record<string, unknown> }> } }> = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "calendar-1", provider: "GOOGLE_CALENDAR", label: "First calendar account" }, { id: "calendar-2", provider: "GOOGLE_CALENDAR", label: "Second calendar account" }] });
    if (path.endsWith("/google-calendar/calendars")) return send({ calendars: [{ id: "primary", name: "Personal · primary" }, { id: "work", name: "Work" }] });
    if (path.endsWith("/workflows/calendar-page-test/draft") && request.method() === "PATCH") {
      const body = request.postDataJSON() as { graph: { nodes: Array<{ id: string; config: Record<string, unknown> }> } };
      saves.push(body); return send({ workflow: { ...workflow, draft: { ...workflow.draft, graph: body.graph } } });
    }
    if (path.endsWith("/workflows/calendar-page-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=calendar-page-test");
  await page.locator('.react-flow__node[data-id="calendar"]').click();
  await page.getByText("Advanced pagination", { exact: true }).click();
  const token = page.getByLabel("Next page token (reuse original start and limit)");
  await expect(token).toHaveValue("previous-page");
  await page.getByLabel("Google Calendar credential").selectOption("calendar-2");
  await expect(token).toHaveValue("");
  await token.fill("previous-page");
  await page.getByRole("combobox", { name: "Calendar", exact: true }).selectOption("work");
  await expect(token).toHaveValue("");
  await token.fill("previous-page");
  await page.getByLabel("Maximum events (1–50)").fill("20");
  await expect(token).toHaveValue("");
  await token.fill("previous-page");
  await page.getByLabel("Start after (optional)").fill("2030-02-01T09:00");
  await expect(token).toHaveValue("");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]!.graph.nodes.find((node) => node.id === "calendar")!.config.pageToken).toBe("");
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

test.describe("Calendar timestamps retain their precision", () => {
  test.use({ timezoneId: "UTC" });
  test("shows and saves seconds and milliseconds in the start time", async ({ page }) => {
    const graph = { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 10, y: 350 }, config: {} }, { id: "calendar", type: "action.google-calendar.list-events", position: { x: 100, y: 100 }, config: { credentialId: "calendar-1", calendarId: "primary", limit: 10, timeMin: "2030-01-01T09:00:37.123Z", pageToken: "" } }], edges: [] };
    const workflow = { id: "calendar-precision-test", workspaceId: "workspace-1", name: "Calendar precision", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
    const saves: Array<{ graph: { nodes: Array<{ id: string; config: Record<string, unknown> }> } }> = [];
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
      if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
      if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
      if (path.endsWith("/credentials")) return send({ credentials: [{ id: "calendar-1", provider: "GOOGLE_CALENDAR", label: "My calendar" }] });
      if (path.endsWith("/google-calendar/calendars")) return send({ calendars: [{ id: "primary", name: "Personal · primary" }] });
      if (path.endsWith("/workflows/calendar-precision-test/draft") && request.method() === "PATCH") {
        const body = request.postDataJSON() as { graph: { nodes: Array<{ id: string; config: Record<string, unknown> }> } };
        saves.push(body); return send({ workflow: { ...workflow, draft: { ...workflow.draft, graph: body.graph } } });
      }
      if (path.endsWith("/workflows/calendar-precision-test")) return send({ workflow });
      return route.continue();
    });
    await page.goto("/editor?workflow=calendar-precision-test");
    await page.locator('.react-flow__node[data-id="calendar"]').click();
    const start = page.getByLabel("Start after (optional)");
    await expect(start).toHaveValue("2030-01-01T09:00:37.123");
    await start.fill("2030-02-01T09:00:42.456");
    await expect(start).toHaveValue("2030-02-01T09:00:42.456");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0]!.graph.nodes.find((node) => node.id === "calendar")!.config.timeMin).toBe("2030-02-01T09:00:42.456Z");
  });
});
