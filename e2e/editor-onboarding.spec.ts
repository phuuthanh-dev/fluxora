import { expect, test } from "@playwright/test";

test("a new owner can configure, save, publish, and inspect a Steam workflow", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/");

  await expect(page.getByRole("button", { name: /Google Configure server/ })).toBeDisabled();

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("E2E Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your workflow control room." })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Steam setup|Link Steam)$/ })).toBeVisible();
  await expect(page.getByText("No workflows in this workspace")).toBeVisible();
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/);
  await expect(page.getByRole("heading", { name: "Steam daily report" })).toBeVisible();
  await expect(page.getByLabel("Edit actions")).toBeVisible();
  await expect(page.getByLabel("Manage actions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run test" })).toBeVisible();

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
