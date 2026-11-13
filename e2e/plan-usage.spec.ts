import { expect, test } from "@playwright/test";

const catalog = {
  FREE: { name: "Free", priceVnd: 0, monthlyRuns: 1000, activeWorkflows: 5, workspaces: 1, concurrentRuns: 1 },
  STARTER: { name: "Starter", priceVnd: 99000, monthlyRuns: 3000, activeWorkflows: 15, workspaces: 2, concurrentRuns: 2 },
  PRO: { name: "Pro", priceVnd: 199000, monthlyRuns: 10000, activeWorkflows: 50, workspaces: 3, concurrentRuns: 3 },
};

test("plan usage shows honest retained counts and proposed prices in both themes", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/v1/workspaces": { workspaces: [{ id: "space-1", name: "Sample workspace", slug: "sample", role: "OWNER" }] },
      "/api/v1/workspaces/space-1/plan-usage": { plan: "FREE", trialExpiresAt: null, periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", retainedRuns: 42, activeWorkflows: 2, catalog },
      "/api/v1/auth/me": { user: { displayName: "Owner", email: "owner@example.test", avatarColor: "lime" } },
      "/api/v1/auth/identities": { identities: [] }, "/api/v1/auth/providers": { google: false, github: false, steam: false },
    };
    await route.fulfill({ status: path === "/api/v1/admin/access" ? 403 : 200, contentType: "application/json", body: JSON.stringify(data[path] ?? {}) });
  });
  await page.goto("/dashboard/plan");
  await expect(page.getByRole("heading", { name: "Plan & usage" })).toBeVisible();
  await expect(page.getByText("At least 42", { exact: true })).toBeVisible();
  await expect(page.getByText(/minimum, not a complete usage meter/)).toBeVisible();
  await expect(page.getByText(/No payment or plan limits are active/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Starter", exact: true })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    const toggle = page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 720, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("admin can review and save a bounded trial without collecting payment", async ({ page }) => {
  let posted = "";
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "POST") posted = request.postData() ?? "";
    const data: Record<string, unknown> = {
      "/api/v1/admin/access": { allowed: true, userId: "admin" },
      "/api/v1/admin/workspaces": { workspaces: [{ id: "s1", name: "Sample workspace", effectivePlan: "FREE", trialExpiresAt: null, owner: { id: "u1", email: "owner@example.test" }, updatedAt: "2026-11-01T00:00:00Z", _count: { workflows: 1 } }] },
      "/api/v1/admin/workspaces/s1/plan-usage": { retainedRuns: 2, activeWorkflows: 1 },
      "/api/v1/admin/workspaces/s1/trial-plan": { plan: "PRO", expiresAt: "2026-12-01T00:00:00.000Z" },
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data[path] ?? {}) });
  });
  await page.goto("/admin/workspaces");
  await page.getByRole("button", { name: "Manage plan" }).click();
  const dialog = page.getByRole("dialog", { name: "Manage trial plan" });
  await expect(dialog.getByText(/does not charge/)).toBeVisible();
  await dialog.getByLabel("Trial plan").selectOption("PRO");
  await dialog.getByLabel("Trial duration").selectOption("14");
  await dialog.getByRole("button", { name: "Save trial" }).click();
  await expect(page.getByText("Trial plan updated. No payment or limits were applied.")).toBeVisible();
  expect(JSON.parse(posted)).toEqual({ plan: "PRO", days: 14 });
});

test("paid plan screen handles no pending order and displays a pending order on mobile", async ({ page }) => {
  let pending = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/v1/workspaces": { workspaces: [{ id: "space-1", name: "Sample workspace", slug: "sample", role: "OWNER" }] },
      "/api/v1/workspaces/space-1/plan-usage": { plan: "FREE", trialExpiresAt: null, periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", retainedRuns: 0, trackedRuns: 0, meterComplete: true, activeWorkflows: 0, catalog },
      "/api/v1/workspaces/space-1/billing/availability": { available: true },
      "/api/v1/workspaces/space-1/billing/orders/latest": { order: pending ? { id: "order-1", plan: "STARTER", amount: 99000, status: "PENDING", canResume: true } : null },
      "/api/v1/auth/me": { user: { displayName: "Owner", email: "owner@example.test", avatarColor: "lime" } },
      "/api/v1/auth/identities": { identities: [] }, "/api/v1/auth/providers": { google: false, github: false, steam: false },
    };
    await route.fulfill({ status: path === "/api/v1/admin/access" ? 403 : 200, contentType: "application/json", body: JSON.stringify(data[path] ?? {}) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/plan");
  await expect(page.getByRole("heading", { name: "Plan & usage" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Payment status" })).toHaveCount(0);
  pending = true;
  await page.reload();
  const status = page.getByRole("region", { name: "Payment status" });
  await expect(status.getByText(/Payment link ready/)).toBeVisible();
  await expect(status.getByRole("button", { name: "Continue to payOS" })).toBeVisible();
  await expect(status.getByRole("button", { name: "Cancel payment link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose Pro" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a Starter owner reviews the full upgrade before opening checkout", async ({ page }) => {
  let checkoutBody: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/billing/checkout")) {
      checkoutBody = route.request().postDataJSON();
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "test conflict" }) });
      return;
    }
    const data: Record<string, unknown> = {
      "/api/v1/workspaces": { workspaces: [{ id: "space-1", name: "Sample workspace", slug: "sample", role: "OWNER" }] },
      "/api/v1/workspaces/space-1/plan-usage": { plan: "STARTER", paidUntil: "2099-12-01T00:00:00.000Z", trialExpiresAt: null, periodStart: "2026-11-01T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", retainedRuns: 0, trackedRuns: 0, meterComplete: true, activeWorkflows: 0, catalog },
      "/api/v1/workspaces/space-1/billing/availability": { available: true },
      "/api/v1/workspaces/space-1/billing/orders/latest": { order: null },
      "/api/v1/auth/me": { user: { displayName: "Owner", email: "owner@example.test", avatarColor: "lime" } },
      "/api/v1/auth/identities": { identities: [] }, "/api/v1/auth/providers": { google: false, github: false, steam: false },
    };
    await route.fulfill({ status: path === "/api/v1/admin/access" ? 403 : 200, contentType: "application/json", body: JSON.stringify(data[path] ?? {}) });
  });
  await page.goto("/dashboard/plan");
  await expect(page.getByRole("button", { name: "Renew Starter" })).toBeVisible();
  await page.getByRole("button", { name: "Upgrade to Pro" }).click();
  const dialog = page.getByRole("dialog", { name: "Review upgrade" });
  await expect(dialog.getByText(/199.000đ/)).toBeVisible();
  await expect(dialog.getByText(/remaining time will not be refunded or added/)).toBeVisible();
  await expect(dialog.getByText(/live-run quota resets/)).toBeVisible();
  expect(checkoutBody).toBeUndefined();
  await dialog.getByRole("button", { name: "Agree and continue to payOS" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(checkoutBody).toEqual({ plan: "PRO", upgradeFromPaidUntil: "2099-12-01T00:00:00.000Z", confirmUpgrade: true });
});

test("confirmed return refreshes the plan and allowance without a page reload", async ({ page }) => {
  let confirmed = false, usageRequests = 0;
  let signalInitialUsage!: () => void;
  const initialUsage = new Promise<void>((resolve) => { signalInitialUsage = resolve; });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/billing/orders/order-1/reconcile")) {
      await initialUsage;
      confirmed = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "PAID" }) });
      return;
    }
    if (path.endsWith("/plan-usage")) {
      usageRequests++;
      const data = { plan: confirmed ? "PRO" : "STARTER", paidUntil: "2099-12-01T00:00:00.000Z", trialExpiresAt: null, periodStart: "2026-11-13T00:00:00.000Z", periodEnd: "2026-12-01T00:00:00.000Z", retainedRuns: confirmed ? 0 : 42, trackedRuns: confirmed ? 0 : 42, meterComplete: true, activeWorkflows: 0, catalog };
      signalInitialUsage();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
      return;
    }
    const data: Record<string, unknown> = {
      "/api/v1/workspaces": { workspaces: [{ id: "space-1", name: "Sample workspace", slug: "sample", role: "OWNER" }] },
      "/api/v1/workspaces/space-1/billing/availability": { available: true },
      "/api/v1/workspaces/space-1/billing/orders/latest": { order: null },
      "/api/v1/auth/me": { user: { displayName: "Owner", email: "owner@example.test", avatarColor: "lime" } },
      "/api/v1/auth/identities": { identities: [] }, "/api/v1/auth/providers": { google: false, github: false, steam: false },
    };
    await route.fulfill({ status: path === "/api/v1/admin/access" ? 403 : 200, contentType: "application/json", body: JSON.stringify(data[path] ?? {}) });
  });
  await page.goto("/dashboard/plan?workspace=space-1&order=order-1");
  await expect(page.getByRole("heading", { name: "Pro", level: 2 })).toBeVisible();
  await expect(page.getByText("Payment confirmed. Updating your plan and usage.")).toBeVisible();
  expect(usageRequests).toBeGreaterThanOrEqual(2);
});
