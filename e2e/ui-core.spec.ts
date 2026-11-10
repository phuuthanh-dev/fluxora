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
    return {
      ratio: (values[1] + .05) / (values[0] + .05), foreground, background,
      theme: document.documentElement.dataset.theme,
      transition: getComputedStyle(element).transition,
      surface: current?.className,
      panelToken: current ? getComputedStyle(current).getPropertyValue("--panel") : "",
    };
  });
  expect(contrast.ratio, JSON.stringify(contrast)).toBeGreaterThanOrEqual(minimum);
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
      await expect(page.getByRole("menu", { name: "Account menu" })).toHaveCount(0);
      if (route === "/dashboard") {
        const workflows = await page.locator(".dashboard-workflows").boundingBox();
        const operations = await page.locator(".dashboard-operations").boundingBox();
        expect(workflows!.y + workflows!.height).toBeLessThan(operations!.y);
        await expect(page.locator(".workflow-card__node-icon")).toHaveCount(3);
      }
      if (route.endsWith("connections")) {
        await expect(page.locator(".credential-form")).toBeVisible();
        await readable(page.locator(".credential-form__hint"));
        await readable(page.locator(".credential-form__oauth-link"));
        await expect(page.locator(".credential-panel")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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
    const manager = page.getByRole("dialog", { name: "Credential manager" });
    const toolbar = await manager.locator(".credential-toolbar").boundingBox();
    const form = await manager.locator(".credential-form").boundingBox();
    expect(form!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
    await expect(manager.getByLabel("Provider", { exact: true })).toHaveCSS("padding-right", "40px");
    await page.screenshot({ path: testInfo.outputPath(`connections-panel-${theme}.png`) });
    await page.getByRole("button", { name: "Close credential manager" }).click();
    await page.setViewportSize({ width: 960, height: 900 });
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".workflow-node").filter({ hasText: "Get account snapshot" }).click();
    await expect(page.locator(".inspector__identity")).toBeVisible();
    await expect(page.locator(".inspector__heading h2")).toHaveCSS("font-size", "16px");
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


for (const theme of ["light", "dark"] as const) {
  test(`connection directory and settings drawer stay usable in ${theme}`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem("fluxora-theme", value), theme);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
      if (path.endsWith("/auth/me")) return send({ user: { id: "ui-owner", displayName: "UI Review", email: "ui@example.test", avatarColor: "lime" } });
      if (path.endsWith("/auth/identities")) return send({ identities: [] });
      if (path.endsWith("/auth/providers")) return send({ google: false, github: false, steam: false });
      if (path.endsWith("/admin/access")) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Forbidden" }) });
      if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "ui-workspace", name: "Design review workspace", slug: "review", role: "OWNER" }] });
      if (path.endsWith("/credentials")) return send({ credentials: [
        { id: "calendar", provider: "GOOGLE_CALENDAR", label: "Google Calendar OAuth · design-review@example.test · 0123456789abcdef", isManaged: true },
        { id: "slack", provider: "SLACK_OAUTH", label: "Slack · Design review", isManaged: true },
        { id: "notion", provider: "NOTION", label: "Notion · Design review", isManaged: true },
        { id: "gitlab", provider: "GITLAB", label: "GitLab sandbox", isManaged: false },
        { id: "steam", provider: "STEAM", label: "Steam account", isManaged: false },
      ] });
      return send({});
    });
    await page.goto("/dashboard/connections?workspace=ui-workspace");
    const calendar = page.locator('[data-credential-id="calendar"]');
    const slack = page.locator('[data-credential-id="slack"]');
    await expect(calendar).toBeVisible();
    await expect(calendar.getByRole("button", { name: "Reconnect Google" })).toBeHidden();
    await expect(slack.getByRole("button", { name: "Enable Slack triggers" })).toBeHidden();
    await readable(calendar.locator(".credential-card__provider"));
    await readable(calendar.locator(".credential-card__info strong"));
    expect((await calendar.boundingBox())!.height).toBeLessThan(110);
    await page.screenshot({ path: testInfo.outputPath(`saved-connections-${theme}.png`), fullPage: true });
    await page.getByRole("button", { name: "New connection", exact: true }).click();
    const form = await page.locator(".credential-form").boundingBox();
    const list = await page.locator(".credential-list").boundingBox();
    const toolbar = await page.locator(".credential-toolbar").boundingBox();
    expect(form!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
    expect(form!.y + form!.height).toBeLessThanOrEqual(list!.y);
    await page.getByRole("button", { name: "Hide new connection", exact: true }).click();
    // Filtering must affect the directory without changing any saved connection.
    await page.getByRole("button", { name: "OAuth 3", exact: true }).click();
    await expect(page.locator(".credential-card")).toHaveCount(3);
    await page.getByRole("button", { name: "All connections 5", exact: true }).click();
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await calendar.getByRole("button", { name: /^Open / }).click();
      const settings = page.getByRole("dialog", { name: "Connection settings", exact: true });
      await expect(settings.getByRole("button", { name: "Reconnect Google" })).toBeVisible();
      await expect(settings.getByRole("button", { name: "Close connection settings" })).toBeFocused();
      await readable(settings.locator(".credential-card__oauth-text"));
      await page.keyboard.press("Escape");
      await expect(calendar.getByRole("button", { name: /^Open / })).toBeFocused();
      await slack.getByRole("button", { name: /^Open / }).click();
      await expect(settings.getByRole("button", { name: "Reconnect Slack" })).toBeVisible();
      await expect(settings.getByRole("button", { name: "Enable Slack triggers" })).toBeVisible();
      await settings.getByRole("button", { name: "Close connection settings", exact: true }).click();
      await page.locator('[data-credential-id="notion"]').getByRole("button", { name: /^Open / }).click();
      await expect(settings.getByRole("button", { name: "Reconnect Notion" })).toBeVisible();
      expect(await settings.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await noHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`connection-settings-${theme}-${width}.png`) });
      await settings.getByRole("button", { name: "Close connection settings", exact: true }).click();
      await calendar.getByLabel(/Actions for/).click();
      await expect(calendar.getByRole("button", { name: /Delete Google Calendar/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(calendar.getByLabel(/Actions for/)).toBeFocused();
    }
    // Manual actions use the same drawer; replacement values start empty.
    const gitlab = page.locator('[data-credential-id="gitlab"]');
    await gitlab.getByRole("button", { name: "Open GitLab sandbox", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Connection settings", exact: true });
    await settings.getByRole("button", { name: "Rotate secret", exact: true }).click();
    await expect(settings.getByLabel("GitLab personal access token", { exact: true })).toHaveValue("");
    await settings.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(settings).toHaveCount(0);
  });
}
