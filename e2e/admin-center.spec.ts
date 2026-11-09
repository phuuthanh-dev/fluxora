import { expect, test } from "@playwright/test";

test("admin has separate navigation, safe account menus, states and execution filters in both themes", async ({ page }) => {
  const executionRequests: string[] = [], mutations: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === "/api/v1/admin/executions") executionRequests.push(url.search);
    if (route.request().method() === "POST") mutations.push(path);
    const data: Record<string, unknown> = {
      "/api/v1/admin/overview": { users: 2, workspaces: 1, workflows: 1, activeWorkflows: 1, failedRuns: 0, health: { status: "ready", checks: { database: "ready", scheduler: "disabled", queue: { status: "ready" } } } },
      "/api/v1/admin/access": { allowed: true, userId: "admin" },
      "/api/v1/admin/users": { users: url.searchParams.get("q") ? [] : [{ id: "other", email: "other@example.test", displayName: "Sample user", createdAt: "2026-01-01T00:00:00Z", disabledAt: null, _count: { ownedWorkspaces: 1 } }, { id: "admin", email: "admin@example.test", displayName: "Admin", createdAt: "2026-01-01T00:00:00Z", disabledAt: null, _count: { ownedWorkspaces: 1 } }], hasMore: false },
      "/api/v1/admin/executions": { executions: [], hasMore: false },
      "/api/v1/admin/users/other/revoke-sessions": { revoked: 2 },
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data[path] ?? {}) });
  });
  for (const theme of ["light", "dark"]) {
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: /Switch to (light|dark) mode/ })).toBeVisible();
    const themeToggle = page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true });
    if (await themeToggle.isVisible()) await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { name: "Platform administration" })).toBeVisible();
    await expect(page.getByText("Active workflows", { exact: true })).toBeVisible();
    await expect(page.getByText("Last 24 hours", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await page.getByRole("navigation", { name: "Platform administration" }).getByRole("link", { name: "Users", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByText("other@example.test", { exact: true })).toBeVisible();
    await expect(page.getByLabel("admin@example.test actions")).toHaveCount(0);
    await page.getByLabel("other@example.test actions").click();
    await expect(page.getByRole("menuitem", { name: "Disable sign-in" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Sign out sessions" }).click();
    await expect(page.getByRole("dialog", { name: "Confirm account action" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(mutations).toEqual([]);
    await page.getByRole("textbox", { name: "Search users" }).fill("no-match");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No users found" })).toBeVisible();
    await page.getByRole("link", { name: "Executions", exact: true }).click();
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("FAILED");
    await page.getByRole("combobox", { name: "Period", exact: true }).selectOption("7d");
    await expect.poll(() => executionRequests.some((search) => search.includes("status=FAILED") && search.includes("period=7d"))).toBe(true);
    await expect(page.getByRole("heading", { name: "No executions found" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
