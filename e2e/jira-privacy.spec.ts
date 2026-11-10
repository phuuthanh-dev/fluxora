import { expect, test } from "@playwright/test";

test("Jira Admin response review is accessible in both themes and requires a fresh confirmed scope", async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const id = "a".repeat(64), uncertainId = "b".repeat(64);
  const mutations: { path: string; body: Record<string, unknown> }[] = [];
  let blocked = false, stale = true, resolved = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith("/admin/access")) data = { allowed: true, userId: "admin" };
    if (path.endsWith("/records")) data = { enabled: false, records: resolved ? [] : [
      { id, state: "ACTION_REQUIRED", requiredAction: "updated", oldestDataAt: "2026-11-01T00:00:00Z", nextReportAt: "2026-11-17T00:00:00Z", lastReportedAt: "2026-11-10T00:00:00Z", coverageReviewedAt: null, connectionCount: 1, workspaceCount: 1 },
      { id: uncertainId, state: "UNCERTAIN", requiredAction: null, oldestDataAt: "2026-11-01T00:00:00Z", nextReportAt: "2026-11-17T00:00:00Z", lastReportedAt: null, lastAttemptAt: "2026-11-10T00:00:00Z", cycleDays: 7, coverageReviewedAt: "2026-11-01T00:00:00Z", connectionCount: 1, workspaceCount: 1 },
    ], nextCursor: null };
    if (path.endsWith("/preview")) data = { id, action: "updated", expiresAt: Date.now() + 900000, previewToken: "synthetic-preview", legacyReviewRequired: true, blockers: blocked ? ["Deactivate the affected workflows before erasing data."] : [], counts: { connections: 1, workflows: 1, executions: 2, nodes: 3, items: 1 }, workflows: [{ id: "flow", name: "Synthetic Jira workflow", isActive: blocked }], review: ["Review immutable workflow configuration.", "Review logs, backups and external destinations."] };
    if (route.request().method() === "POST") {
      mutations.push({ path, body: route.request().postDataJSON() as Record<string, unknown> });
      if (path.endsWith("/resolve") && stale) { stale = false; await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Affected data changed. Review a new preview." }) }); return; }
      if (path.endsWith("/resolve")) { resolved = true; data = { erasedExecutions: 2, removedConnections: 1 }; }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto("/admin/support");
  await expect(page.getByRole("link", { name: "Privacy", exact: true })).toHaveCount(0);
  const requests = page.getByRole("button", { name: "Review data requests", exact: true });
  await expect(requests).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "Jira data requests", exact: true })).toHaveCount(0);
  await requests.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide data requests", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Inventory current connections", exact: true })).not.toBeVisible();
  for (const theme of ["light", "dark"]) {
    const toggle = page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.screenshot({ path: testInfo.outputPath(`jira-support-${theme}.png`), fullPage: true });
    await page.getByRole("button", { name: "Review affected data", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Review Jira data erasure", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".admin-dialog-backdrop")).toHaveCSS("position", "fixed");
    const colors = await dialog.evaluate((element) => ({ text: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
    const luminance = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).reduce((sum, channel, index) => {
      const value = channel / 255;
      return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * ([0.2126, 0.7152, 0.0722][index] ?? 0);
    }, 0);
    expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
    const light = Math.max(luminance(colors.text), luminance(colors.background)), dark = Math.min(luminance(colors.text), luminance(colors.background));
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
    await expect(dialog.getByRole("button", { name: "Erase reviewed data" })).toBeDisabled();
    await expect(dialog.getByText("Synthetic Jira workflow", { exact: true })).not.toBeVisible();
    await dialog.getByText("Affected workflows (1)", { exact: true }).click();
    await expect(dialog.getByText(/Synthetic Jira workflow/)).toBeVisible();
    await dialog.getByRole("heading", { name: "Review before erasing", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`jira-privacy-review-${theme}.png`) });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "Review uncertain attempt" }).click();
  const recovery = page.getByRole("dialog", { name: "Review uncertain Jira report" });
  await expect(recovery.getByText(/Last known reporting cycle: 7 days/)).toBeVisible();
  await expect(recovery.getByRole("button", { name: "Schedule reviewed report" })).toBeDisabled();
  await recovery.getByLabel("Confirmed next eligible report time").fill("2026-12-01T12:00");
  await recovery.getByLabel("Review reference").fill("SYNTHETIC-PROVIDER-REVIEW");
  await recovery.getByRole("checkbox", { name: /verified the provider outcome/ }).check();
  await recovery.getByRole("button", { name: "Schedule reviewed report" }).click();
  await expect(page.getByText(/Reviewed report rescheduled/)).toBeVisible();
  expect(mutations.pop()?.path).toBe(`/api/v1/admin/jira-privacy-reporting/${uncertainId}/recover`);
  blocked = true;
  await page.getByRole("button", { name: "Review affected data", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Review Jira data erasure", exact: true });
  await expect(dialog.getByText(/Deactivate the affected workflows/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Erase reviewed data" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  blocked = false;
  async function fillReview() {
    await page.getByRole("button", { name: "Review affected data", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Review Jira data erasure", exact: true });
    await dialog.getByLabel("Type ERASE to confirm", { exact: true }).fill("ERASE");
    await dialog.getByLabel("Review reference").fill("SYNTHETIC-REVIEW-1");
    await dialog.getByRole("checkbox", { name: /completed the legacy inventory/ }).check();
    await dialog.getByRole("checkbox", { name: /reviewed configuration, logs/ }).check();
  }
  await fillReview();
  await dialog.getByRole("button", { name: "Erase reviewed data" }).click();
  await expect(dialog.getByText("Affected data changed. Review a new preview.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await fillReview();
  await dialog.getByRole("button", { name: "Erase reviewed data" }).click();
  await expect(page.getByText(/Resolved: 2 execution payloads erased/)).toBeVisible();
  expect(mutations).toHaveLength(2);
  expect(mutations[1].body).toMatchObject({ previewToken: "synthetic-preview", copiesReviewed: true, legacyReviewed: true, confirmation: "ERASE", reviewReference: "SYNTHETIC-REVIEW-1" });
  expect(mutations.every((item) => item.path.startsWith("/api/v1/admin/jira-privacy-reporting/"))).toBe(true);
  await expect(page.getByRole("heading", { name: "No pending Jira requests" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("jira-support-mobile.png") });
  await page.getByRole("button", { name: "Hide data requests", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jira data requests", exact: true })).toHaveCount(0);
  const removedRoute = await page.goto("/admin/privacy");
  expect(removedRoute?.status()).toBe(404);
});
