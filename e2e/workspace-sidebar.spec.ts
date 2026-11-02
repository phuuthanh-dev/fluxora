import { expect, test, type Page } from "@playwright/test";

async function register(page: Page) {
  await page.goto("/register");
  await page.locator('input[autocomplete="name"]').fill("Sidebar Preview");
  await page.locator('input[autocomplete="email"]').fill(`sidebar-${Date.now()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').fill("sidebar-local-test-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("#app-shell-workspace option")).toHaveCount(1);
}

test("sidebar reverses smoothly, preserves workspace and preference, and searches real routes", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await register(page);
  const sidebar = page.getByRole("complementary", { name: "Workspace sidebar" });
  const workspace = await page.locator("#app-shell-workspace").inputValue();
  await expect(sidebar.getByRole("button", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: info.outputPath("sidebar-expanded-light.png") });

  const widths = await sidebar.evaluate(async (element) => {
    (element.querySelector('[aria-label="Collapse sidebar"]') as HTMLButtonElement).click();
    const values = [element.getBoundingClientRect().width];
    const start = performance.now();
    while (performance.now() - start < 450) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      values.push(element.getBoundingClientRect().width);
    }
    return values;
  });
  expect(widths.some(width => width > 80 && width < 244)).toBe(true);
  await expect(sidebar).toHaveCSS("width", "76px");
  const connections = sidebar.getByRole("button", { name: "Connections", exact: true });
  await connections.focus();
  await expect(connections.locator(".workspace-sidebar__link-label")).toBeVisible();
  await connections.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/dashboard/connections\\?workspace=${workspace}`));
  await expect(sidebar).toHaveCSS("width", "76px");
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "76px");
  await expect(page.locator("#app-shell-workspace")).toHaveValue(workspace);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({ path: info.outputPath("sidebar-compact-dark.png") });

  await page.getByRole("button", { name: "Search navigation", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search navigation" });
  await expect(search).toBeFocused();
  await search.fill("missing-page");
  await expect(sidebar.getByRole("status")).toContainText("No pages found");
  await search.press("Escape");
  await search.fill("history");
  await expect(sidebar.getByRole("button", { name: "Dashboard", exact: true })).toHaveCount(0);
  await sidebar.getByRole("button", { name: "Executions", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/executions\\?workspace=${workspace}`));
  await page.screenshot({ path: info.outputPath("sidebar-expanded-dark.png") });
  await expect(sidebar).toHaveCSS("width", "248px");
  await sidebar.evaluate(async (element) => {
    (element.querySelector('[aria-label="Collapse sidebar"]') as HTMLButtonElement).click();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    (element.querySelector('[aria-label="Expand sidebar"]') as HTMLButtonElement).click();
  });
  await expect(sidebar).toHaveCSS("width", "248px");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(sidebar).toHaveCSS("width", "76px");
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await expect(sidebar).toHaveCSS("width", "248px");
});

test("mobile navigation traps/restores focus and works when storage is unavailable", async ({ page }, info) => {
  await register(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage unavailable", "SecurityError"); };
  });
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  await opener.click();
  const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
  const close = drawer.getByRole("button", { name: "Close navigation", exact: true });
  await expect(close).toBeFocused();
  await drawer.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await drawer.getByLabel("Account actions", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("menu", { name: "Account menu" })).toHaveCount(0);
  await drawer.getByRole("textbox", { name: "Search navigation" }).fill("history");
  await page.keyboard.press("Escape");
  await expect(drawer.getByRole("textbox", { name: "Search navigation" })).toHaveValue("");
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("Account actions", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(drawer.getByRole("button", { name: "Fluxora home", exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath("sidebar-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await drawer.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/connections\?workspace=/);
  await expect(drawer).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
