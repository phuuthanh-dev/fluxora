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
      const icon = element.querySelector<HTMLElement>("span");
      return { card: [card.width, card.height], icon: icon && [icon.offsetWidth, icon.offsetHeight] };
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

test("mobile integration rail keeps all providers reachable with a keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await releaseIntro(page);
  const rail = page.getByRole("region", { name: "Supported integrations; scroll horizontally to see more" });
  await rail.scrollIntoViewIfNeeded();
  await expect(rail.locator("[data-integration]")).toHaveCount(6);
  await expect(page.getByText("Swipe to see all apps →")).toBeVisible();
  expect(await rail.evaluate((element) => element.scrollWidth)).toBeGreaterThan(await rail.evaluate((element) => element.clientWidth));
  await rail.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await rail.getByText("Steam", { exact: true }).scrollIntoViewIfNeeded();
  const lastIsWithinRail = await rail.evaluate((element) => {
    const tile = element.querySelectorAll("[data-integration]")[5]!.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return tile.left >= bounds.left && tile.right <= bounds.right;
  });
  expect(lastIsWithinRail).toBe(true);
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
  // Once the entrance has settled, the lit tile must be the one nearest the
  // actual packet, including when the rail does not fill the tile row.
  await page.waitForTimeout(2000);
  await expect.poll(async () => rail.evaluate((root) => {
    const packet = root.querySelector(".landing-integrations__packet")!.getBoundingClientRect();
    const tiles = [...root.querySelectorAll<HTMLElement>("[data-integration]")];
    const center = packet.left + packet.width / 2;
    const nearest = tiles.reduce((best, tile, index) => {
      const box = tile.getBoundingClientRect();
      return Math.abs(box.left + box.width / 2 - center) < best.distance
        ? { index, distance: Math.abs(box.left + box.width / 2 - center) }
        : best;
    }, { index: -1, distance: Infinity });
    return tiles[nearest.index]?.dataset.signal;
  })).toBe("active");
  const first = (await packet.boundingBox())!.x;
  const track = rail.locator(".landing-integrations__rail");
  const firstPeak = await track.evaluate((element) => parseFloat((element as HTMLElement).style.getPropertyValue("--rail-head")));
  await expect.poll(async () => Math.abs((await packet.boundingBox())!.x - first)).toBeGreaterThan(10);
  await expect.poll(() => track.evaluate((element) => parseFloat((element as HTMLElement).style.getPropertyValue("--rail-head")))).toBeGreaterThan(firstPeak);
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(packet).toHaveCSS("opacity", "0");
  await expect.poll(() => track.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--rail-head"))).toBe("");
  await expect(rail.locator('[data-signal="active"]')).toHaveCount(0);
});

test("integration packet preserves its lap across a brief scroll away", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const rail = page.locator(".landing-integrations");
  await rail.scrollIntoViewIfNeeded();
  const packet = rail.locator(".landing-integrations__packet");
  await expect(packet).toBeVisible();
  await page.waitForTimeout(2000);
  const before = await packet.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41);
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await rail.scrollIntoViewIfNeeded();
  await expect(packet).toBeVisible();
  const after = await packet.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41);
  expect(after).toBeGreaterThanOrEqual(before - 25);
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
  await expect(bars).toHaveCount(4);
  await expect(bars.last()).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await expect(trace.locator('[data-trace-count="120"]')).toHaveText("120");
  await expect(trace.locator(".landing-chapter__trace-row svg path").first()).toHaveCSS("stroke-dashoffset", "0px");
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(bars.last()).toHaveCSS("transform", "none");
  await expect(trace.locator('[data-trace-count="120"]')).toHaveText("120");
  await expect(trace.getByText("Output")).toBeVisible();
});

test("hero feed inserts a new sample above the previous run", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const rows = page.locator(".landing-demo__feed-row");
  await expect(rows).toHaveCount(4);
  const first = (await rows.first().innerText()).trim();
  await expect.poll(async () => (await rows.first().innerText()).trim(), { timeout: 12000 }).not.toBe(first);
  await expect.poll(async () => (await rows.nth(1).innerText()).trim()).toBe(first);
  await expect(rows.last()).toHaveAttribute("aria-hidden", "true");
});

test("hero packet briefly lights a port and motion pause clears its glow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const flashes = page.locator(".landing-demo-node__flash");
  await expect(flashes).toHaveCount(4);
  await expect.poll(() => flashes.evaluateAll((nodes) =>
    Math.max(...nodes.map((node) => Number(getComputedStyle(node).opacity))),
  ), { timeout: 8000, intervals: [50] }).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect.poll(() => flashes.evaluateAll((nodes) =>
    Math.max(...nodes.map((node) => Number(getComputedStyle(node).opacity))),
  )).toBe(0);
});

test("runtime hub packets move only while motion is enabled", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const hub = page.locator(".landing-runtime-hub");
  await hub.scrollIntoViewIfNeeded();
  const packet = hub.locator(".landing-runtime-hub__packet").first();
  await expect(hub.locator(".landing-runtime-hub__packet")).toHaveCount(6);
  const start = await packet.getAttribute("cx");
  await expect.poll(() => packet.getAttribute("cx"), { timeout: 5000 }).not.toBe(start);
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(packet).toHaveCSS("opacity", "0");
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
  const lastCube = chart.locator(".landing-volume__cube").last();
  await expect(lastCube).toHaveCSS("opacity", "1", { timeout: 4000 });
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await expect(chart).toHaveAttribute("data-motion", "paused");
  await chart.scrollIntoViewIfNeeded();
  await expect(chart).toHaveAttribute("data-motion", "playing");
  await expect(lastCube).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(chart).not.toHaveAttribute("data-motion");
});

test("chart completes before its hold and rewinds without an empty-frame pause", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const chart = page.locator(".landing-chapter__visual").nth(2);
  await chart.scrollIntoViewIfNeeded();
  await expect(chart).toHaveAttribute("data-motion", "playing");
  const lastCube = chart.locator(".landing-volume__cube").last();
  await expect(lastCube).toHaveCSS("opacity", "1", { timeout: 4000 });
  const glow = chart.locator(".landing-volume__glow");
  await expect.poll(async () => Number(await glow.evaluate((el) => getComputedStyle(el).opacity)), { timeout: 5000, intervals: [50] }).toBeGreaterThan(0.1);
  await expect(chart.locator(".landing-volume__cap").last()).toHaveCSS("opacity", "1");
  // A layout refresh while the chart is holding must not restart the loop.
  await page.setViewportSize({ width: 1439, height: 900 });
  await page.waitForTimeout(400);
  await expect(lastCube).toHaveCSS("opacity", "1");
  await page.waitForTimeout(600);
  await expect(lastCube).toHaveCSS("opacity", "1");
  // The outer bar must visibly pass through intermediate sizes on its return.
  const lastBar = chart.locator(".landing-volume__bar").last();
  await expect.poll(async () => lastBar.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    const scale = transform === "none" ? 1 : new DOMMatrix(transform).d;
    return scale > 0.15 && scale < 0.8;
  }), { timeout: 5000, intervals: [100] }).toBe(true);
  await expect.poll(async () => Number(await lastCube.evaluate((el) => getComputedStyle(el).opacity)), { timeout: 5000, intervals: [50] }).toBeLessThan(0.9);
  await expect.poll(async () => Number(await lastCube.evaluate((el) => getComputedStyle(el).opacity)), { timeout: 5000, intervals: [50] }).toBeGreaterThan(0.1);
});

test("primary sections follow the Relay narrative before Fluxora additions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const selectors = [".landing-hero", "#integrations", "#product", ".landing-handoff", "#daily-view", "#workspace-preview", ".landing-cases", "#usage", ".landing-footer"];
  const order = await page.evaluate((items) => items.map((selector) => {
    const node = document.querySelector(selector);
    return node ? node.getBoundingClientRect().top + window.scrollY : -1;
  }), selectors);
  expect(order.every((value) => value >= 0)).toBe(true);
  for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]!);
});

test("daily view keeps five sample widgets readable in a mobile column", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const daily = page.locator(".landing-daily__grid");
  const widgets = daily.locator(":scope > div");
  await expect(widgets).toHaveCount(5);
  await expect(daily.getByText("WHEN A STEP NEEDS ATTENTION")).toBeVisible();
  const boxes = await widgets.evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  }));
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom);
    expect(boxes[i]!.right).toBeLessThanOrEqual(375);
  }
  await expect(daily.locator(".landing-daily__recovery path")).toHaveCSS("stroke-dashoffset", "0px");
});

test("daily gauge counts its selected sample and restores it when motion pauses", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const gauge = page.locator(".landing-daily__gauge");
  await gauge.scrollIntoViewIfNeeded();
  const value = gauge.locator(".landing-daily__gauge-value");
  await expect.poll(async () => Number(await value.innerText()), { timeout: 6000 }).toBe(Number(await value.getAttribute("data-value")));
  await page.getByLabel("Preview day").selectOption("0");
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect.poll(async () => Number(await value.innerText())).toBe(Number(await value.getAttribute("data-value")));
  await expect(gauge.locator("strong[aria-label]")).toHaveAttribute("aria-label", /%$/);
});

test("run planner feature details remain readable after their entrance and when paused", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const card = page.locator(".landing-run-card").first();
  await card.scrollIntoViewIfNeeded();
  const feature = card.locator("li").first();
  await expect(feature.locator("span")).toHaveCSS("opacity", "1");
  await expect(feature.locator("svg")).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(feature).toBeVisible();
  await expect(feature.locator("svg")).toHaveCSS("opacity", "1");
});

test("proof blooms scrub with scroll and revert for reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await releaseIntro(page);
  const section = page.locator(".landing-cases");
  const blooms = section.locator(".landing-cases__bloom > span");
  await expect(blooms).toHaveCount(2);
  await section.scrollIntoViewIfNeeded();
  const first = await blooms.first().evaluate((element) => getComputedStyle(element).transform);
  await page.evaluate(() => window.scrollBy(0, 180));
  await expect.poll(() => blooms.first().evaluate((element) => getComputedStyle(element).transform)).not.toBe(first);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(blooms.first()).toHaveCSS("transform", "none");
});

test("Relay-aligned feature content remains available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByLabel("Illustrative execution trace")).toBeVisible();
    await expect(page.getByLabel("Illustrative approval request")).toBeVisible();
    await expect(page.getByLabel("Illustrative runs by day")).toBeVisible();
    await expect(page.getByText("WHEN A STEP NEEDS ATTENTION")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    await context.close();
  }
});

test("hero node copy stays inside its cards at desktop and mobile sizes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
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
      const orphan = await node.locator("p").evaluate((text) => {
        const child = text.firstChild;
        if (!child || child.nodeType !== Node.TEXT_NODE) return false;
        const words = [...(child.textContent ?? "").matchAll(/\S+/g)];
        const rows = new Map<number, number>();
        for (const word of words) {
          const range = document.createRange();
          range.setStart(child, word.index!);
          range.setEnd(child, word.index! + word[0].length);
          const y = Math.round(range.getBoundingClientRect().top);
          rows.set(y, (rows.get(y) ?? 0) + 1);
        }
        return rows.size > 1 && [...rows.values()].at(-1) === 1;
      });
      expect(orphan).toBe(false);
    }
  }
});
