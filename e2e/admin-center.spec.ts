import { expect, test } from "@playwright/test";

test("admin has separate navigation, safe account menus, states and execution filters in both themes", async ({ page }, testInfo) => {
  const executionRequests: string[] = [], mutations: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === "/api/v1/admin/executions") executionRequests.push(url.search);
    if (route.request().method() === "POST") mutations.push(path);
    const data: Record<string, unknown> = {
      "/api/v1/admin/overview": { users: 3, workspaces: 1, workflows: 1, activeWorkflows: 1, failedRuns: 0, health: { status: "ready", checks: { database: "ready", scheduler: "disabled", queue: { status: "ready" } } } },
      "/api/v1/admin/access": { allowed: true, userId: "admin" },
      "/api/v1/admin/users": { users: url.searchParams.get("q") ? [] : [{ id: "other", email: "other@example.test", displayName: "Sample user", createdAt: "2026-01-01T00:00:00Z", disabledAt: null, _count: { ownedWorkspaces: 1 } }, { id: "admin", email: "admin@example.test", displayName: "Admin", createdAt: "2026-01-01T00:00:00Z", disabledAt: null, _count: { ownedWorkspaces: 1 } }, { id: "disabled", email: "disabled@example.test", displayName: "Disabled user", createdAt: "2026-01-01T00:00:00Z", disabledAt: "2026-01-02T00:00:00Z", _count: { ownedWorkspaces: 0 } }], hasMore: false },
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
    await page.screenshot({ path: testInfo.outputPath(`admin-overview-${theme}.png`), animations: "disabled" });
    await page.getByRole("navigation", { name: "Platform administration" }).getByRole("link", { name: "Users", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/users/);
    // Loading this route directly must not depend on styles from another page.
    await page.reload();
    await expect(page.getByText("other@example.test", { exact: true })).toBeVisible();
    await expect(page.getByLabel("admin@example.test actions")).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: "other@example.test" });
    const closedRow = await row.boundingBox();
    await page.getByLabel("other@example.test actions").click();
    const menu = page.getByRole("menu", { name: "other@example.test menu" });
    const signOut = menu.getByRole("menuitem", { name: "Sign out sessions" });
    const disable = menu.getByRole("menuitem", { name: "Disable sign-in" });
    await expect(disable).toBeVisible();
    await expect(menu).toHaveCSS("position", "absolute");
    await expect(menu).toHaveCSS("background-color", theme === "light" ? "rgb(255, 254, 249)" : "rgb(17, 23, 18)");
    expect((await row.boundingBox())!.height).toBe(closedRow!.height);
    expect((await row.boundingBox())!.width).toBe(closedRow!.width);
    const firstItem = (await signOut.boundingBox())!, secondItem = (await disable.boundingBox())!;
    // Chromium can round a 36px transformed DOMRect to 35.99997px.
    expect(firstItem.height).toBeGreaterThanOrEqual(36 - 0.01);
    expect(secondItem.y).toBeGreaterThanOrEqual(firstItem.y + firstItem.height);
    expect(Math.abs(firstItem.x - secondItem.x)).toBeLessThan(1);
    await expect(disable).toHaveAttribute("data-tone", "danger");
    // Visible means painted and clickable, including inside the table scroller.
    expect(await disable.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`admin-users-menu-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(page.getByLabel("other@example.test actions")).toBeFocused();
    await page.getByLabel("other@example.test actions").press("ArrowDown");
    await expect(signOut).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(disable).toBeFocused();
    await disable.click();
    await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveClass(/ui-button--danger/);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Confirm account action" })).toHaveCount(0);
    await expect(page.getByLabel("other@example.test actions")).toBeFocused();
    await page.getByLabel("other@example.test actions").click();
    await page.getByRole("menuitem", { name: "Sign out sessions" }).click();
    await expect(page.getByRole("dialog", { name: "Confirm account action" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    // Wait for the modal exit/focus restoration before opening another row's menu.
    await expect(page.getByRole("dialog", { name: "Confirm account action" })).toHaveCount(0);
    await expect(page.getByLabel("other@example.test actions")).toBeFocused();
    await page.getByLabel("disabled@example.test actions").press("ArrowUp");
    const enable = page.getByRole("menuitem", { name: "Enable sign-in" });
    await expect(enable).toBeFocused();
    expect(await enable.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.keyboard.press("Escape");
    expect(mutations).toEqual([]);
    await page.getByRole("textbox", { name: "Search users" }).fill("no-match");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No users found" })).toBeVisible();
    await page.getByRole("link", { name: "Executions", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveCSS("border-top-style", "solid");
    await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveCSS("min-height", "38px");
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("FAILED");
    await page.getByRole("combobox", { name: "Period", exact: true }).selectOption("7d");
    await expect.poll(() => executionRequests.some((search) => search.includes("status=FAILED") && search.includes("period=7d"))).toBe(true);
    await expect(page.getByRole("heading", { name: "No executions found" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("admin follows user context to run metadata and filters audit without workspace payload access", async ({ page }) => {
  const requests: URL[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); requests.push(url);
    const data: Record<string, unknown> = {
      "/api/v1/admin/access": { allowed: true, userId: "admin" },
      "/api/v1/admin/users": { users: [{ id: "u1", email: "owner@example.test", displayName: "Owner", createdAt: "2026-11-01T00:00:00Z", disabledAt: null, _count: { ownedWorkspaces: 1 } }] },
      "/api/v1/admin/workspaces": { workspaces: [{ id: "s1", name: "Sample workspace", effectivePlan: "FREE", trialExpiresAt: null, owner: { id: "u1", email: "owner@example.test" }, updatedAt: "2026-11-01T00:00:00Z", _count: { workflows: 1 } }] },
      "/api/v1/admin/workflows": { workflows: [{ id: "w1", name: "Sample workflow", workspace: { id: "s1", name: "Sample workspace" }, updatedAt: "2026-11-01T00:00:00Z", archivedAt: null, isActive: false }] },
      "/api/v1/admin/executions": { executions: [{ id: "e1", status: "FAILED", mode: "MOCK", createdAt: "2026-11-01T00:00:00Z", startedAt: "2026-11-01T00:00:00Z", completedAt: "2026-11-01T00:00:01Z", errorCode: "INVALID_CONFIGURATION", workflowVersion: { version: 2, workflow: { id: "w1", name: "Sample workflow", workspace: { id: "s1", name: "Sample workspace" } } } }] },
      "/api/v1/admin/audit": { events: [{ id: "a1", action: "workflow.published", actor: { id: "u1", email: "owner@example.test" }, targetType: "workflow", targetId: "w1", workspaceId: "s1", createdAt: "2026-11-01T00:00:00Z" }] },
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data[url.pathname] ?? {}) });
  });
  await page.goto("/admin/users");
  await page.getByRole("link", { name: "1 workspaces", exact: true }).click();
  await expect(page).toHaveURL(/workspaces\?userId=u1/);
  await page.getByRole("link", { name: "Sample workspace", exact: true }).click();
  await expect(page).toHaveURL(/workflows\?workspaceId=s1/);
  await page.getByRole("link", { name: "Sample workflow", exact: true }).click();
  await expect(page).toHaveURL(/executions\?workflowId=w1/);
  await expect(page.getByRole("combobox", { name: "Period", exact: true })).toHaveValue("all");
  await page.getByText("Run details", { exact: true }).click();
  await expect(page.getByText("INVALID_CONFIGURATION", { exact: true })).toBeVisible();
  await expect(page.getByText("Inputs and outputs remain in the workspace.")).toBeVisible();
  await page.getByRole("navigation", { name: "Platform administration" }).getByRole("link", { name: "Audit", exact: true }).click();
  await page.getByLabel("Actor email").fill("owner@example.test");
  await page.getByLabel("From (UTC)").fill("2026-11-01");
  await page.getByLabel("Through (UTC)").fill("2026-11-09");
  await page.getByRole("combobox", { name: "Target type", exact: true }).selectOption("workflow");
  await page.getByLabel("Target ID").fill("w1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => requests.some((url) => url.pathname.endsWith("/audit") && url.searchParams.get("actor") === "owner@example.test" && url.searchParams.get("from") === "2026-11-01" && url.searchParams.get("to") === "2026-11-09" && url.searchParams.get("targetId") === "w1")).toBe(true);
  await expect(page.getByText("w1", { exact: true })).toBeVisible();
  expect(requests.every((url) => url.pathname.startsWith("/api/v1/admin/"))).toBe(true);
});

test("administration navigation stays reachable on short screens, in compact mode and in the mobile drawer", async ({ page }, testInfo) => {
  await page.route("**/api/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().endsWith("/admin/access") ? { allowed: true, userId: "admin" } : {}) }));
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/support");
    const nav = page.getByRole("navigation", { name: "Platform administration" });
    await expect(nav).toBeVisible();
    const toggle = page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const sidebar = page.getByRole("complementary", { name: "Administration sidebar" });
    await expect(nav.getByRole("link", { name: "Support", exact: true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: testInfo.outputPath(`admin-navigation-${theme}.png`) });
    await page.setViewportSize({ width: 1280, height: 520 });
    const footer = sidebar.getByRole("link", { name: "Back to workspace", exact: true });
    await expect(footer).toBeInViewport();
    expect(await nav.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await nav.getByRole("link", { name: "Support", exact: true }).focus();
    await expect(nav.getByRole("link", { name: "Support", exact: true })).toBeInViewport();
    await expect(footer).toBeInViewport();
    await page.getByRole("button", { name: "Collapse administration sidebar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expand administration sidebar", exact: true })).toHaveAttribute("aria-expanded", "false");
    expect((await sidebar.boundingBox())!.width).toBe(76);
    // Compact navigation retains accessible names and survives a direct route load.
    await nav.getByRole("link", { name: "Users", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/users/);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand administration sidebar", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Users", exact: true })).toHaveAttribute("aria-current", "page");
    await page.setViewportSize({ width: 390, height: 720 });
    await expect(sidebar).toBeHidden();
    const open = page.getByRole("button", { name: "Open administration navigation", exact: true });
    await open.click();
    const drawer = page.getByRole("dialog", { name: "Administration navigation", exact: true });
    const close = drawer.getByRole("button", { name: "Close administration navigation", exact: true });
    await expect(close).toBeFocused();
    await expect(drawer).toHaveCSS("opacity", "1");
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await expect(drawer.getByRole("link", { name: "Back to workspace", exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`admin-navigation-mobile-${theme}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(open).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await open.click();
    await drawer.getByRole("link", { name: "Support", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/support/);
    await expect(drawer).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await open.click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(drawer).toHaveCount(0);
    await page.getByRole("button", { name: "Expand administration sidebar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Collapse administration sidebar", exact: true })).toBeVisible();
  }
});
