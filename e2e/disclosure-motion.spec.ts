import { expect, test } from "@playwright/test";

test.use({ video: process.env.LANDING_RECORD_VIDEO ? "on" : "off" });

for (const width of [375, 1440]) {
  test(`FAQ interpolates height, reverses and preserves scroll at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    // Isolate DOM layout from software rasterization; native WebGL is reviewed separately.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        if (kind === "webgl" || kind === "webgl2") return null;
        return original.call(this, kind, ...args);
      };
    });
    await page.goto("/#faq");
    const row = page.locator(".landing-faq__item").first();
    await expect(row.locator("summary")).toHaveAttribute("aria-expanded", "true");
    await row.scrollIntoViewIfNeeded();
    // Sample the actual transition, not only its final state. The click is
    // inside evaluate so no Playwright auto-scroll/stability wait masks a jump.
    const frames = await row.evaluate(async (element) => {
      const trigger = element.querySelector("summary")!;
      const content = element.querySelector<HTMLElement>(".ui-disclosure__content")!;
      const frames: { height: number; scroll: number }[] = [];
      const read = () => frames.push({ height: content.getBoundingClientRect().height, scroll: scrollY });
      read(); trigger.click();
      const start = performance.now();
      while (performance.now() - start < 500) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); read();
      }
      return frames;
    });
    const full = frames[0].height;
    await info.attach("disclosure-frames", { body: JSON.stringify(frames), contentType: "application/json" });
    expect(full).toBeGreaterThan(40);
    expect(frames.some(frame => frame.height > 2 && frame.height < full - 2)).toBe(true);
    expect(frames.at(-1)!.height).toBe(0);
    expect(Math.max(...frames.map(frame => frame.scroll)) - Math.min(...frames.map(frame => frame.scroll))).toBeLessThan(3);
    await row.evaluate(async (element) => {
      const trigger = element.querySelector("summary")!;
      trigger.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      trigger.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      trigger.click();
    });
    await expect(row.locator("summary")).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => row.locator(".ui-disclosure__content").evaluate(el => el.style.height)).toBe("");
    await expect(row.locator("p")).toBeVisible();
    await row.locator("summary").press("Space");
    await expect(row.locator("p")).toBeHidden();
    await row.locator("summary").press("Enter");
    await expect(row.locator("p")).toBeVisible();
    // Opening another answer must not collapse text above the clicked question.
    await page.locator(".landing-faq__item").nth(1).locator("summary").click();
    await expect(row).toHaveAttribute("open", "");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await row.locator("summary").click();
    await expect(row.locator("p")).toBeHidden();
    await expect(row.locator(".ui-disclosure__content")).not.toHaveAttribute("data-animating", "true");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "Pause visual effects" }).click();
    await row.locator("summary").click();
    await expect(row.locator("p")).toBeVisible();
    await expect(row.locator(".ui-disclosure__content")).not.toHaveAttribute("data-animating", "true");
    await page.setViewportSize({ width: width === 375 ? 768 : 1100, height: 900 });
    expect(await row.locator(".ui-disclosure__content").evaluate(el => el.clientHeight >= el.scrollHeight)).toBe(true);
    if (process.env.LANDING_RECORD_VIDEO) await page.screenshot({ path: info.outputPath("faq.png") });
  });
}

test("FAQ remains a usable native disclosure without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/#faq");
  const row = page.locator(".landing-faq__item").nth(1);
  await row.locator("summary").click();
  await expect(row.locator("p")).toBeVisible();
  await row.locator("summary").click();
  await expect(row.locator("p")).toBeHidden();
  await context.close();
});

test("FAQ settles without scroll jumps while the landing renderer is active", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/#faq");
  const supported = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  });
  const scene = page.locator(".landing-scene");
  await expect(scene).toHaveAttribute("data-scene-state", supported ? "running" : "fallback");
  const row = page.locator(".landing-faq__item").first();
  await row.scrollIntoViewIfNeeded();
  // Wait for the current scroll target to settle, then observe real layout.
  const frames = await row.evaluate(async element => {
    await document.fonts.ready;
    let stable = 0;
    let previous = scrollY;
    for (let index = 0; index < 120 && stable < 5; index++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      stable = Math.abs(previous - scrollY) < 0.5 ? stable + 1 : 0;
      previous = scrollY;
    }
    const content = element.querySelector<HTMLElement>(".ui-disclosure__content")!;
    const result = [{ height: content.getBoundingClientRect().height, scroll: scrollY }];
    element.querySelector("summary")!.click();
    const start = performance.now();
    while (performance.now() - start < 750) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      result.push({ height: content.getBoundingClientRect().height, scroll: scrollY });
    }
    return result;
  });
  await info.attach("renderer-disclosure-frames", { body: JSON.stringify(frames), contentType: "application/json" });
  expect(frames.some(frame => frame.height > 1 && frame.height < frames[0].height - 1)).toBe(true);
  await expect(row.locator("p")).toBeHidden();
  expect(Math.max(...frames.map(frame => frame.scroll)) - Math.min(...frames.map(frame => frame.scroll))).toBeLessThan(3);
  await expect(scene).toHaveAttribute("data-scene-state", supported ? "running" : "fallback");
  await row.locator("summary").click();
  await expect.poll(() => row.locator(".ui-disclosure__content").evaluate(el => el.style.height)).toBe("");
  await expect(row.locator("p")).toBeVisible();
  expect(errors).toEqual([]);
  if (process.env.LANDING_RECORD_VIDEO) await page.screenshot({ path: info.outputPath("faq-webgl.png") });
});
