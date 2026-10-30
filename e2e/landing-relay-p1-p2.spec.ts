import { expect, test } from "@playwright/test";

async function releaseIntro(page: import("@playwright/test").Page) {
  const skip = page.getByRole("button", { name: "Skip intro" });
  if (await skip.isVisible()) await skip.click();
}

test("integration rail and footer retain useful, truthful navigation when effects pause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await releaseIntro(page);

  const integrations = page.getByRole("region", { name: "Available integrations" });
  await integrations.scrollIntoViewIfNeeded();
  await expect(integrations.locator("[data-integration]")).toHaveCount(6);
  await expect(integrations.getByText("GitHub", { exact: true })).toBeVisible();
  await expect(integrations.getByText("Google Drive", { exact: true })).toBeVisible();
  await expect(integrations.getByText("Telegram", { exact: true })).toBeVisible();
  await expect(integrations.locator(".landing-integrations__rail")).toBeVisible();

  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(page.getByRole("button", { name: "Resume visual effects" })).toBeVisible();
  const cards = integrations.locator("[data-integration]");
  const cardMetrics = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const card = element.getBoundingClientRect();
      const icon = element.querySelector("span")?.getBoundingClientRect();
      return { card: [card.width, card.height], icon: icon && [icon.width, icon.height] };
    }),
  );
  for (const metric of cardMetrics) {
    expect(metric.card[0]).toBeCloseTo(108, 0);
    expect(metric.card[1]).toBeCloseTo(98, 0);
    expect(metric.icon?.[0]).toBeCloseTo(30, 0);
    expect(metric.icon?.[1]).toBeCloseTo(30, 0);
  }

  await expect(integrations.getByText("Steam", { exact: true })).toBeVisible();

  const footer = page.getByRole("contentinfo", { name: "Fluxora footer" });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support");
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(footer.getByRole("link", { name: "Build something useful" })).toHaveAttribute("href", "/login");
});

test("integration choreography is enhancement-only for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await releaseIntro(page);
  const integrations = page.getByRole("region", { name: "Available integrations" });
  await integrations.scrollIntoViewIfNeeded();
  await expect(integrations.locator("[data-integration]")).toHaveCount(6);
  await expect(integrations.locator(".landing-integrations__rail")).toHaveCSS("transform", "none");
});
