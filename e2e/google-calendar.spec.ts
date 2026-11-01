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
    if (path.endsWith("/workflows/calendar-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=calendar-test");
  await page.locator(".react-flow__node").filter({ hasText: "List upcoming events" }).click();
  await expect(page.getByLabel("Google Calendar credential")).toHaveValue("calendar-1");
  await expect(page.getByLabel("Calendar", { exact: true })).toHaveValue("primary");
  await expect(page.getByLabel("Maximum events (1–50)")).toHaveValue("10");
});
