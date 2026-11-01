import { expect, test } from "@playwright/test";

test("a new owner can configure, save, publish, and inspect a Steam workflow", async ({ page }) => {
  // This journey covers registration, canvas editing, versioning and retry.
  // Give the aggregate journey its own budget; per-action assertions stay at 5s.
  test.setTimeout(60_000);
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/login");

  await expect(page.getByRole("button", { name: /^Google/ })).toBeVisible();

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("E2E Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Workflows", level: 1 })).toBeVisible();
  await expect(page.getByText("Execution runtime ready")).toBeVisible();
  await page.getByLabel("Account actions").click();
  await expect(page.getByRole("button", { name: /^(Steam setup|Link Steam)$/ })).toBeVisible();
  await expect(page.getByText("No workflows in this workspace")).toBeVisible();
  const firstWorkflowGuide = page.getByRole("region", { name: "First workflow guide" });
  await expect(firstWorkflowGuide).toBeVisible();
  await expect(firstWorkflowGuide.getByText("Steam daily report", { exact: true })).toBeVisible();
  const recommendedTemplate = firstWorkflowGuide.locator(".dashboard-onboarding__template").filter({ hasText: "Steam daily report" });
  await expect(recommendedTemplate.getByText("Personal", { exact: true })).toBeVisible();
  await expect(recommendedTemplate.getByText("Notifications", { exact: true })).toBeVisible();
  await expect(firstWorkflowGuide.getByRole("button", { name: "Use Steam report to Discord" })).toBeVisible();
  await expect(firstWorkflowGuide.getByRole("button", { name: "Use Steam report to Telegram" })).toBeVisible();
  await expect(firstWorkflowGuide.getByRole("button", { name: "Start from scratch" })).toBeVisible();
  const createTemplate = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/workflows/from-template/steam-daily-report"));
  await page.getByRole("button", { name: "Use Steam template" }).click();
  expect((await createTemplate).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Steam daily report" })).toBeVisible();
  await expect(page.getByLabel("Edit actions")).toBeVisible();
  await expect(page.getByLabel("Manage actions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run test" })).toBeVisible();

  const canvasNavigation = page.getByRole("group", { name: "Canvas navigation" });
  await expect(canvasNavigation).toBeVisible();
  await expect(canvasNavigation.getByRole("button", { name: "Fit canvas" })).toBeVisible();
  await expect(canvasNavigation.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(canvasNavigation.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(canvasNavigation.getByRole("button", { name: "Center selected node" })).toBeDisabled();
  await expect(page.locator(".react-flow__controls")).toHaveCount(0);
  await expect(page.locator(".react-flow__minimap")).toBeVisible();
  await canvasNavigation.getByRole("button", { name: "Hide minimap" }).click();
  await expect(page.locator(".react-flow__minimap")).toHaveCount(0);
  await canvasNavigation.getByRole("button", { name: "Show minimap" }).click();
  await expect(page.locator(".react-flow__minimap")).toBeVisible();

  const relayTokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      void: styles.getPropertyValue("--relay-void").trim(),
      lime: styles.getPropertyValue("--relay-lime").trim(),
      canvas: styles.getPropertyValue("--canvas").trim(),
    };
  });
  expect(relayTokens).toEqual({ void: "#080a09", lime: "#c8f751", canvas: "#f5f7f1" });
  await expect(page.locator(".editor-header")).toHaveCSS("background-color", "rgb(255, 254, 249)");
  await expect(page.getByRole("button", { name: "Run test" })).toHaveCSS("background-color", "rgb(200, 247, 81)");
  await expect(page.getByRole("button", { name: "Run test" })).toHaveCSS("color", "rgb(8, 10, 9)");

  const nodeHandles = page.locator(".workflow-node__handle");
  await expect(nodeHandles.first()).toBeVisible();
  await expect(nodeHandles.first()).toHaveCSS("width", "12px");
  await expect(nodeHandles.first()).toHaveCSS("height", "12px");
  await expect(nodeHandles.first()).toHaveCSS("position", "absolute");
  await expect(nodeHandles.first()).toHaveAttribute("title", "Drag to connect");
  const handleHitArea = await nodeHandles.first().evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { content: style.content, inset: style.inset };
  });
  expect(handleHitArea).toEqual({ content: '""', inset: "-13px" });
  const sourceHandle = page.locator(".workflow-node__handle--source").first();
  const sourceBox = await sourceHandle.boundingBox();
  expect(sourceBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 24, sourceBox!.y + sourceBox!.height / 2 + 4);
  await expect(page.locator(".canvas-region")).toHaveClass(/canvas-region--connecting/);
  await expect(page.getByText("Drag to a highlighted node input to connect.")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".canvas-region")).not.toHaveClass(/canvas-region--connecting/);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Run test" })).toHaveCSS("color", "rgb(5, 7, 6)");
  await expect(page.locator(".workflow-node__category").first()).toHaveCSS("color", "rgb(198, 242, 27)");
  await expect(page.locator(".workflow-node h3").first()).toHaveCSS("color", "rgb(243, 246, 236)");
  await expect(page.locator(".workflow-node__handle-label").first()).toHaveCSS("color", "rgb(243, 246, 236)");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await expect(page.getByRole("heading", { name: "Add a step" })).toBeVisible();
  await page.locator(".react-flow__node").filter({ hasText: "Get account snapshot" }).click();
  await expect(canvasNavigation.getByRole("button", { name: "Center selected node" })).toBeEnabled();
  await canvasNavigation.getByRole("button", { name: "Center selected node" }).click();
  await expect(page.getByRole("region", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Configuration" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Test & debug" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Advanced" })).toBeVisible();
  const configCheckbox = page.locator('.checkbox-field input[type="checkbox"]').first();
  await expect(configCheckbox).toBeVisible();
  await expect(configCheckbox).toHaveCSS("width", "12px");
  await expect(configCheckbox).toHaveCSS("height", "12px");
  await expect(configCheckbox).toHaveCSS("border-width", "1px");
  const editorShell = page.locator(".editor-shell");
  const canvasRegion = page.locator(".canvas-region");
  const inspector = page.locator(".inspector");
  const canvasBeforeCollapse = await canvasRegion.boundingBox();
  const inspectorBeforeCollapse = await inspector.boundingBox();
  await page.getByRole("button", { name: "Collapse node palette" }).click();
  await expect(editorShell).toHaveClass(/editor-shell--palette-closed/);
  await expect(page.getByRole("button", { name: "Add node" })).toBeVisible();
  const canvasAfterCollapse = await canvasRegion.boundingBox();
  const inspectorAfterCollapse = await inspector.boundingBox();
  expect(canvasBeforeCollapse).not.toBeNull();
  expect(canvasAfterCollapse).not.toBeNull();
  expect(inspectorBeforeCollapse).not.toBeNull();
  expect(inspectorAfterCollapse).not.toBeNull();
  expect(canvasAfterCollapse!.width).toBeGreaterThan(canvasBeforeCollapse!.width + 250);
  expect(Math.abs(inspectorAfterCollapse!.width - inspectorBeforeCollapse!.width)).toBeLessThan(2);
  await page.getByRole("button", { name: "Add node" }).click();
  await expect(editorShell).not.toHaveClass(/editor-shell--palette-closed/);
  await expect(page.getByRole("heading", { name: "Add a step" })).toBeVisible();

  await page.getByRole("button", { name: "Communication", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Apps & services" })).toBeVisible();
  const communicationGroup = page.locator(".palette-app-category").filter({ has: page.getByRole("heading", { name: /Communication/ }) });
  await expect(communicationGroup.getByRole("button", { name: /Open Telegram/ })).toBeVisible();
  await expect(communicationGroup.getByRole("button", { name: /Open Discord/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Manual trigger/ })).toHaveCount(0);
  await page.getByLabel("Search apps and operations").fill("Instagram");
  await expect(page.getByRole("button", { name: /Instagram.*Planned/ })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.getByRole("button", { name: /Open Telegram/ }).click();
  await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
  await page.getByRole("button", { name: "Add Send message to favorites" }).click();
  await page.getByRole("button", { name: /Telegram: Send message/ }).click();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently used" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Steam daily report" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently used" })).toBeVisible();

  await page.getByRole("button", { name: /Switch Route to multiple cases/ }).click();
  await expect(page.getByText("SWITCH CASES")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Switch case 1" })).toHaveValue("case-a");

  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();
  await page.getByLabel("Provider").selectOption("STEAM");
  await expect(page.getByRole("textbox", { name: "Connection name" })).toHaveValue("Steam account");
  await page.getByRole("button", { name: "Edit JSON", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Secret JSON" })).toContainText('"apiKey"');
  await expect(page.getByText("Enter a Steam Web API key and your 64-bit Steam ID.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Google with OAuth" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Connection name" }).fill("E2E Steam connection");
  await page.getByRole("textbox", { name: "Secret JSON" }).fill("not-json");
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  await expect(page.locator(".credential-form__error")).toContainText("Unexpected token");
  await page.getByRole("textbox", { name: "Secret JSON" }).fill('{"apiKey":"e2e-key","steamId":"76561198000000000"}');
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  await expect(page.getByText("Credential encrypted and saved. Select it from a compatible node in the editor.")).toBeVisible();
  await page.getByRole("button", { name: "Close credential manager" }).click();

  await page.locator(".react-flow__node").filter({ hasText: "Get account snapshot" }).first().click();
  await expect(page.getByLabel("Steam credential")).toContainText("E2E Steam connection");
  await page.getByLabel("Steam credential").selectOption({ label: "E2E Steam connection" });

  await page.getByRole("button", { name: "Run node" }).click();
  await expect(page.getByText("Mock node debug succeeded — only Steam account snapshot ran.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Last execution" }).getByText(/SUCCEEDED · ATTEMPT/)).toBeVisible();
  await page.locator(".react-flow__node").filter({ hasText: "Google Chat · Action" }).first().click();
  await expect(page.getByRole("region", { name: "Last execution" }).getByText(/SKIPPED · ATTEMPT/)).toBeVisible();

  const goLiveButton = page.getByRole("button", { name: "Go live" });
  await expect(goLiveButton).toBeDisabled();
  await expect(goLiveButton).toHaveAttribute("title", "Publish this workflow before going live");

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved to your workspace.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Version 1 published\. A new editable draft is ready\./)).toBeVisible();
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("heading", { name: "Activate this workflow?" })).toBeVisible();
  await expect(page.getByText("Activation is blocked until these integrations are configured.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Activate workflow" }).getByText("Google Chat", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate workflow" })).toBeDisabled();
  await expect(page.getByText("Activation enables published Cron and Webhook triggers.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByRole("heading", { name: "Immutable releases" })).toBeVisible();
  await expect(page.getByText(/v1 · published/)).toBeVisible();
  await page.getByRole("button", { name: "Close workflow history" }).click();

  await page.locator(".react-flow__node").filter({ hasText: "Google Chat · Action" }).first().click();
  await page.getByRole("textbox", { name: "Message template" }).fill("{{ process.exit() }}");
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText(/Mock execution failed/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Retry test" }).click();
  await expect(page.getByRole("heading", { name: "Retry this test execution?" })).toBeVisible();
  await expect(page.getByText("This creates a new execution from the original immutable workflow version and its original redacted trigger data.")).toBeVisible();
  await page.getByRole("button", { name: "Retry test run" }).click();
  await expect(page.getByText(/Mock retry failed — using the original version 2/)).toBeVisible({ timeout: 15_000 });
});

test("Google connector fields follow selected operations and preserve table-shaped values", async ({ page }) => {
  const email = `e2e-google-fields-${Date.now()}@example.test`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Google Fields Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });

  await page.getByRole("button", { name: /Open Google Drive, 1 operation/ }).click();
  await page.getByRole("button", { name: /Google Drive: Manage files/ }).click();
  const driveNode = page.locator(".react-flow__node").filter({ hasText: "Google Drive" }).last();
  await expect(driveNode).toBeVisible();
  await driveNode.click();
  await expect(page.getByRole("textbox", { name: "File name" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Text content" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Operation" }).selectOption("uploadText");
  await expect(page.getByRole("textbox", { name: "File name" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Text content" })).toBeVisible();

  await page.getByRole("button", { name: "All apps" }).click();
  await page.getByRole("button", { name: /Open Google Sheets, 1 operation/ }).click();
  await page.getByRole("button", { name: /Google Sheets: Read or write rows/ }).click();
  const sheetsNode = page.locator(".react-flow__node").filter({ hasText: "Google Sheets" }).last();
  await expect(sheetsNode).toBeVisible();
  await sheetsNode.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(page.getByRole("textbox", { name: "Values row 1 column 1" })).toBeVisible();
  await page.getByRole("textbox", { name: "Values row 1 column 1" }).fill("Steam");
  await page.getByRole("button", { name: "Add row" }).click();
  await expect(page.getByRole("textbox", { name: "Values row 2 column 1" })).toBeVisible();
  await page.getByRole("button", { name: "Add column" }).click();
  await expect(page.getByRole("textbox", { name: "Values row 1 column 2" })).toBeVisible();
});

test("narrow desktop opens the node inspector as a focus-managed drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 820 });
  const email = `e2e-inspector-${Date.now()}@example.test`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Inspector Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });

  const inspectorTrigger = page.getByRole("button", { name: "Inspector" });
  await expect(inspectorTrigger).toBeVisible();
  await page.locator(".react-flow__node").filter({ hasText: "Get account snapshot" }).first().click();

  const drawer = page.getByRole("dialog", { name: "Node inspector" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveClass(/inspector--drawer-open/);
  await expect(drawer.getByRole("heading", { name: "Steam account snapshot" })).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  const closeDrawer = drawer.getByRole("button", { name: "Close node inspector" });
  await expect(closeDrawer).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);

  await closeDrawer.click();
  await expect(drawer).toBeHidden();
  await expect(inspectorTrigger).toBeFocused();
  await expect(inspectorTrigger).toHaveAttribute("aria-expanded", "false");

  await inspectorTrigger.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(inspectorTrigger).toBeFocused();
});

test("node library and editor menus support keyboard-only navigation", async ({ page }) => {
  const email = `e2e-keyboard-${Date.now()}@example.test`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Keyboard Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });

  const search = page.getByLabel("Search apps and operations");
  await expect(search).toHaveAttribute("aria-keyshortcuts", "/");
  await page.locator(".canvas-region").click({ position: { x: 400, y: 180 } });
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await search.fill("Instagram");
  const plannedInstagram = page.getByRole("button", { name: /Instagram.*Planned, unavailable/ });
  await expect(plannedInstagram).toHaveAttribute("aria-disabled", "true");
  await plannedInstagram.focus();
  await expect(plannedInstagram).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();

  const allFilter = page.getByRole("button", { name: "All", exact: true });
  await allFilter.focus();
  await page.keyboard.press("ArrowRight");
  const coreFilter = page.getByRole("button", { name: "Core", exact: true });
  await expect(coreFilter).toBeFocused();
  await expect(coreFilter).toHaveAttribute("aria-pressed", "true");
  await allFilter.click();

  const googleChatApp = page.getByRole("button", { name: /Open Google Chat/ });
  await googleChatApp.focus();
  await page.keyboard.press("ArrowDown");
  const discordApp = page.getByRole("button", { name: /Open Discord/ });
  await expect(discordApp).toBeFocused();
  await page.keyboard.press("Enter");
  const discordOperation = page.getByRole("button", { name: /Discord: Send webhook message/ });
  await expect(discordOperation).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(discordApp).toBeFocused();
  await page.keyboard.press("Escape");
  const addNode = page.getByRole("button", { name: "Add node" });
  await expect(addNode).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(search).toBeFocused();

  await page.locator(".react-flow__node").filter({ hasText: "Get account snapshot" }).click();
  const editMenu = page.getByLabel("Edit actions");
  await editMenu.focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.locator(".action-menu__content:visible").evaluate((menu) => menu.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Copy selected node" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editMenu).toBeFocused();
  await expect(editMenu).toHaveAttribute("aria-expanded", "false");
});
