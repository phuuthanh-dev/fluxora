import { expect, test } from "@playwright/test";

test("public header shows the signed-in account and navigation", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: { user: { email: "owner@example.test", displayName: "Sample Owner", avatarColor: "lime" } } }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/pricing");
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await header.getByRole("button", { name: "Account actions" }).click();
  const menu = header.getByRole("menu", { name: "Account menu" });
  await expect(menu.getByText("Sample Owner")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("public header offers sign in when no session exists", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED" } }));
  await page.goto("/pricing");
  await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toBeVisible();
});
