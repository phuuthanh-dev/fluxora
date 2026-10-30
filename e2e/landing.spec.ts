import { expect, test } from "@playwright/test";

test("public landing leads to the existing login without changing the auth boundary", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good work. On autopilot." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start in Fluxora" }),
  ).toHaveAttribute("href", "/login");
  await expect(page.locator(".landing-demo-node")).toHaveCount(4);
  await page.getByRole("link", { name: "Start in Fluxora" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
});

test("sample run progresses, stops and replays locally without contacting an API", async ({
  page,
}) => {
  // Keep the whole sample visible so automatic scrolling cannot consume its
  // short running state while the decorative scene settles on a busy runner.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" || /\/api\//.test(request.url()))
      mutations.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await expect(page.locator(".landing-demo")).toHaveAttribute(
    "data-demo-step",
    "1",
  );
  await page.getByRole("button", { name: "Stop sample" }).click();
  await expect(page.locator(".landing-demo")).toHaveAttribute(
    "data-demo-step",
    "0",
  );
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await expect(page.locator(".landing-demo").getByRole("status")).toHaveText(
    "Sample complete. Three steps, one clear trail.",
  );
  await expect(page.locator(".landing-demo-node.is-done")).toHaveCount(3);
  await page.getByRole("button", { name: "Replay sample" }).click();
  await expect(page.locator(".landing-demo")).toHaveAttribute(
    "data-demo-step",
    "1",
  );
  expect(mutations).toEqual([]);
});

test("reduced motion removes WebGL and makes sample results immediate", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".landing-page")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await expect(page.locator(".landing-demo")).toHaveCSS("transform", "none");
  await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Run sample", exact: true }).click();
  await expect(page.locator(".landing-demo")).toHaveAttribute(
    "data-demo-step",
    "4",
  );
  await expect(
    page.getByRole("button", { name: "Replay sample" }),
  ).toBeVisible();
});

test("no-WebGL browsers keep the original SVG visual and product interactions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextId, ...args) {
      if (contextId === "webgl" || contextId === "webgl2") return null;
      return original.call(this, contextId, ...args);
    };
  });
  await page.goto("/");
  await expect(page.locator(".landing-scene")).toHaveAttribute(
    "data-scene-state",
    "fallback",
  );
  await expect(page.locator(".landing-stream-fallback")).toBeVisible();
  await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
  await page.getByRole("tab", { name: "Inspect every run" }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Every step tells a story.",
  );
});

test("WebGL reacts to motion preferences and recovers visually from context loss", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const supported = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  });
  if (supported) {
    await expect(page.getByRole("button", { name: "Run sample", exact: true })).toBeEnabled({ timeout: 8_000 });
    await expect(page.locator(".landing-scene canvas")).toBeVisible({ timeout: 15_000 });
    await page.locator(".landing-scene canvas").evaluate((canvas) => {
      Object.assign(window, { retiredLandingContext: (canvas as HTMLCanvasElement).getContext("webgl2") });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { retiredLandingContext: WebGL2RenderingContext }).retiredLandingContext.isContextLost(),
    )).toBe(true);
    await expect(page.locator("html")).not.toHaveClass(/lenis/);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator(".landing-scene canvas")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".landing-scene")).toHaveAttribute(
      "data-scene-state",
      "running",
      { timeout: 15_000 },
    );
    await page.locator(".landing-scene canvas").evaluate((canvas) => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    await expect(page.locator(".landing-scene")).toHaveAttribute(
      "data-scene-state",
      "fallback",
    );
    await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/lenis/);
  } else {
    await expect(page.locator(".landing-scene")).toHaveAttribute(
      "data-scene-state",
      "fallback",
    );
  }
  await expect(page.locator(".landing-stream-fallback")).toBeVisible();
  expect(errors).toEqual([]);
});

test("scroll decoration stays behind content and can be paused across sections", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".landing-light-stream")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await expect(page.locator(".landing-light-stream")).toHaveCSS(
    "position",
    "fixed",
  );
  const supported = await page.evaluate(() =>
    Boolean(document.createElement("canvas").getContext("webgl2")),
  );
  if (!supported) return;
  await expect(
    page.getByRole("button", { name: "Pause visual effects" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/lenis/, { timeout: 15_000 });
  await page.mouse.wheel(0, 450);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(300);
  await page.locator("#daily-view").scrollIntoViewIfNeeded();
  await expect(page.locator(".landing-scene canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Pause visual effects" }).click();
  await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/lenis/);
  await expect(page.locator(".landing-stream-fallback")).toBeVisible();
  await page.getByRole("button", { name: "Resume visual effects" }).click();
  await expect(page.locator(".landing-scene canvas")).toHaveCount(1);
  await expect(page.locator("html")).toHaveClass(/lenis/);
  await page
    .locator("header")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/lenis/);
});

test("ribbon keeps painting motion when the page stays still", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto("/");
  const supported = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  });
  test.skip(
    !supported,
    "Renderer motion requires WebGL; fallback has separate coverage",
  );
  // The bounded intro precedes lazy shader startup. Observe both readiness
  // boundaries before testing idle animation; pixel/scroll assertions stay strict.
  await expect(page.getByRole("button", { name: "Run sample", exact: true })).toBeEnabled({ timeout: 8_000 });
  await expect(page.locator(".landing-loader")).toBeHidden();
  await expect(page.locator(".landing-scene")).toHaveAttribute(
    "data-scene-state",
    "running",
    { timeout: 15_000 },
  );
  // Observe beyond the stream reveal: a canvas alone does not prove idle flow.
  await page.waitForTimeout(3000);
  const canvas = page.locator(".landing-scene canvas");
  const first = await canvas.screenshot();
  await expect
    .poll(async () => first.equals(await canvas.screenshot()))
    .toBe(false);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("daily view changes clearly labelled sample counts and keeps the new sections readable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Preview day" }).selectOption("3");
  await expect(page.locator(".landing-daily__gauge")).toContainText("100%");
  await expect(page.locator(".landing-daily__gauge")).toContainText("10 of 10");
  await expect(page.locator(".landing-daily__approval")).toContainText("0");
  await expect(page.locator(".landing-daily__disclaimer")).toContainText(
    "not your workspace",
  );
  await page.setViewportSize({ width: 375, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Many apps. One clear pattern." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Real work. Clear starting points." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".landing-statement__plate")).toHaveCSS(
    "transform",
    "none",
  );
});

test("product tabs support arrow keys, Home and End with consistent panels", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run sample", exact: true })).toBeEnabled({ timeout: 8_000 });
  const build = page.getByRole("tab", { name: "Build visually" });
  await build.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Inspect every run" }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Every step tells a story.",
  );
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Connect securely" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Google workspace");
  await page.keyboard.press("Home");
  await expect(build).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Steam daily report");
});

test("run planner responds to keyboard input without implying paid entitlements", async ({ page }) => {
  await page.goto("/");
  // The intro deliberately makes main inert until readiness; focus only once
  // the same interactive boundary available to a visitor has opened.
  await expect(page.getByRole("button", { name: "Run sample", exact: true })).toBeEnabled({ timeout: 8_000 });
  const range = page.getByRole("slider", { name: "How many runs do you expect a month?" });
  await range.focus();
  await page.keyboard.press("Home");
  await expect(range).toHaveAttribute("aria-valuetext", "3,000 runs per month, Personal routines planning profile");
  await expect(page.locator(".landing-run-planner__result h3")).toHaveText("Personal routines");
  await page.keyboard.press("End");
  await expect(range).toHaveAttribute("aria-valuetext", "300,000 runs per month, Higher volume planning profile");
  await expect(page.locator(".landing-run-card.is-lit")).toContainText("Higher volume");
  await expect(page.locator(".landing-run-planner__note")).toContainText("not a capacity guarantee or a paid plan");
});

for (const width of [375, 768, 1440]) {
  test(`landing fits ${width}px and keeps its controls usable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Good work. On autopilot." }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (width === 375) {
      // Native summary remains operable before hydration.
      await page.locator(".landing-nav__mobile summary").click();
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).not.toBeVisible();
    }
    await page.locator("#faq").scrollIntoViewIfNeeded();
    await page
      .getByText("Where do my connection secrets live?", { exact: true })
      .click();
    await expect(
      page.getByText("Connections are encrypted server-side.", {
        exact: false,
      }),
    ).toBeVisible();
  });
}

test("no JavaScript still provides content, navigation, FAQ and sign-in links", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/");
  await expect(
    page.getByRole("heading", { name: "Good work. On autopilot." }),
  ).toBeVisible();
  await page.locator(".landing-nav__mobile summary").click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await page
    .getByText("Where do my connection secrets live?", { exact: true })
    .click();
  await expect(
    page.getByText("Connections are encrypted server-side.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run sample", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Start in Fluxora" }),
  ).toHaveAttribute("href", "/login");
  await context.close();
});
