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
  expect(handleHitArea).toEqual({ content: '""', inset: "-10px" });

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Run test" })).toHaveCSS("color", "rgb(5, 7, 6)");
  await expect(page.locator(".workflow-node__category").first()).toHaveCSS("color", "rgb(198, 242, 27)");
  await expect(page.locator(".workflow-node h3").first()).toHaveCSS("color", "rgb(243, 246, 236)");
  await expect(page.locator(".workflow-node__handle-label").first()).toHaveCSS("color", "rgb(243, 246, 236)");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await expect(page.getByRole("heading", { name: "Add a step" })).toBeVisible();
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

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved to your workspace.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Version 1 published\. A new editable draft is ready\./)).toBeVisible();
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("heading", { name: "Run the published workflow?" })).toBeVisible();
  await expect(page.getByText("This will call real providers and may send messages, write data, or create external side effects.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByRole("heading", { name: "Immutable releases" })).toBeVisible();
  await expect(page.getByText(/v1 · published/)).toBeVisible();
});
