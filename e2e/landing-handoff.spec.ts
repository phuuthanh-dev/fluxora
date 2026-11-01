import { expect, test, type Page } from "@playwright/test";

test.use({
  video: process.env.LANDING_RECORD_VIDEO
    ? { mode: "on", size: { width: 1440, height: 900 } }
    : "off",
});

async function nativeScrollOnly(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind === "webgl" || kind === "webgl2") return null;
      return original.call(this, kind, ...args);
    };
  });
}

async function seek(page: Page, progress: number) {
  await page.evaluate((p) => {
    const start = document.querySelector(".landing-handoff")!.getBoundingClientRect().top + scrollY;
    const dock = document.querySelector(".landing-runtime-hub__center")!.getBoundingClientRect();
    const end = dock.top + scrollY + dock.height / 2 - innerHeight * 0.64;
    window.scrollTo({ top: start + (end - start) * p, behavior: "instant" });
  }, progress);
}

async function dockingError(page: Page) {
  return page.evaluate(() => {
    const badge = document.querySelector(".landing-statement__mark")!.getBoundingClientRect();
    const dock = document.querySelector(".landing-runtime-hub__center")!.getBoundingClientRect();
    return Math.max(Math.abs(badge.x - dock.x), Math.abs(badge.y - dock.y), Math.abs(badge.width - dock.width));
  });
}

for (const width of [1440, 375]) {
  test(`statement grows, collapses and docks reversibly at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    // Deterministic geometry, including the optional recording, must not
    // depend on a software WebGL renderer. WebGL has separate lifecycle tests.
    await nativeScrollOnly(page);
    await page.goto("/");
    const host = page.locator(".landing-handoff");
    const plate = page.locator(".landing-statement__plate");
    const copy = page.locator(".landing-statement__copy");
    const mark = page.locator(".landing-statement__mark");
    const fallbackMark = page.locator(".landing-runtime-hub__center > svg");
    await expect(host).toHaveAttribute("data-handoff", "active");
    await seek(page, 0.02);
    await expect(copy).toHaveCSS("opacity", "0");
    await expect.poll(async () => Math.abs((await plate.boundingBox())!.width - 80)).toBeLessThan(1);
    await expect(mark).toBeVisible();
    if (process.env.LANDING_RECORD_VIDEO) await page.screenshot({ path: info.outputPath("initial-icon.png") });
    const small = (await plate.boundingBox())!;
    await seek(page, 0.3);
    // The viewport may reserve a scrollbar; compare with the actual content
    // width rather than assuming the full device width is available.
    const hostWidth = (await host.boundingBox())!.width;
    await expect.poll(async () => (await plate.boundingBox())!.width).toBeGreaterThan(width === 1440 ? 1000 : hostWidth * 0.9);
    const expanded = (await plate.boundingBox())!;
    expect(expanded.width).toBeGreaterThan(small.width * 2);
    expect(expanded.height).toBeGreaterThan(450);
    expect(expanded.y).toBeGreaterThan(90);
    await expect(copy).toHaveCSS("opacity", "1");
    await expect(fallbackMark).toHaveCSS("visibility", "hidden");
    if (process.env.LANDING_RECORD_VIDEO) await page.screenshot({ path: info.outputPath("expanded.png") });
    await seek(page, 0.6);
    await expect(copy).toHaveCSS("opacity", "0");
    // The supplied fold now passes through a square instead of scaling the rectangle.
    await expect.poll(async () => Math.abs((await plate.boundingBox())!.width - (await plate.boundingBox())!.height)).toBeLessThan(1);
    expect((await plate.boundingBox())!.width).toBeLessThan(expanded.width);
    expect((await plate.boundingBox())!.width).toBeGreaterThan(80);
    expect((await mark.boundingBox())!.width).toBeGreaterThanOrEqual(68);
    await seek(page, 0.705);
    await expect.poll(async () => Math.abs((await plate.boundingBox())!.width - 80)).toBeLessThan(1);
    // Scroll offsets are rounded to physical pixels, so the sampled progress
    // can sit fractionally before the end of the fade on small viewports.
    await expect.poll(async () => Number(await page.locator(".landing-statement__grid").evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(0.01);
    if (process.env.LANDING_RECORD_VIDEO) await page.screenshot({ path: info.outputPath("collapsed.png") });
    if (width === 1440) {
      for (const progress of [0.8, 0.85, 0.9, 0.95]) {
        await seek(page, progress);
        await expect.poll(async () => page.evaluate(() => {
          const badge = document.querySelector(".landing-statement__mark")!.getBoundingClientRect();
          return [...document.querySelectorAll(".landing-reliability h2, .landing-reliability h3, .landing-reliability__card > p")]
            .filter((element) => {
              // Measure the rendered lines, not empty block-width whitespace.
              const range = document.createRange();
              range.selectNodeContents(element);
              return [...range.getClientRects()].some((copy) =>
                badge.left < copy.right && badge.right > copy.left &&
                badge.top < copy.bottom && badge.bottom > copy.top,
              );
            }).map((element) => element.textContent);
        }), { message: `Badge must clear copy at progress ${progress}` }).toEqual([]);
      }
    }
    await seek(page, 1.01);
    await expect.poll(() => dockingError(page)).toBeLessThan(1);
    if (process.env.LANDING_RECORD_VIDEO) await page.screenshot({ path: info.outputPath("docked.png") });
    // It must continue tracking the card after the scroll timeline finishes.
    await seek(page, 1.12);
    await expect.poll(() => dockingError(page)).toBeLessThan(1);
    await seek(page, 0.3);
    await expect(copy).toHaveCSS("opacity", "1");
    await expect.poll(async () => Math.abs((await plate.boundingBox())!.width - expanded.width)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    if (process.env.LANDING_RECORD_VIDEO && width === 1440) {
      // Temporal evidence supplements checkpoint assertions; no autoplay tween.
      for (const direction of [1, -1]) {
        for (let frame = 0; frame <= 40; frame++) {
          await seek(page, direction === 1 ? frame / 40 : 1 - frame / 40);
          await page.waitForTimeout(90);
        }
      }
    }
  });
}

test("docking survives resize, deep reload, pause and preference changes", async ({ page }) => {
  await nativeScrollOnly(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const host = page.locator(".landing-handoff");
  await expect(host).toHaveAttribute("data-handoff", "active");
  await seek(page, 1.03);
  await expect.poll(() => dockingError(page)).toBeLessThan(1);
  await page.reload();
  await expect(host).toHaveAttribute("data-handoff", "active");
  await expect.poll(() => dockingError(page)).toBeLessThan(1);
  await page.setViewportSize({ width: 768, height: 900 });
  // Resize refresh changes the layout and the timeline's document anchors.
  await expect.poll(async () => (await page.locator(".landing-statement__plate").boundingBox())!.width).toBeLessThan(769);
  await seek(page, 1.04);
  await expect.poll(() => dockingError(page)).toBeLessThan(1);
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(host).not.toHaveAttribute("data-handoff", "active");
  await expect(page.locator(".landing-statement__copy")).toHaveCSS("opacity", "1");
  await expect(page.locator(".landing-runtime-hub__center > svg")).toBeVisible();
  await page.getByRole("button", { name: "Resume visual effects" }).click();
  await expect(host).toHaveAttribute("data-handoff", "active");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(host).not.toHaveAttribute("data-handoff", "active");
  await expect(page.locator(".landing-statement__plate")).toHaveCSS("transform", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(host).toHaveAttribute("data-handoff", "active");
  await seek(page, 1.03);
  await expect.poll(() => dockingError(page)).toBeLessThan(1);
  await page.locator("header").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(host).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/lenis/);
});

test("no JavaScript keeps the statement and diagram independently readable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".landing-handoff")).not.toHaveAttribute("data-handoff", "active");
  await expect(page.locator(".landing-statement__copy")).toBeVisible();
  await expect(page.locator(".landing-runtime-hub__center > svg")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await context.close();
});
