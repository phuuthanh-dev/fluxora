import { expect, test, type Locator, type Page } from "@playwright/test";

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

async function readable(locator: Locator, minimum = 4.5) {
  const contrast = await locator.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d")!;
    const rgb = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const luminance = (channels: number[]) => channels.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const foreground = rgb(getComputedStyle(element).color);
    let current: Element | null = element;
    let background = [255, 255, 255, 255];
    while (current) {
      const color = rgb(getComputedStyle(current).backgroundColor);
      if (color[3] === 255) { background = color; break; }
      current = current.parentElement;
    }
    const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
    return (values[1] + .05) / (values[0] + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(minimum);
}

async function register(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("UI Review");
  await page.locator('input[autocomplete="email"]').fill(`ui-core-${Date.now()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').fill("local-ui-test-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Use Steam template", exact: true })).toBeVisible();
}

test("landing header stays compact, inset and operable after scrolling and on mobile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const nav = page.locator(".landing-nav");
  expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(68);
  expect((await nav.boundingBox())!.x).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 2200));
  await expect.poll(async () => (await nav.boundingBox())!.y).toBe(12);
  await page.locator(".landing-nav__sign-in").focus();
  await expect(page.locator(".landing-nav__sign-in")).toBeFocused();
  await noHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Navigation menu", { exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Navigation menu", { exact: true })).toBeFocused();
  await noHorizontalOverflow(page);
});

test("login shares the brand and readable fields in both themes at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Fluxora home" })).toHaveAttribute("href", "/");
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await readable(page.getByRole("button", { name: "Sign in", exact: true }));
    await readable(page.locator(".auth-field .ui-field__label").first());
    await page.locator('input[type="email"]').focus();
    await expect(page.locator('input[type="email"]')).toHaveCSS("outline-style", "solid");
    await noHorizontalOverflow(page);
  }
});

test("workspace routes share shell, theme-aware overlays and compact editor controls", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await register(page);
  const templateCreated = page.waitForResponse(response =>
    response.request().method() === "POST" && response.url().includes("/workflows"),
  );
  await page.getByRole("button", { name: "Use Steam template", exact: true }).click();
  expect((await templateCreated).ok()).toBeTruthy();
  // Next's development route can still be compiling after the POST succeeds.
  // Use the same bounded navigation budget as the editor onboarding flow.
  await page.waitForURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/editor\?workflow=/);
  const editorUrl = page.url();
  const workspaceId = await page.locator("#app-shell-workspace").inputValue();
  const routes = ["/dashboard", "/dashboard/connections", "/dashboard/executions"];
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    for (const route of routes) {
      await page.goto(`${route}?workspace=${workspaceId}`);
      await expect(page.locator(".ui-page-header h1")).toBeVisible();
      await expect(page.locator(".brand-lockup")).toHaveCount(1);
      expect((await page.locator(".app-shell-header").boundingBox())!.height).toBeLessThanOrEqual(70);
      await readable(page.locator(".app-shell-nav-link.is-active"));
      await page.getByLabel("Account actions", { exact: true }).click();
      await readable(page.getByRole("button", { name: "Sign out" }));
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("Account actions", { exact: true })).toBeFocused();
      if (route.endsWith("connections")) {
        await expect(page.locator(".credential-form")).toBeVisible();
        await readable(page.locator(".credential-form__hint"));
        await readable(page.locator(".credential-form__oauth-link"));
        await expect(page.locator(".credential-panel")).toHaveCSS("background-color", theme === "light" ? "rgb(255, 254, 249)" : "rgb(17, 23, 18)");
      }
      await noHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`${route.split("/").at(-1)}-${theme}.png`), fullPage: true });
    }
    await page.goto(editorUrl);
    await expect(page.locator(".workflow-node").first()).toBeVisible();
    await readable(page.getByRole("button", { name: "Run test", exact: true }));
    await page.getByLabel("Manage actions").click();
    await page.getByRole("button", { name: "Credentials", exact: true }).click();
    await expect(page.locator(".credential-panel")).toHaveCSS("background-color", theme === "light" ? "rgb(255, 254, 249)" : "rgb(17, 23, 18)");
    await readable(page.locator(".credential-panel__directory-link"));
    await readable(page.locator(".credential-form__hint"));
    await page.getByRole("button", { name: "Close credential manager" }).click();
    await page.setViewportSize({ width: 960, height: 900 });
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath(`editor-${theme}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of routes) {
    await page.goto(`${route}?workspace=${workspaceId}`);
    await expect(page.locator(".ui-page-header h1")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`${route.split("/").at(-1)}-mobile.png`), fullPage: true });
  }
});
