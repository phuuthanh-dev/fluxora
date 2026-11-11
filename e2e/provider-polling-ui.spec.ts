import { expect, test } from "@playwright/test";

test("Notion and Drive triggers expose provider-specific configuration", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Trigger Tester");
  await page.locator('input[autocomplete="email"]').fill(`poll-${Date.now()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').fill("test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Blank workflow" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/);
  await page.getByLabel("Search apps and operations").fill("Notion");
  await page.getByRole("button", { name: /Notion: Page created or updated/ }).click();
  await expect(page.getByLabel("Notion connection", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Event")).toHaveValue("created");
  await expect(page.getByText("Select a compatible credential first.")).toBeVisible();
  await page.getByLabel("Search apps and operations").fill("Google Drive");
  await page.getByRole("button", { name: /Google Drive: File created or updated/ }).click();
  await expect(page.getByLabel("Watch")).toHaveValue("folder");
  await page.getByLabel("Watch").selectOption("file");
  await expect(page.getByLabel("Event")).toHaveValue("updated");
  await expect(page.getByLabel("Event").locator("option")).toHaveCount(1);
});
