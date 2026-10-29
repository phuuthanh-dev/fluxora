import { expect, test } from "@playwright/test";

test("password sign-in works while social providers expose their configured state", async ({ page }) => {
  const email = `auth-${Date.now()}@example.test`;
  const password = "e2e-password-123";
  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 16, 12)");
  await expect(page.locator(".auth-oauth-button__icon--github")).toHaveCSS("filter", "invert(1)");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".auth-oauth-button__icon--github")).toHaveCSS("filter", "none");

  await expect(page.getByRole("button", { name: /^Google/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^GitHub/ })).toBeVisible();
  await expect(page.locator(".auth-oauth-button__icon svg")).toHaveCount(2);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Auth Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByLabel("Account actions").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your workflow control room." })).toBeVisible();
});
