import { expect, test } from "@playwright/test";

test("public pricing is reachable, responsive and does not imply checkout exists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Landing navigation" }).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "More flow, on your terms." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Starter", exact: true })).toBeVisible();
  await expect(page.getByText("99.000đ / 30 days", { exact: true })).toBeVisible();
  await expect(page.getByText("Coming soon · no payment available yet")).toHaveCount(2);
  await expect(page.getByText(/may be incomplete/)).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 375) {
      const header = await page.locator(".landing-nav").boundingBox();
      const back = await page.getByRole("link", { name: "Back to Fluxora" }).boundingBox();
      expect(header && back && back.y >= header.y + header.height).toBeTruthy();
    }
  }
});
