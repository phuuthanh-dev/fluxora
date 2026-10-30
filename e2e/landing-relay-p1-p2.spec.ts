import { expect, test } from "@playwright/test";

async function releaseIntro(page: import("@playwright/test").Page) {
  const skip = page.getByRole("button", { name: "Skip intro" });
  if (await skip.isVisible()) {
    // Reduced motion can release and unmount the intro between visibility
    // check and click; the hidden assertion still catches a stuck overlay.
    await skip.click({ timeout: 1000 }).catch(() => {});
  }
  await expect(page.locator(".landing-loader")).toBeHidden({ timeout: 8000 });
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
    expect(metric.icon?.[0]).toBeCloseTo(60, 0);
    expect(metric.icon?.[1]).toBeCloseTo(60, 0);
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
  await expect(integrations.locator(".landing-integrations__packet")).toHaveCSS("opacity", "0");
});

test("integration signal travels while visible and stops when effects pause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const rail = page.locator(".landing-integrations");
  await rail.scrollIntoViewIfNeeded();
  const packet = rail.locator(".landing-integrations__packet");
  await expect(packet).toBeVisible();
  await expect.poll(() => rail.locator('[data-signal="active"]').count()).toBe(1);
  const first = (await packet.boundingBox())!.x;
  await expect.poll(async () => Math.abs((await packet.boundingBox())!.x - first)).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(packet).toHaveCSS("opacity", "0");
  await expect(rail.locator('[data-signal="active"]')).toHaveCount(0);
});

test("illustrative approval and Relay chart artwork remain readable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const approval = page.getByLabel("Illustrative approval request");
  await approval.scrollIntoViewIfNeeded();
  await expect(approval.getByText("Waiting for review")).toBeVisible();
  const chart = page.locator(".landing-volume__chart");
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator(".landing-volume__cube")).toHaveCount(6);
  await expect(chart.locator(".landing-volume__cap")).toHaveCount(6);
  await expect(chart.locator(".landing-volume__cube").first()).toHaveCSS("transform", "none");
});

test("illustrative trace settles and remains visible when motion is paused", async ({ page }) => {
  await page.goto("/");
  await releaseIntro(page);
  const trace = page.getByLabel("Illustrative execution trace");
  await trace.scrollIntoViewIfNeeded();
  await expect(trace.getByText("EXAMPLE RUN · COMPLETED")).toBeVisible();
  const bars = trace.locator(".landing-chapter__trace-row b");
  await expect(bars).toHaveCount(3);
  await expect(bars.last()).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(bars.last()).toHaveCSS("transform", "none");
  await expect(trace.getByText("Output")).toBeVisible();
});

test("feature rows alternate on desktop and stack on mobile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const rows = page.locator(".landing-chapter");
    await expect(rows).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      const row = rows.nth(index);
      const copy = (await row.locator(".landing-chapter__copy").boundingBox())!;
      const visual = (await row.locator(".landing-chapter__visual").boundingBox())!;
      if (width === 375) expect(visual.y).toBeGreaterThan(copy.y + copy.height - 1);
      else if (index === 1) expect(visual.x + visual.width).toBeLessThan(copy.x);
      else expect(copy.x + copy.width).toBeLessThan(visual.x);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("feature illustrations follow Relay order and stop when out of view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const rows = page.locator(".landing-chapter");
  await expect(rows.nth(0).getByLabel("Illustrative execution trace")).toBeVisible();
  await expect(rows.nth(1).getByLabel("Illustrative approval request")).toBeVisible();
  await expect(rows.nth(2).getByLabel("Illustrative runs by day")).toBeVisible();
  const chart = rows.nth(2).locator(".landing-chapter__visual");
  await chart.scrollIntoViewIfNeeded();
  await expect(chart).toHaveAttribute("data-motion", "playing");
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await expect(chart).toHaveAttribute("data-motion", "paused");
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(chart).not.toHaveAttribute("data-motion");
});

test("hero node copy stays inside its cards at desktop and mobile sizes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const nodes = page.locator(".landing-demo-node");
    await expect(nodes).toHaveCount(4);
    for (const node of await nodes.all()) {
      const overflow = await node.evaluate((card) => {
        const bounds = card.getBoundingClientRect();
        return [...card.querySelectorAll("strong, p")].some((text) => {
          const box = text.getBoundingClientRect();
          return box.right > bounds.right + 1 || box.bottom > bounds.bottom + 1;
        });
      });
      expect(overflow).toBe(false);
    }
  }
});
