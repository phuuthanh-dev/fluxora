import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test.use({ video: process.env.LANDING_RECORD_VIDEO ? "on" : "off" });

for (const width of [375, 768, 1440]) {
  test(`homepage reading roles and footer remain usable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (process.env.LANDING_RECORD_VIDEO) await page.locator(".landing-demo").screenshot({ path: info.outputPath(`demo-${width}.png`) });
    for (const [selector, minimum] of [
      [".landing-eyebrow", 12],
      [".landing-faq__item summary", 18],
      [".landing-faq__item p", 16],
      [".landing-case > p", 15],
      [".landing-footer nav a", 14],
      [".landing-footer__bottom", 12],
    ] as const) {
      const sizes = await page.locator(selector).evaluateAll(elements =>
        elements.map(element => parseFloat(getComputedStyle(element).fontSize)),
      );
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes), selector).toBeGreaterThanOrEqual(minimum);
    }
    await expect(page.locator("body")).toHaveCSS("font-family", /gilroy/i);
    await expect(page.locator(".landing-page")).toHaveCSS("font-family", /Inter/);
    await expect(page.locator("h1 em")).toHaveCSS("font-family", /Instrument Serif/);
    await expect(page.locator(".landing-eyebrow").first()).toHaveCSS("font-family", /Fragment Mono/);
    expect(await page.locator(".landing-page").evaluate(el => getComputedStyle(el).getPropertyValue("--relay-lime").trim())).toBe("#c8f751");
    const footer = page.getByRole("contentinfo", { name: "Fluxora footer" });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/phuuthanh-dev/workflow-automation");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (process.env.LANDING_RECORD_VIDEO) await page.screenshot({ path: info.outputPath(`footer-${width}.png`), fullPage: false });
  });
}

test("GSAP section entrances respect pause and preference changes", async ({ page }, info) => {
  // Exercise DOM motion without depending on software WebGL performance.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      if (kind === "webgl" || kind === "webgl2") return null;
      return original.call(this, kind, ...args);
    };
  });
  await page.goto("/");
  const faq = page.locator(".landing-faq__items");
  await faq.scrollIntoViewIfNeeded();
  await expect(faq.locator("details").last()).toHaveCSS("opacity", "1");
  await expect(page.locator(".landing-faq > .landing-reveal").first()).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(faq.locator("details").first()).toHaveCSS("transform", "none");
  await page.getByRole("button", { name: "Resume visual effects" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(faq.locator("details").first()).toHaveCSS("transform", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await faq.scrollIntoViewIfNeeded();
  await expect(faq.locator("details").last()).toHaveCSS("opacity", "1");
  await expect(page.locator(".landing-faq > .landing-reveal").first()).toHaveCSS("opacity", "1");
  if (process.env.LANDING_RECORD_VIDEO) {
    await page.screenshot({ path: info.outputPath("faq.png") });
    for (const selector of ["#top", "#product", "#narrative", "#faq", ".landing-footer"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
    }
  }
  await page.locator("header").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".landing-reveal")).toHaveCount(0);
});


test("Relay artwork is local and intact", async ({ request }) => {
  const manifest = JSON.parse(await readFile("apps/web/public/relay/manifest.json", "utf8")) as {
    assets: { path: string; sha256: string; bytes: number }[];
  };
  expect(manifest.assets.length).toBeGreaterThan(0);
  for (const asset of manifest.assets) {
    const response = await request.get(`/relay/${asset.path}`);
    expect(response.ok(), asset.path).toBe(true);
    const bytes = await response.body();
    expect(bytes.length, asset.path).toBe(asset.bytes);
    expect(createHash("sha256").update(bytes).digest("hex"), asset.path).toBe(asset.sha256);
  }
});
