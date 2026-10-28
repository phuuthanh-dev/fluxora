import { expect, test } from "@playwright/test";

test("execution filters request the selected status before pagination", async ({ page }) => {
  const seen: string[] = [];
  const views: Array<{ id: string; name: string; filter: string }> = [];
  const run = (id: string, status: string) => ({ id, workflowId: "workflow-1", workflowName: id, workflowVersion: 1, status, mode: "mock", createdAt: "2026-10-28T00:00:00Z", startedAt: null, completedAt: null, error: null });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/execution-retention")) return send({ retention: { successDays: 14, failedDays: 30, maxCount: 10000, enabled: true, countScope: "system" } });
    if (url.pathname.includes("/execution-views")) {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as { name: string; filter: string };
        const view = { id: "view-1", ...body };
        views.push(view);
        return send({ view });
      }
      if (route.request().method() === "DELETE") { views.splice(0, views.length); return send({ deleted: true }); }
      return send({ views });
    }
    if (url.pathname.endsWith("/executions")) {
      const filter = url.searchParams.get("filter") ?? "ALL";
      seen.push(filter);
      return send(filter === "FAILED" ? { executions: [run("Older failure", "FAILED")], nextCursor: null } : { executions: [run("Recent success", "SUCCEEDED")], nextCursor: "next-page" });
    }
    return route.continue();
  });
  await page.goto("/dashboard/executions?workspace=workspace-1");
  await expect(page.getByText("Recent success")).toBeVisible();
  await page.getByText("Execution retention", { exact: true }).click();
  await expect(page.getByText(/applies across the entire system/)).toBeVisible();
  await page.getByRole("button", { name: "Failed", exact: true }).click();
  await expect(page.getByText("Older failure")).toBeVisible();
  await expect(page.getByText("Recent success")).not.toBeVisible();
  expect(seen).toContain("FAILED");
  await expect(page.getByText("1 loaded")).toBeVisible();
  await page.getByText("Saved views", { exact: true }).click();
  await page.getByLabel("View name").fill("Failures");
  await page.getByRole("button", { name: "Save current filter" }).click();
  await expect(page.getByRole("button", { name: "Failures", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByText("Recent success")).toBeVisible();
  await page.getByRole("button", { name: "Failures", exact: true }).click();
  await expect(page.getByText("Older failure")).toBeVisible();
  await page.getByRole("button", { name: "Delete Failures" }).click();
  await page.getByRole("button", { name: "Confirm delete Failures" }).click();
  await expect(page.getByText("No saved views yet.")).toBeVisible();
});
