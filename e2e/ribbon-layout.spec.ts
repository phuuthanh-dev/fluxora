import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test.use({ video: process.env.LANDING_RECORD_VIDEO ? "on" : "off" });

test("ribbon morphs existing GPU data when FAQ height changes, without restarting scroll", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const probe = {
      armed: false, textures: 0, buffers: 0, programs: 0, scrollListenerRemovals: 0,
      range: [0, 0], ranges: [] as number[][], times: [] as number[], scrolls: [] as number[],
      lastRangeUpdate: 0, lastScroll: 0,
    };
    Object.assign(window, { ribbonProbe: probe });
    const locations = new WeakMap<WebGLUniformLocation, string>();
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const createTexture = prototype.createTexture;
      prototype.createTexture = function() { if (probe.armed) probe.textures++; return createTexture.call(this); };
      const createBuffer = prototype.createBuffer;
      prototype.createBuffer = function() { if (probe.armed) probe.buffers++; return createBuffer.call(this); };
      const createProgram = prototype.createProgram;
      prototype.createProgram = function() { if (probe.armed) probe.programs++; return createProgram.call(this); };
      const locate = prototype.getUniformLocation;
      prototype.getUniformLocation = function(program, name) {
        const location = locate.call(this, program, name);
        if (location) locations.set(location, name);
        return location;
      };
      const uniform3f = prototype.uniform3f;
      prototype.uniform3f = function(location, x, y, z) {
        if (location && locations.get(location) === "uView") {
          probe.lastScroll = z;
          if (probe.armed) probe.scrolls.push(z);
        }
        return uniform3f.call(this, location, x, y, z);
      };
      const uniform1f = prototype.uniform1f;
      prototype.uniform1f = function(location, value) {
        if (location && locations.get(location) === "uLen" && Math.abs(value - probe.range[1]!) > .001) {
          probe.range = [0, value]; probe.lastRangeUpdate = performance.now();
          if (probe.armed) probe.ranges.push([0, value]);
        }
        if (probe.armed && location) {
          if (locations.get(location) === "uTime") probe.times.push(value);
        }
        return uniform1f.call(this, location, value);
      };
    }
    // Lenis legitimately replaces its CSS classes when scrolling stops; that
    // is not a restart. Its wheel listener is removed only during teardown.
    const removeListener = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (probe.armed && this === window && type === "wheel") probe.scrollListenerRemovals++;
      return removeListener.call(this, type, listener, options);
    };
  });
  await page.goto("/#faq");
  // Lazy module loading and software shader compilation are startup work;
  // the interaction/morph assertions below retain their normal deadlines.
  await expect(page.locator(".landing-scene")).toHaveAttribute("data-scene-state", "running", { timeout: 15_000 });
  await info.attach("renderer-capabilities", { contentType: "application/json", body: await page.locator(".landing-scene canvas").evaluate(el => {
    const canvas = el as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2")!;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return JSON.stringify({ renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unavailable", width: canvas.width, height: canvas.height });
  }) });
  const row = page.locator(".landing-faq__item").first();
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  // Wait for initial font/pin measurements, then observe only the user action.
  await page.waitForFunction(() => {
    const probe = (window as unknown as { ribbonProbe: { lastRangeUpdate: number } }).ribbonProbe;
    return probe.lastRangeUpdate > 0 && performance.now() - probe.lastRangeUpdate > 180;
  });
  await page.evaluate(() => {
    const probe = (window as unknown as { ribbonProbe: { armed: boolean; range: number[]; ranges: number[][]; lastScroll: number; scrolls: number[] } }).ribbonProbe;
    probe.armed = true; probe.ranges = [probe.range]; probe.scrolls = [probe.lastScroll];
  });
  await row.locator("summary").click();
  await expect(row.locator("p")).toBeHidden();
  await page.waitForFunction(() => {
    const probe = (window as unknown as { ribbonProbe: { ranges: number[][]; lastRangeUpdate: number } }).ribbonProbe;
    return probe.ranges.length > 5 && performance.now() - probe.lastRangeUpdate > 180;
  });
  const first = await page.evaluate(() => (window as unknown as { ribbonProbe: {
    textures: number; buffers: number; programs: number; scrollListenerRemovals: number;
    ranges: number[][]; times: number[]; scrolls: number[];
  } }).ribbonProbe);
  expect(first.textures).toBe(0);
  expect(first.buffers).toBe(0);
  expect(first.programs).toBe(0);
  expect(first.scrollListenerRemovals).toBe(0);
  const ranges = first.ranges.map(range => range[1]);
  const total = Math.abs(ranges.at(-1)! - ranges[0]);
  expect(total).toBeGreaterThan(0.1);
  const largestStep = Math.max(...ranges.slice(1).map((value, index) => Math.abs(value - ranges[index])));
  expect(largestStep / total).toBeLessThan(0.45);
  expect(first.times.every((value, index) => index === 0 || value >= first.times[index - 1])).toBe(true);
  expect(first.scrolls.length).toBeGreaterThan(0);
  expect(Math.max(...first.scrolls) - Math.min(...first.scrolls)).toBeLessThan(0.5);
  const receipt = info.outputPath("ribbon-lifecycle.json");
  await writeFile(receipt, JSON.stringify({ ...first, largestStep, total }));
  await info.attach("ribbon-lifecycle", { path: receipt, contentType: "application/json" });

  // Reverse while a previous target may still be moving, then change viewport.
  await row.locator("summary").click();
  await expect(row.locator("p")).toBeVisible();
  await row.locator("summary").click();
  await expect(row.locator("p")).toBeHidden();
  await row.locator("summary").click();
  await expect.poll(() => row.locator(".ui-disclosure__content").evaluate(el => el.style.height)).toBe("");
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForFunction(() => {
    const probe = (window as unknown as { ribbonProbe: { lastRangeUpdate: number } }).ribbonProbe;
    return performance.now() - probe.lastRangeUpdate > 180;
  });
  await expect(page.locator(".landing-scene canvas")).toHaveCount(1);
  const resources = await page.evaluate(() => {
    const p = (window as unknown as { ribbonProbe: { textures: number; buffers: number; programs: number; scrollListenerRemovals: number } }).ribbonProbe;
    return [p.textures, p.buffers, p.programs, p.scrollListenerRemovals];
  });
  // A viewport resize legitimately resizes bloom framebuffers; the curve,
  // particle buffers, programs and scroll owner remain alive.
  expect(resources.slice(1)).toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
  if (process.env.LANDING_RECORD_VIDEO) {
    await page.screenshot({ path: info.outputPath("ribbon-layout.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("link", { name: "Fluxora home", exact: true }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: info.outputPath("relay-hero.png") });
    for (const selector of [".landing-reliability", "#daily-view", ".landing-footer"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: info.outputPath(`${selector.replace(/[.#]/g, "")}.png`) });
    }
  }
});
