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
  await expect(page.getByText("Checking runtime status…")).toBeVisible();

  // Release the gate; ready state should follow
  resolveReady(undefined);
  await expect(page.getByText("Execution runtime ready")).toBeVisible({ timeout: 10_000 });
});

test("runtime panel shows unreachable state when readiness endpoint fails", async ({ page }) => {
  const email = `regression-ru-${Date.now()}@example.test`;

  // Mock health/ready to return a network error
  await page.route("**/health/ready", (route) => route.abort("failed"));

  await signUpAndDashboard(page, email);

  await expect(page.getByText("Runtime status unreachable")).toBeVisible({ timeout: 10_000 });
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

  await expect(page.getByText("Execution runtime needs attention")).toBeVisible({ timeout: 10_000 });
  // Must not show unreachable copy
  await expect(page.getByText("Runtime status unreachable")).not.toBeVisible();
});

test("failed template creation shows error, restores button, and allows retry", async ({ page }) => {
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

  await page.getByRole("button", { name: "Use Steam template" }).click();

  // Error must appear
  await expect(page.locator(".dashboard-create__error")).toContainText("Template service unavailable.");
  await expect(page.locator(".dashboard-create__error")).toHaveAttribute("role", "alert");

  // Button must be re-enabled
  await expect(page.getByRole("button", { name: "Use Steam template" })).toBeEnabled();

  // Retry succeeds — navigate to editor
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
});

test("switching workspace clears stale workflows before showing new ones", async ({ page }) => {
  const email = `regression-ws-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  // Create a second workspace
  await page.locator('input[aria-label="New workspace name"]').fill("Second workspace");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText("Workspace created. Start its first workflow.")).toBeVisible({ timeout: 10_000 });

  // Create a workflow in the first workspace — switch back first
  const workspaceSelect = page.locator("select#dashboard-workspace");
  const firstOption = workspaceSelect.locator("option").nth(1);
  const firstWorkspaceName = await firstOption.innerText();
  await workspaceSelect.selectOption({ label: firstWorkspaceName });

  // Intercept the workflows list for the second workspace to be slow
  const secondWorkspaceId = await workspaceSelect.locator("option").first().getAttribute("value");

  if (secondWorkspaceId) {
    let resolveWf!: (value: unknown) => void;
    const wfGate = new Promise((resolve) => { resolveWf = resolve; });
    await page.route(`**/workspaces/${secondWorkspaceId}/workflows`, async (route) => {
      await wfGate;
      await route.continue();
    });

    await workspaceSelect.selectOption({ value: secondWorkspaceId });

    // Stale workflows from first workspace must not be visible while loading
    await expect(page.getByText("Loading workflows…")).toBeVisible();
    // Workflow cards section should be empty (no stale cards)
    await expect(page.locator(".workflow-card")).toHaveCount(0);

    resolveWf(undefined);
  }
});
