import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function expectContrast(locator: Locator, minimum: number) {
  const sample = await locator.evaluate((element) => {
    const parseColor = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3 || (channels.length > 3 && channels[3] === 0)) return null;
      return channels.slice(0, 3);
    };
    const luminance = (color: number[]) => color
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      })
      .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);

    const foreground = parseColor(getComputedStyle(element).color);
    let current: Element | null = element;
    let background: number[] | null = null;
    while (current && !background) {
      background = parseColor(getComputedStyle(current).backgroundColor);
      current = current.parentElement;
    }
    if (!foreground || !background) return null;
    const [darker, lighter] = [luminance(foreground), luminance(background)].sort((left, right) => left - right);
    return (lighter + 0.05) / (darker + 0.05);
  });

  expect(sample).not.toBeNull();
  expect(sample!).toBeGreaterThanOrEqual(minimum);
}

// Shared helpers
async function signUpAndDashboard(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
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

  await page.goto("/login");
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

test("editor loading surface follows the selected light and dark theme", async ({ page }) => {
  const email = `regression-editor-loading-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });

  const workflowId = new URL(page.url()).searchParams.get("workflow");
  expect(workflowId).toBeTruthy();

  let releaseLoad!: () => void;
  const loadGate = new Promise<void>((resolve) => { releaseLoad = resolve; });
  await page.route("**/workflows/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === "GET" && /\/workflows\/[^/]+$/.test(pathname)) await loadGate;
    await route.continue();
  });

  const navigation = page.goto(`/editor?workflow=${encodeURIComponent(workflowId!)}`);
  const loadingCard = page.locator(".editor-loading__card");
  await expect(loadingCard).toBeVisible();
  await expect(loadingCard).toHaveAttribute("role", "status");
  await expect(loadingCard).toHaveCSS("background-color", "rgb(255, 254, 249)");

  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(loadingCard).toHaveCSS("background-color", "rgb(17, 23, 18)");

  releaseLoad();
  await navigation;
  await expect(page.getByRole("heading", { name: "Steam daily report" })).toBeVisible();
});

test("editor text, controls, and provider icons meet contrast targets in both themes", async ({ page }) => {
  const email = `regression-contrast-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });

  const assertEditorContrast = async () => {
    await expectContrast(page.locator(".palette-filter--active"), 4.5);
    await expectContrast(page.locator(".palette-group > header p").first(), 4.5);
    await expectContrast(page.locator(".workflow-node p:not(.workflow-node__category)").first(), 4.5);
    await expect(page.getByRole("button", { name: "Go live" })).toHaveCSS("color", "rgb(52, 32, 0)");
    await expectContrast(
      page.locator(".react-flow__node").filter({ hasText: "Get account snapshot" }).locator(".workflow-node__provider-icon svg"),
      3,
    );
    await page.getByRole("button", { name: "Roadmap" }).click();
    await expectContrast(page.locator(".palette-app").filter({ hasText: "OpenAI" }).locator("svg"), 3);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expectContrast(page.locator(".palette-app").filter({ hasText: "GitHub" }).locator("svg"), 3);
    await page.getByRole("button", { name: "Collapse node palette" }).click();
    const addNode = page.getByRole("button", { name: "Add node" });
    await expect(addNode).toBeVisible();
    await expectContrast(addNode, 4.5);
    await expectContrast(addNode.locator("svg"), 3);
    await addNode.click();
  };

  await assertEditorContrast();
  const toDark = page.getByRole("button", { name: "Switch to dark mode" });
  await toDark.hover();
  await page.waitForTimeout(180);
  await expectContrast(toDark, 4.5);
  await toDark.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await assertEditorContrast();

  const toLight = page.getByRole("button", { name: "Switch to light mode" });
  await toLight.hover();
  await page.waitForTimeout(180);
  await expectContrast(toLight, 4.5);
});

test("account dropdown keeps its trigger inline and opens below the header", async ({ page }) => {
  const email = `regression-connections-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  const trigger = page.locator(".app-shell-account-menu summary");
  await expect(trigger).toHaveCSS("display", "inline-flex");
  await expect(trigger).toHaveCSS("flex-direction", "row");
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(triggerBox!.height).toBeLessThanOrEqual(40);
  const avatar = page.locator(".app-shell-avatar");
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveCSS("border-radius", "999px");
  await expect(avatar).toHaveCSS("width", "34px");

  await trigger.click();
  const menu = page.locator(".app-shell-account-menu .ui-menu__content");
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y).toBeGreaterThan(triggerBox!.y + triggerBox!.height);
  await expect(menu).toContainText("No external identities linked.");
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("connections are managed on a dedicated workspace page without exposing a close-only editor panel", async ({ page }) => {
  const email = `regression-connection-center-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  await page.getByRole("button", { name: "Connections" }).click();
  await expect(page).toHaveURL(/\/dashboard\/connections\?workspace=/);
  await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Credential manager" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close credential manager" })).toHaveCount(0);

  await page.getByLabel("Provider").selectOption("STEAM");
  await page.getByLabel("Connection name").fill("Steam page connection");
  await page.getByLabel("Secret JSON").fill('{"apiKey":"test-key","steamId":"76561198000000000"}');
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  await expect(page.getByText("Credential encrypted and saved. Select it from a compatible node in the editor.")).toBeVisible();
  await expect(page.getByText("Steam page connection", { exact: true })).toBeVisible();
});

test("management pages retain theme parity and a visible keyboard focus target", async ({ page }) => {
  const email = `regression-management-a11y-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  await page.getByRole("button", { name: "Connections" }).click();
  await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();
  const dashboardButton = page.getByRole("button", { name: "Dashboard" }).last();
  await dashboardButton.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(dashboardButton).toHaveCSS("outline-style", "solid");
  expect(await dashboardButton.evaluate((element) => element.matches(":focus-visible"))).toBe(true);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectContrast(page.getByRole("heading", { name: "Connections", exact: true }), 4.5);

  await page.getByRole("button", { name: "Executions" }).click();
  await expect(page).toHaveURL(/\/dashboard\/executions\?workspace=/);
  await expect(page.getByRole("heading", { name: "Execution history" })).toBeVisible();
  await expectContrast(page.getByRole("heading", { name: "Execution history" }), 4.5);
});

test("product navigation stays consistent while the editor keeps workflow tools separate", async ({ page }) => {
  const email = `regression-app-shell-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  const shell = page.locator(".app-shell-header");
  await expect(shell.getByRole("button", { name: "Dashboard" })).toBeVisible();
  await expect(shell.getByRole("button", { name: "Connections" })).toBeVisible();
  await expect(shell.getByRole("button", { name: "Executions" })).toBeVisible();

  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page.locator(".app-shell-header").getByRole("button", { name: "Connections" })).toBeVisible();
  await expect(page.locator(".editor-toolbar").getByRole("button", { name: "Run test" })).toBeVisible();
  await expect(page.getByText("Fluxora", { exact: true })).toHaveCount(1);
});

test("execution history has a dedicated page and opens immutable execution detail", async ({ page }) => {
  const email = `regression-execution-center-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Executions", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/executions\?workspace=/);
  await expect(page.getByRole("heading", { name: "Execution history" })).toBeVisible();
  await expect(page.getByText("Steam daily report", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Inspect run" }).click();
  await expect(page).toHaveURL(/execution=/);
  await expect(page.getByText("Execution detail", { exact: true })).toBeVisible();

  const returnToWorkflow = page.locator(".execution-detail-banner__return");
  await expect(returnToWorkflow).toBeVisible();
  await expect(page.locator(".execution-detail-banner")).toHaveCSS("background-color", "rgb(239, 255, 196)");
  await expect(returnToWorkflow).toHaveCSS("background-color", "rgb(255, 254, 249)");
  await expectContrast(returnToWorkflow, 4.5);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".execution-detail-banner")).toHaveCSS("background-color", "rgb(44, 59, 11)");
  await expect(returnToWorkflow).toHaveCSS("background-color", "rgb(17, 23, 18)");
  await expectContrast(returnToWorkflow, 4.5);
});

test("execution center loads stable cursor pages without losing existing runs", async ({ page }) => {
  const email = `regression-execution-pages-${Date.now()}@example.test`;
  let pageRequest = 0;
  const execution = (id: string, workflowName: string, createdAt: string) => ({
    id,
    workflowId: "workflow-1",
    workflowName,
    workflowVersion: 1,
    status: "SUCCEEDED",
    mode: "mock",
    createdAt,
    startedAt: createdAt,
    completedAt: createdAt,
    error: null,
  });
  await page.route("**/workspaces/*/executions?*", async (route) => {
    pageRequest++;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(pageRequest === 1
        ? { executions: [execution("execution-new", "Newest report", "2026-10-25T10:31:00.000Z")], nextCursor: "execution-new" }
        : { executions: [execution("execution-old", "Older report", "2026-10-25T10:30:00.000Z")], nextCursor: null }),
    });
  });

  await signUpAndDashboard(page, email);
  await page.getByRole("button", { name: "Expand execution center" }).click();
  await expect(page.getByText("Newest report", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more runs" }).click();
  await expect(page.getByText("Older report", { exact: true })).toBeVisible();
  await expect(page.getByText("Newest report", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more runs" })).toHaveCount(0);
});

test("workflow dashboard can search, filter, sort, and clear workflow controls", async ({ page }) => {
  const email = `regression-workflow-controls-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Steam daily report" })).toBeVisible();

  const nameInput = page.getByRole("textbox", { name: "New workflow name" });
  await nameInput.fill("Alpha audit");
  await page.getByRole("button", { name: "Blank workflow" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.goto("/dashboard");

  const search = page.getByRole("searchbox", { name: "Search workflows" });
  await expect(page.getByRole("group", { name: "Workflow controls" })).toContainText("All statuses");
  await expect(search).toBeVisible();
  await expect(page.getByText("Showing 2 of 2 workflows", { exact: true })).toBeVisible();

  await search.fill("Alpha");
  await expect(page.getByRole("group", { name: "Workflow controls" })).toContainText("Clear");
  await expect(page.getByRole("heading", { name: "Alpha audit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Steam daily report" })).toHaveCount(0);
  await expect(page.getByText("Showing 1 of 2 workflows", { exact: true })).toBeVisible();

  await page.getByLabel("Workflow status").selectOption("DRAFT");
  await page.getByLabel("Workflow sort").selectOption("NAME");
  await expect(page.getByRole("heading", { name: "Alpha audit" })).toBeVisible();
  await page.getByRole("button", { name: "Clear workflow filters" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByText("Showing 2 of 2 workflows", { exact: true })).toBeVisible();
});

test("workflow cards expose rename, duplicate, archive, and guarded delete actions", async ({ page }) => {
  const email = `regression-workflow-actions-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  const nameInput = page.getByRole("textbox", { name: "New workflow name" });
  await nameInput.fill("Action target");
  await page.getByRole("button", { name: "Blank workflow" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.goto("/dashboard");

  const actionCard = page.locator(".workflow-card", { has: page.getByRole("heading", { name: "Action target", exact: true }) });
  await expect(actionCard).toBeVisible();
  const actionMenu = actionCard.locator("summary.ui-menu__trigger");
  await expect(actionMenu).toHaveCSS("width", "30px");
  await expect(actionMenu.locator("svg")).toBeVisible();
  const cardMeta = actionCard.locator(".workflow-card__meta");
  await expect(cardMeta.locator("summary")).toHaveCount(1);
  await expect(cardMeta).toHaveCSS("flex-direction", "row");
  await expect(cardMeta.locator(".workflow-card__updated")).toHaveCSS("font-size", "10px");
  await actionCard.getByLabel("Workflow actions for Action target actions").click();
  await actionCard.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("dialog", { name: "Rename workflow" })).toBeVisible();
  await page.getByRole("textbox", { name: "Workflow name", exact: true }).fill("Renamed target");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { name: "Renamed target", exact: true })).toBeVisible();

  const renamedCard = page.locator(".workflow-card", { has: page.getByRole("heading", { name: "Renamed target", exact: true }) });
  await renamedCard.getByLabel("Workflow actions for Renamed target actions").click();
  await renamedCard.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByRole("dialog", { name: "Duplicate workflow" })).toBeVisible();
  await page.getByRole("button", { name: "Duplicate workflow" }).click();
  await expect(page.getByRole("heading", { name: "Renamed target copy" })).toBeVisible();

  const copyCardBeforeRun = page.locator(".workflow-card", { has: page.getByRole("heading", { name: "Renamed target copy", exact: true }) });
  await copyCardBeforeRun.getByRole("button", { name: "Open editor" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Execution center" })).toBeVisible();
  const executionCenterToggle = page.getByRole("button", { name: "Expand execution center" });
  await expect(executionCenterToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Recent runs", { exact: true })).toHaveCount(0);
  await executionCenterToggle.click();
  await expect(page.getByText("Recent runs", { exact: true })).toBeVisible();
  await expect(page.getByText("Succeeded", { exact: true })).toBeVisible();
  const succeededFilter = page.getByRole("button", { name: "Succeeded (1)" });
  await succeededFilter.click();
  await expect(succeededFilter).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Needs attention (0)" }).click();
  await expect(page.getByText("No matching runs", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show all runs" }).click();
  await expect(page.getByText("Succeeded", { exact: true })).toBeVisible();

  const renamedCardAfterRun = page.locator(".workflow-card", { has: page.getByRole("heading", { name: "Renamed target", exact: true }) });
  await renamedCardAfterRun.getByLabel("Workflow actions for Renamed target actions").click();
  await renamedCardAfterRun.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("dialog", { name: "Archive workflow" })).toBeVisible();
  await page.getByRole("button", { name: "Archive workflow" }).click();
  await expect(page.getByRole("heading", { name: "Renamed target", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Renamed target", exact: true })).toHaveCount(0);

  const copyCard = page.locator(".workflow-card", { has: page.getByRole("heading", { name: "Renamed target copy", exact: true }) });
  await copyCard.getByLabel("Workflow actions for Renamed target copy actions").click();
  await copyCard.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("dialog", { name: "Delete workflow" })).toBeVisible();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("dialog", { name: "Delete workflow" })).toContainText("execution history");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Expand execution center" }).click();
  const executionRow = page.locator(".dashboard-execution", { hasText: "Renamed target copy" });
  await executionRow.getByRole("button", { name: "Open workflow" }).click();
  await expect(page).toHaveURL(/execution=/);
  await expect(page.getByText("Execution detail", { exact: true })).toBeVisible();
});

test("dialogs and editor panels manage focus entry, trapping, Escape, and focus return", async ({ page }) => {
  const email = `regression-focus-lifecycle-${Date.now()}@example.test`;
  await signUpAndDashboard(page, email);

  await page.getByRole("textbox", { name: "New workflow name" }).fill("Focus lifecycle");
  await page.getByRole("button", { name: "Blank workflow" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.goto("/dashboard");

  const card = page.locator(".workflow-card", { has: page.getByRole("heading", { name: "Focus lifecycle", exact: true }) });
  const actionMenu = card.locator("summary.ui-menu__trigger");
  await actionMenu.click();
  await card.getByRole("button", { name: "Rename" }).click();

  const dialog = page.getByRole("dialog", { name: "Rename workflow" });
  const nameInput = dialog.getByRole("textbox", { name: "Workflow name" });
  const saveButton = dialog.getByRole("button", { name: "Save name" });
  await expect(nameInput).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(saveButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(nameInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(actionMenu).toBeFocused();

  await actionMenu.click();
  await expect(card.getByRole("button", { name: "Rename" })).toBeVisible();
  await page.getByRole("heading", { name: "Your workflow control room." }).click();
  await expect(actionMenu).toHaveAttribute("aria-expanded", "false");

  await card.getByRole("button", { name: "Open editor" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  const manageMenu = page.getByLabel("Manage actions");
  await manageMenu.click();
  await page.getByRole("button", { name: "Version history" }).click();
  const historyPanel = page.getByRole("dialog", { name: "Workflow version history" });
  await expect(historyPanel.getByRole("button", { name: "Close workflow history" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(historyPanel).toBeHidden();
  await expect(manageMenu).toBeFocused();
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
  const workspaceSelect = page.locator("select#app-shell-workspace");
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
