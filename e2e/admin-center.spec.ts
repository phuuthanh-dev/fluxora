import { expect, test } from "@playwright/test";

test("administration displays bounded metadata and account controls in both themes", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/v1/admin/overview": { users: 2, workspaces: 1, workflows: 1, activeWorkflows: 1, failedRuns: 0, health: { status: "ready", checks: { database: "ready", scheduler: "disabled", queue: { status: "ready" } } } },
      "/api/v1/admin/access": { allowed: true },
      "/api/v1/admin/users": { users: [{ id: "other", email: "other@example.test", displayName: "Sample user", createdAt: "2026-01-01T00:00:00Z", disabledAt: null, _count: { ownedWorkspaces: 1 } }] },
      "/api/v1/workspaces": { workspaces: [{ id: "space", name: "Sample workspace", slug: "sample", role: "OWNER" }] },
      "/api/v1/auth/me": { user: { email: "admin@example.test", displayName: "Admin", avatarColor: "lime" } },
      "/api/v1/auth/identities": { identities: [] },
      "/api/v1/auth/providers": { google: false, github: false, steam: false },
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data[path] ?? {}) });
  });
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => localStorage.setItem("fluxora-theme", value), theme);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Platform administration" })).toBeVisible();
    await expect(page.getByText("Active workflows", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Users", exact: true }).click();
    await expect(page.getByText("other@example.test")).toBeVisible();
    await expect(page.getByRole("button", { name: "Disable sign-in" })).toBeVisible();
  }
});
