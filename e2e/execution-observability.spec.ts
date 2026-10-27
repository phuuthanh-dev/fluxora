import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function signUpRunAndOpenDetails(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Runtime Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Run details", exact: true }).click();
}

test("execution timeline is keyboard-safe, theme-safe, zoom-safe, and downloads redacted diagnostics", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await signUpRunAndOpenDetails(page, `observability-${Date.now()}@example.test`);

  const panel = page.getByRole("dialog", { name: "Execution details" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run details" })).toBeVisible();
  await expect(panel.locator(".execution-timeline__item")).toHaveCount(3);
  await expect(panel.getByText(/attempt 1/).first()).toBeVisible();
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(960);

  const close = panel.getByRole("button", { name: "Close execution details" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-label"))).toBe("Execution details");

  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(panel).toHaveCSS("background-color", "rgb(13, 18, 14)");
  await expect(panel.getByText("Safe diagnostic snapshot")).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await expect(panel).toHaveCSS("background-color", "rgb(17, 21, 18)");

  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^fluxora-execution-.+-diagnostic\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, "utf8");
  expect(content).toContain('"schemaVersion": "fluxora.execution-diagnostic.v1"');
  expect(content).not.toMatch(/triggerData|"input"|"output"|authorization|webhookUrl|discord\.com\/api\/webhooks/);

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
});

test("execution details expose loading, API error with retry, empty state, and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Runtime Owner");
  await page.locator('input[autocomplete="email"]').fill(`observability-state-${Date.now()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });

  let releaseRequest!: () => void;
  const requestGate = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let detailRequests = 0;
  await page.route("**/executions/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (!/\/executions\/[^/]+$/.test(requestUrl.pathname) || requestUrl.searchParams.get("view") !== "timeline") return route.continue();
    detailRequests += 1;
    // Next.js development Strict Mode may run the mount effect twice. Hold both
    // initial requests so the loading surface remains observable and deterministic.
    if (detailRequests <= 2) {
      await requestGate;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Timeline temporarily unavailable." }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ execution: {
        id: "execution-empty",
        status: "QUEUED",
        mode: "mock",
        workflowId: "workflow-1",
        workflowVersion: 1,
        graph: { nodes: [], edges: [] },
        error: null,
        createdAt: "2026-10-27T10:00:00.000Z",
        startedAt: null,
        completedAt: null,
        durationMs: null,
        recoveryCount: 0,
        nodeExecutions: [],
      } }),
    });
  });

  await page.getByRole("button", { name: "Run details", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Execution details" });
  await expect(panel.getByText("Loading execution timeline")).toBeVisible();
  await expect(panel.locator(".ui-skeleton").first()).toHaveCSS("animation-name", "none");
  releaseRequest();
  await expect(panel.getByText("Could not load this run")).toBeVisible();
  await expect(panel.getByText("Timeline temporarily unavailable.")).toBeVisible();
  await panel.getByRole("button", { name: "Retry" }).click();
  await expect(panel.getByText("No node activity yet")).toBeVisible();
  await expect(panel.getByText("The run is queued or has not persisted its first node state.")).toBeVisible();
});
