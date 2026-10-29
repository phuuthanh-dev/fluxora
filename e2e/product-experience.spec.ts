import { expect, test, type Page } from "@playwright/test";

async function register(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Workspace Review");
  await page.locator('input[autocomplete="email"]').fill(`product-experience-${Date.now()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').fill("local-product-test-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
}

test("guided connection fields preserve JSON, mask secrets, search saved accounts and reset workspace state", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await register(page);
  const originalWorkspace = await page.locator("#app-shell-workspace").inputValue();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(page.getByText("Your connections will appear here")).toBeVisible();
  await page.getByLabel("Provider", { exact: true }).selectOption("STEAM");
  await page.getByLabel("Connection name", { exact: true }).fill("Steam personal");
  await page.getByLabel("Steam Web API key", { exact: true }).fill("local-fixture-key");
  await expect(page.getByLabel("Steam Web API key", { exact: true })).toHaveAttribute("type", "password");
  await page.getByLabel("Steam ID", { exact: true }).fill("76561198000000000");
  await page.getByRole("button", { name: "Edit JSON", exact: true }).click();
  const json = page.getByLabel("Secret JSON", { exact: true });
  const payload = JSON.parse(await json.inputValue());
  expect(payload.steamId).toBe("76561198000000000");
  await json.fill(JSON.stringify({ ...payload, custom: { retained: true } }));
  await page.getByRole("button", { name: "Use fields", exact: true }).click();
  await page.getByLabel("Steam Web API key", { exact: true }).fill("local-replacement-key");
  await page.getByRole("button", { name: "Edit JSON", exact: true }).click();
  expect(JSON.parse(await json.inputValue())).toEqual({ ...payload, apiKey: "local-replacement-key", custom: { retained: true } });
  await json.fill("{");
  await expect(page.getByRole("button", { name: "Use fields", exact: true })).toBeDisabled();
  await json.fill(JSON.stringify({ ...payload, apiKey: "local-replacement-key" }));
  const saved = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/credentials"));
  await page.getByRole("button", { name: "Encrypt & save" }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.locator(".credential-card__info strong")).toHaveText("Steam personal");
  await page.reload();
  await expect(page.locator(".credential-card__info strong")).toHaveText("Steam personal");
  await expect(page.locator(".credential-form")).not.toBeVisible();
  await page.getByLabel("Search connections").fill("missing");
  await expect(page.getByText("No matching connections")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".credential-card")).toHaveCount(1);
  await page.getByRole("button", { name: "New connection", exact: true }).click();
  const toolbar = await page.locator(".credential-toolbar").boundingBox();
  const form = await page.getByRole("form", { name: "New connection", exact: true }).boundingBox();
  const cards = await page.locator(".credential-list").boundingBox();
  expect(form!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
  expect(form!.y + form!.height).toBeLessThan(cards!.y);
  await expect(page.getByLabel("Provider", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Provider", { exact: true })).toHaveCSS("padding-right", "40px");
  await expect(page.getByLabel("Provider", { exact: true })).toHaveCSS("background-position", "calc(100% - 12px) 50%");

  await page.getByLabel("Provider", { exact: true }).selectOption("SMTP");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByLabel("Transport").selectOption("465");
  await page.getByRole("button", { name: "Edit JSON", exact: true }).click();
  expect(JSON.parse(await json.inputValue()).port).toBe(465);
  await page.getByRole("button", { name: "Use fields", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.screenshot({ path: testInfo.outputPath(`connections-guided-${theme}.png`), fullPage: true });
  }
  const workspaceResponse = await page.request.post("http://localhost:3001/api/v1/workspaces", { data: { name: "Isolated workspace" } });
  expect(workspaceResponse.ok()).toBeTruthy();
  const { workspace } = await workspaceResponse.json();
  await page.goto(`/dashboard/connections?workspace=${workspace.id}`);
  await expect(page.getByText("Your connections will appear here")).toBeVisible();
  await expect(page.locator(".credential-card")).toHaveCount(0);
  await page.locator("#app-shell-workspace").selectOption(originalWorkspace);
  await expect(page.locator(".credential-card__info strong")).toHaveText("Steam personal");
  await expect(page.locator(".credential-form")).not.toBeVisible();
});

test("workflow list precedes creation, menus fully dismiss and dialogs restore focus", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await register(page);
  await page.getByRole("button", { name: "Use Steam template", exact: true }).click();
  await page.waitForURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Dashboard", exact: true }).first().click();
  await expect(page.locator(".workflow-card")).toHaveCount(1);
  const list = await page.locator(".dashboard-workflows").boundingBox();
  const create = await page.locator(".dashboard-create").boundingBox();
  expect(list!.y).toBeLessThan(create!.y);
  for (let i = 0; i < 3; i++) {
    await page.getByLabel("Account actions", { exact: true }).click();
    await expect(page.getByRole("menu", { name: "Account menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Account menu" })).toHaveCount(0);
    await expect(page.getByLabel("Account actions", { exact: true })).toBeFocused();
  }
  const actions = page.locator(".workflow-card summary");
  await actions.click();
  await page.getByRole("button", { name: /Rename/ }).click();
  await expect(page.getByRole("dialog", { name: "Rename workflow" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workflow-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(actions).toBeFocused();
});
