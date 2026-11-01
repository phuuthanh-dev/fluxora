import { expect, test, type Page } from "@playwright/test";

async function mockWorkspace(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [
      { id: "workspace-1", name: "First workspace", slug: "first", role: "OWNER" },
      { id: "workspace-2", name: "Other workspace", slug: "second", role: "OWNER" },
    ] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    return route.continue();
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [375, 1440]) {
    test(`Google recovery is readable in ${theme} at ${width}px`, async ({ page }, testInfo) => {
      await page.addInitScript((value) => localStorage.setItem("fluxora-theme", value), theme);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await mockWorkspace(page);
      await page.goto("/dashboard/connections?workspace=workspace-1&google_oauth=missing_refresh");
      const notice = page.getByRole("alert").filter({ hasText: "Google connection needs another try" });
      await expect(notice).toBeVisible();
      await expect(notice).toContainText("Any existing connection was not changed");
      await expect(notice.getByRole("button", { name: "Try Google again" })).toBeVisible();
      await expect(page.getByText(/Google requests access to view, create, edit and delete files/)).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const bounds = await notice.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath(`google-recovery-${theme}-${width}.png`) });
      await notice.getByRole("button", { name: "Dismiss" }).click();
      await expect(notice).toHaveCount(0);
      await expect(page).toHaveURL(/workspace=workspace-1$/);
    });
  }
}

test("Google recovery retry uses the verified workspace and makes no provider request itself", async ({ page }) => {
  await mockWorkspace(page);
  let requested = "";
  await page.route("**/credentials/google/connect", async (route) => {
    requested = route.request().url();
    await route.fulfill({ status: 200, contentType: "text/html", body: "Synthetic OAuth start" });
  });
  await page.goto("/dashboard/connections?workspace=workspace-1&google_oauth=missing_refresh");
  await page.getByRole("button", { name: "Try Google again" }).click();
  await expect.poll(() => requested).toContain("/workspaces/workspace-1/credentials/google/connect");
});
