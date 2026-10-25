import { expect, test } from "@playwright/test";

test("a new owner can configure, save, publish, and inspect a Steam workflow", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/");

  await expect(page.getByRole("button", { name: /^Google/ })).toBeVisible();

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("E2E Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your workflow control room." })).toBeVisible();
  await expect(page.getByText("Execution runtime ready")).toBeVisible();
  await page.getByLabel("Account actions").click();
  await expect(page.getByRole("button", { name: /^(Steam setup|Link Steam)$/ })).toBeVisible();
  await expect(page.getByText("No workflows in this workspace")).toBeVisible();
  const createTemplate = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/workflows/from-template/steam-daily-report"));
  await page.getByRole("button", { name: "Use Steam template" }).click();
  expect((await createTemplate).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Steam daily report" })).toBeVisible();
  await expect(page.getByLabel("Edit actions")).toBeVisible();
  await expect(page.getByLabel("Manage actions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run test" })).toBeVisible();

  const relayTokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      void: styles.getPropertyValue("--relay-void").trim(),
      lime: styles.getPropertyValue("--relay-lime").trim(),
      canvas: styles.getPropertyValue("--canvas").trim(),
    };
  });
  expect(relayTokens).toEqual({ void: "#080a09", lime: "#d6ff32", canvas: "#f5f7f1" });
  await expect(page.locator(".editor-header")).toHaveCSS("background-color", "rgb(8, 10, 9)");
  await expect(page.getByRole("button", { name: "Run test" })).toHaveCSS("background-color", "rgb(214, 255, 50)");
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
  await page.locator(".react-flow__node").filter({ hasText: "Steam account snapshot" }).click();
  await expect(page.getByRole("region", { name: "Setup" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Configuration" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Test & debug" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Advanced" })).toBeVisible();
  const configCheckbox = page.locator('.checkbox-field input[type="checkbox"]').first();
  await expect(configCheckbox).toBeVisible();
  await expect(configCheckbox).toHaveCSS("width", "12px");
  await expect(configCheckbox).toHaveCSS("height", "12px");
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

  await page.getByRole("button", { name: "Apps", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Manual trigger/ })).toHaveCount(0);
  await page.getByLabel("Search nodes").fill("OpenAI");
  await expect(page.getByRole("button", { name: /OpenAI.*Planned/ })).toBeDisabled();
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.getByRole("button", { name: /Switch Route to multiple cases/ }).click();
  await expect(page.getByText("SWITCH CASES")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Switch case 1" })).toHaveValue("case-a");

  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Credentials" }).click();
  await page.getByLabel("Provider").selectOption("STEAM");
  await expect(page.getByRole("textbox", { name: "Connection name" })).toHaveValue("Steam account");
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

  await page.locator(".react-flow__node").filter({ hasText: "Steam account snapshot" }).first().click();
  await expect(page.getByLabel("Steam credential")).toContainText("E2E Steam connection");
  await page.getByLabel("Steam credential").selectOption({ label: "E2E Steam connection" });

  await page.getByRole("button", { name: "Run node" }).click();
  await expect(page.getByText("Mock node debug succeeded — only Steam account snapshot ran.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Last execution" }).getByText(/SUCCEEDED · ATTEMPT/)).toBeVisible();
  await page.locator(".react-flow__node").filter({ hasText: "Google Chat message" }).first().click();
  await expect(page.getByRole("region", { name: "Last execution" }).getByText(/SKIPPED · ATTEMPT/)).toBeVisible();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved to your workspace.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Version 1 published\. A new editable draft is ready\./)).toBeVisible();
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("heading", { name: "Activate this workflow?" })).toBeVisible();
  await expect(page.getByText("Activation is blocked until these integrations are configured.")).toBeVisible();
  await expect(page.getByText("Google Chat", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate workflow" })).toBeDisabled();
  await expect(page.getByText("Activation enables published Cron and Webhook triggers.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByRole("heading", { name: "Immutable releases" })).toBeVisible();
  await expect(page.getByText(/v1 · published/)).toBeVisible();
  await page.getByRole("button", { name: "Close workflow history" }).click();

  await page.locator(".react-flow__node").filter({ hasText: "Google Chat message" }).first().click();
  await page.getByRole("textbox", { name: "Message template" }).fill("{{ process.exit() }}");
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText(/Mock execution failed/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Retry test" }).click();
  await expect(page.getByRole("heading", { name: "Retry this test execution?" })).toBeVisible();
  await expect(page.getByText("This creates a new execution from the original immutable workflow version and its original redacted trigger data.")).toBeVisible();
  await page.getByRole("button", { name: "Retry test run" }).click();
  await expect(page.getByText(/Mock retry failed — using the original version 2/)).toBeVisible({ timeout: 15_000 });
});

test("narrow desktop opens the node inspector as a focus-managed drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 820 });
  const email = `e2e-inspector-${Date.now()}@example.test`;
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Inspector Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });

  const inspectorTrigger = page.getByRole("button", { name: "Inspector" });
  await expect(inspectorTrigger).toBeVisible();
  await page.locator(".react-flow__node").filter({ hasText: "Steam account snapshot" }).first().click();

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
