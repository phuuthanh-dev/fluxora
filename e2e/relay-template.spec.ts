import { expect, test, type Page } from "@playwright/test";

test.use({ video: process.env.LANDING_RECORD_VIDEO ? "on" : "off" });

async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return original.call(this, type, ...args);
    };
  });
}

test("intro counts real readiness, floods, folds and releases the page", async ({
  page,
}, info) => {
  await withoutWebGL(page);
  await page.addInitScript(() => {
    const phases: string[] = [];
    Object.assign(window, { introPhases: phases });
    new MutationObserver(() => {
      const host = document.querySelector<HTMLElement>(".landing-loader");
      if (host && !host.hidden && phases.at(-1) !== host.dataset.phase)
        phases.push(host.dataset.phase!);
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-phase", "hidden"],
    });
  });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { introPhases: string[] }).introPhases,
      ),
      { timeout: 8_000 },
    )
    .toEqual(["draw", "flood", "fold"]);
  await expect(page.locator(".landing-loader")).toBeHidden({ timeout: 8_000 });
  expect(await page.locator("main").evaluate((el) => el.inert)).toBe(false);
  expect(await page.locator("html").evaluate((el) => el.style.overflow)).toBe(
    "",
  );
  await expect(page.locator(".landing-demo")).toHaveAttribute(
    "data-boot",
    "ready",
    { timeout: 8_000 },
  );
  await expect(
    page.getByRole("button", { name: "Run sample", exact: true }),
  ).toBeEnabled();
  await info.attach("intro-hero", {
    body: await page.screenshot({ path: info.outputPath("intro-hero.png") }),
    contentType: "image/png",
  });
});

test("intro can be skipped with the keyboard and cannot lock a page after asset failure", async ({
  page,
}) => {
  await withoutWebGL(page);
  await page.route("**/relay/hero/hero-window-bloom.webp", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page.keyboard.press("Escape");
  await expect(page.locator(".landing-loader")).toBeHidden();
  expect(await page.locator("main").evaluate((el) => el.inert)).toBe(false);
  await page
    .getByRole("link", { name: "Start in Fluxora", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.locator("html").evaluate((el) => el.style.overflow)).toBe(
    "",
  );
  await page.goto("/");
  await expect(page.locator(".landing-loader")).toBeHidden({ timeout: 8_000 });
  expect(await page.locator("main").evaluate((el) => el.inert)).toBe(false);
});

test("hero packets pause offscreen and reduced motion keeps the alternate sample usable", async ({
  page,
}) => {
  await withoutWebGL(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".landing-demo")).toHaveAttribute(
    "data-boot",
    "ready",
    { timeout: 8_000 },
  );
  const packet = page.locator(".landing-demo__packet");
  await expect.poll(() => packet.getAttribute("transform")).not.toBeNull();
  const before = await packet.getAttribute("transform");
  await expect.poll(() => packet.getAttribute("transform")).not.toBe(before);
  await page.locator("#usage").scrollIntoViewIfNeeded();
  await expect(page.locator(".landing-demo")).toHaveAttribute(
    "data-flow",
    "paused",
  );
  const parked = await packet.getAttribute("transform");
  await page.waitForTimeout(350);
  expect(await packet.getAttribute("transform")).toBe(parked);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Use saved sample").check();
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await expect(page.locator(".landing-demo-node--2")).toHaveClass(/is-done/);
  await expect(page.locator(".landing-demo-node--1")).not.toHaveClass(
    /is-done/,
  );
  await expect(page.locator(".landing-demo-node.is-done")).toHaveCount(3);
});

for (const width of [375, 768, 1440]) {
  test(`template board, run meter and footer fit ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".landing-loader")).toBeHidden();
    await page.locator(".landing-demo").scrollIntoViewIfNeeded();
    for (const node of await page.locator(".landing-demo-node").all()) {
      const box = (await node.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const copy = await node.locator("strong, p").evaluateAll((elements) =>
        elements.map((el) => {
          const box = el.closest(".landing-demo-node")!.getBoundingClientRect();
          const text = el.getBoundingClientRect();
          return text.top >= box.top && text.bottom <= box.bottom;
        }),
      );
      expect(copy).toEqual([true, true]);
    }
    await info.attach(`board-${width}`, {
      body: await page.screenshot({ path: info.outputPath(`board-${width}.png`) }),
      contentType: "image/png",
    });
    await page.locator("#usage").scrollIntoViewIfNeeded();
    await expect(page.locator(".landing-run-card")).toHaveCount(3);
    const range = page.getByRole("slider", {
      name: "How many runs do you expect a month?",
    });
    await range.press("End");
    await expect(range).toHaveAttribute(
      "aria-valuetext",
      "300,000 runs per month, Higher volume planning profile",
    );
    await info.attach(`runs-${width}`, {
      body: await page.screenshot({ path: info.outputPath(`runs-${width}.png`) }),
      contentType: "image/png",
    });
    const footer = page.getByRole("contentinfo", { name: "Fluxora footer" });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
    await info.attach(`footer-${width}`, {
      body: await page.screenshot({ path: info.outputPath(`footer-${width}.png`) }),
      contentType: "image/png",
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
