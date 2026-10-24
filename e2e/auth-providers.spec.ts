import { expect, test } from "@playwright/test";

test("password sign-in works while social providers expose their configured state", async ({ page }) => {
  const email = `auth-${Date.now()}@example.test`;
  const password = "e2e-password-123";
  await page.goto("/");

  await expect(page.getByRole("button", { name: /^Google/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^GitHub/ })).toBeVisible();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Auth Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your workflow control room." })).toBeVisible();
});
