import { expect, test } from "@playwright/test";

test("a new owner can register and configure a Switch in the editor", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/");

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("E2E Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("heading", { name: "Steam daily report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Workflows" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run test" })).toBeVisible();

  await page.getByRole("button", { name: /Switch Route to multiple cases/ }).click();
  await expect(page.getByText("SWITCH CASES")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Switch case 1" })).toHaveValue("case-a");
});
