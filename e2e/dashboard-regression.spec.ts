import { expect, test } from "@playwright/test";

// Shared helpers
async function signUpAndDashboard(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Regression Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("runtime panel shows checking state then ready state after sign-in", async ({ page }) => {
  const email = `regression-rt-${Date.now()}@example.test`;

  // Delay the readiness endpoint to observe the checking state
  let resolveReady!: (value: unknown) => void;
  const readyGate = new Promise((resolve) => { resolveReady = resolve; });
  await page.route("**/health/ready", async (route) => {
    await readyGate;
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Regression Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Before releasing the gate, checking state should appear
  const runtimePanel = page.locator(".dashboard-runtime");
  await expect(runtimePanel).toHaveClass(/dashboard-runtime--checking/);
  await expect(page.getByText("Checking runtime status…")).toBeVisible();

  // Release the gate; ready state should follow
  resolveReady(undefined);
  await expect(page.getByText("Execution runtime ready")).toBeVisible({ timeout: 10_000 });
  await expect(runtimePanel).toHaveClass(/dashboard-runtime--ready/);
});

test("runtime panel shows unreachable state when readiness endpoint fails", async ({ page }) => {
  const email = `regression-ru-${Date.now()}@example.test`;

  // Mock health/ready to return a network error
  await page.route("**/health/ready", (route) => route.abort("failed"));

  await signUpAndDashboard(page, email);

  const runtimePanel = page.locator(".dashboard-runtime");
  await expect(runtimePanel).toHaveClass(/dashboard-runtime--unreachable/, { timeout: 10_000 });
  await expect(page.getByText("Runtime status unreachable")).toBeVisible();
});

test("degraded runtime state is visually distinct from unreachable state", async ({ page }) => {
  const email = `regression-rd-${Date.now()}@example.test`;

  await page.route("**/health/ready", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "degraded",
        checks: {
          database: "ready",
          queue: { status: "unavailable", mode: "redis", configuredWorkerConcurrency: 2, waiting: 0, active: 0, delayed: 0, failed: 0 },
        },
      }),
    })
  );

  await signUpAndDashboard(page, email);

  const runtimePanel = page.locator(".dashboard-runtime");
  await expect(runtimePanel).toHaveClass(/dashboard-runtime--degraded/, { timeout: 10_000 });
  await expect(page.getByText("Execution runtime needs attention")).toBeVisible();
  // Must not show unreachable copy or class
  await expect(page.getByText("Runtime status unreachable")).not.toBeVisible();
  await expect(runtimePanel).not.toHaveClass(/dashboard-runtime--unreachable/);
});

test("light and dark themes stay readable across dashboard and editor", async ({ page }) => {
  const email = `regression-theme-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".dashboard-page")).toHaveCSS("background-color", "rgb(11, 16, 12)");
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page.locator(".canvas-region")).toHaveCSS("background-color", "rgb(11, 16, 12)");
  await expect(page.locator(".workflow-node").first()).toHaveCSS("background-color", "rgb(17, 23, 18)");

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".canvas-region")).toHaveCSS("background-color", "rgb(245, 247, 241)");
});

test("failed template creation shows error with retry button, preserves input, and allows retry", async ({ page }) => {
  const email = `regression-tc-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  // First call: fail
  let callCount = 0;
  await page.route("**/workflows/from-template/steam-daily-report", async (route) => {
    callCount++;
    if (callCount === 1) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Template service unavailable." }) });
    } else {
      await route.continue();
    }
  });

  const nameInput = page.locator('input[aria-label="New workflow name"]');
  await nameInput.fill("Custom Steam Report Name");
  await page.getByRole("button", { name: "Use Steam template" }).click();

  // Error must appear with role="alert"
  const errorAlert = page.locator(".dashboard-create__error");
  await expect(errorAlert).toBeVisible();
  await expect(errorAlert).toHaveAttribute("role", "alert");
  await expect(errorAlert).toContainText("Template service unavailable.");

  // Preserved input
  await expect(nameInput).toHaveValue("Custom Steam Report Name");

  // Button must be re-enabled
  await expect(page.getByRole("button", { name: "Use Steam template" })).toBeEnabled();

  // Retry using the explicit Retry button inside the alert
  const retryButton = errorAlert.getByRole("button", { name: "Retry" });
  await expect(retryButton).toBeVisible();
  await retryButton.click();

  // Retry succeeds — navigate to editor
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
});

test("failed blank workflow creation shows error alert with retry and preserves entered name", async ({ page }) => {
  const email = `regression-blank-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  let callCount = 0;
  await page.route("**/workspaces/*/workflows", async (route) => {
    if (route.request().method() === "POST") {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Unable to create blank workflow." }) });
        return;
      }
    }
    await route.continue();
  });

  const nameInput = page.locator('input[aria-label="New workflow name"]');
  await nameInput.fill("Preserved Blank Workflow");
  await page.getByRole("button", { name: "Blank workflow" }).click();

  // Error alert must appear with role="alert"
  const errorAlert = page.locator(".dashboard-create__error");
  await expect(errorAlert).toBeVisible();
  await expect(errorAlert).toHaveAttribute("role", "alert");
  await expect(errorAlert).toContainText("Unable to create blank workflow.");

  // Preserved input
  await expect(nameInput).toHaveValue("Preserved Blank Workflow");

  // Retry using the explicit Retry button inside the alert
  const retryButton = errorAlert.getByRole("button", { name: "Retry" });
  await expect(retryButton).toBeVisible();
  await retryButton.click();

  // Retry succeeds — navigate to editor with preserved workflow name
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Preserved Blank Workflow" })).toBeVisible({ timeout: 10_000 });
});

test("switching workspace clears stale workflows and guards against out-of-order race", async ({ page }) => {
  const email = `regression-ws-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  // Default workspace is Workspace A.
  // 1. Seed/create a distinct workflow in Workspace A.
  await page.locator('input[aria-label="New workflow name"]').fill("Alpha Unique Automation");
  await page.getByRole("button", { name: "Blank workflow" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.goto("/dashboard");
  await expect(page.getByText("Alpha Unique Automation")).toBeVisible({ timeout: 10_000 });

  // 2. Create Workspace B.
  await page.locator('input[aria-label="New workspace name"]').fill("Second workspace");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText("Workspace created. Start its first workflow.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("No workflows in this workspace")).toBeVisible();

  // Get workspace options
  const workspaceSelect = page.locator("select#dashboard-workspace");
  const options = workspaceSelect.locator("option");
  const secondWorkspaceId = await options.first().getAttribute("value");
  const firstWorkspaceId = await options.nth(1).getAttribute("value");
  expect(firstWorkspaceId).toBeTruthy();
  expect(secondWorkspaceId).toBeTruthy();

  // 3. Start a delayed request for Workspace A.
  let resolveWfA!: (value: unknown) => void;
  const wfGateA = new Promise((resolve) => { resolveWfA = resolve; });
  let delayedCallFired = false;

  await page.route(`**/workspaces/${firstWorkspaceId}/workflows`, async (route) => {
    delayedCallFired = true;
    await wfGateA;
    await route.continue();
  });

  // Switch to Workspace A (request is sent and held by wfGateA).
  await workspaceSelect.selectOption({ value: firstWorkspaceId });

  // 4. Switch again before the delayed response resolves: switch back to Workspace B.
  await workspaceSelect.selectOption({ value: secondWorkspaceId });

  // Stale workflows from Workspace A must not appear under Workspace B while loading.
  await expect(page.getByText("Alpha Unique Automation")).not.toBeVisible();

  // 5. Release the stale response from Workspace A.
  resolveWfA(undefined);

  // Wait a moment for network promises to settle and verify that Workspace A's workflow
  // NEVER appears under currently selected Workspace B.
  await page.waitForTimeout(500);
  await expect(page.getByText("Alpha Unique Automation")).not.toBeVisible();
  await expect(page.getByText("No workflows in this workspace")).toBeVisible();
  expect(delayedCallFired).toBe(true);
});

test("editor workflow library: creation failure shows alert, preserves input, and allows retry", async ({ page }) => {
  const email = `regression-lib-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  // Navigate to editor with steam template
  const createTemplate = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/workflows/from-template/steam-daily-report"));
  await page.getByRole("button", { name: "Use Steam template" }).click();
  expect((await createTemplate).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });

  // Open Manage -> Workflows (Workflow library panel)
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Workflows" }).click();
  await expect(page.getByRole("dialog", { name: "Workflow library" })).toBeVisible();

  // Set up mock to fail first workflow creation attempt
  let attempt = 0;
  await page.route("**/workspaces/*/workflows", async (route) => {
    if (route.request().method() === "POST") {
      attempt++;
      if (attempt === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Failed to create workflow in library." }),
        });
        return;
      }
    }
    await route.continue();
  });

  const libraryNameInput = page.locator('.workflow-library__new input[aria-label="New workflow name"]');
  await libraryNameInput.fill("Preserved Custom Name");
  await page.getByRole("button", { name: "Start blank" }).click();

  // Verify role="alert" accessibility
  const errorAlert = page.locator(".workflow-library__error");
  await expect(errorAlert).toBeVisible();
  await expect(errorAlert).toHaveAttribute("role", "alert");
  await expect(errorAlert).toContainText("Failed to create workflow in library.");

  // Verify entered input is preserved
  await expect(libraryNameInput).toHaveValue("Preserved Custom Name");

  // Verify retry action
  const retryButton = errorAlert.getByRole("button", { name: "Retry" });
  await expect(retryButton).toBeVisible();
  await retryButton.click();

  // Should succeed, close library dialog, and open new workflow
  await expect(page.getByRole("dialog", { name: "Workflow library" })).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Preserved Custom Name" })).toBeVisible({ timeout: 10_000 });
});
