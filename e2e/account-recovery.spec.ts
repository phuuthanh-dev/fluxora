import { expect, test, request as playwrightRequest } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";

const api = "http://localhost:3001/api/v1";

test("account settings persist a profile, revoke another session and change the password", async ({ page }) => {
  const email = `account-${randomUUID()}@example.test`;
  const password = "synthetic-account-original";
  const next = "synthetic-account-updated";
  const registered = await page.request.post(`${api}/auth/register`, { data: { email, password, displayName: "Account fixture" } });
  expect(registered.ok()).toBeTruthy();
  const peer = await playwrightRequest.newContext();
  try {
    expect((await peer.post(`${api}/auth/login`, { data: { email, password } })).ok()).toBeTruthy();
    await page.goto("/settings/account");
    await expect(page.getByRole("heading", { name: "Your account", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveValue(email);
    await page.getByLabel("Display name").fill("Updated account fixture");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText("Your profile has been updated.");
    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue("Updated account fixture");
    await page.getByRole("button", { name: "Sign out other sessions" }).click();
    await expect(page.locator(".account-session-list li")).toHaveCount(1);
    expect((await peer.get(`${api}/auth/me`)).status()).toBe(401);
    await page.getByLabel("Current password", { exact: true }).fill("incorrect-current-password");
    await page.getByLabel("New password", { exact: true }).fill(next);
    await page.getByLabel("Confirm new password", { exact: true }).fill(next);
    await page.getByRole("button", { name: "Update password & sign out" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Your current password is incorrect.");
    await page.getByLabel("Current password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Update password & sign out" }).click();
    await expect(page).toHaveURL(/\/login\?passwordChanged=1/);
    await expect(page.locator(".account-notice")).toContainText("Password updated");
    expect((await page.request.get(`${api}/auth/me`)).status()).toBe(401);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(next);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByLabel("Account actions").click();
    await page.getByRole("button", { name: "Account settings" }).click();
    await expect(page).toHaveURL(/\/settings\/account/);
  } finally { await peer.dispose(); }
});

test("account settings and recovery remain readable in both themes on desktop and mobile", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const user = { id: "fixture", email: "owner@example.test", displayName: "Alex Morgan", avatarColor: "lime", hasPassword: true };
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/v1/auth/account": { user }, "/api/v1/auth/me": { user },
      "/api/v1/workspaces": { workspaces: [{ id: "space", name: "Personal workspace", slug: "personal", role: "OWNER" }] },
      "/api/v1/auth/identities": { identities: [{ provider: "GOOGLE" }, { provider: "STEAM" }] },
      "/api/v1/auth/providers": { google: true, github: true, steam: true },
      "/api/v1/auth/password/recovery": { available: true },
      "/api/v1/auth/account/sessions": { sessions: [{ id: "current", current: true, createdAt: "2026-10-30T00:00:00.000Z", expiresAt: "2026-11-06T00:00:00.000Z" }, { id: "other", current: false, createdAt: "2026-10-29T00:00:00.000Z", expiresAt: "2026-11-05T00:00:00.000Z" }] },
    };
    return route.fulfill({ json: data[path] ?? {} });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of ["/settings/account", "/forgot-password", `/reset-password#token=${randomBytes(32).toString("base64url")}`]) {
      await page.goto(route);
      await expect(page.locator("input").first()).toBeVisible();
      for (const theme of ["light", "dark"]) {
        if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await page.locator("input:not([readonly])").first().focus();
        await expect(page.locator("input:not([readonly])").first()).toHaveCSS("outline-style", "solid");
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await page.screenshot({ path: info.outputPath(`${route.split("#")[0]!.replaceAll("/", "-")}-${theme}-${width}.png`), fullPage: true });
      }
    }
  }
});

test("recovery shows unavailable, pending, generic success and invalid-link feedback without delivering mail", async ({ page }) => {
  await page.route("**/auth/password/recovery", route => route.fulfill({ json: { available: false } }));
  await page.goto("/forgot-password");
  await expect(page.locator("main").getByRole("alert")).toContainText("currently unavailable");
  await expect(page.getByRole("button", { name: "Send reset link" })).toHaveCount(0);
  await page.unroute("**/auth/password/recovery");
  await page.route("**/auth/password/recovery", route => route.fulfill({ json: { available: true } }));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route("**/auth/password/forgot", async route => { requests++; await held; await route.fulfill({ status: 202, json: { message: "If an account matches that email, a reset link will arrive shortly." } }); });
  await page.reload();
  await page.getByLabel("Email", { exact: true }).fill("absent@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("button", { name: "Please wait…" })).toBeDisabled();
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  release();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("If an account matches");
  expect(requests).toBe(1);

  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Request a fresh link" })).toBeVisible();
  const token = randomBytes(32).toString("base64url");
  const navigations: string[] = [];
  page.on("request", req => { if (req.isNavigationRequest()) navigations.push(req.url()); });
  await page.goto(`/reset-password#token=${token}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password", { exact: true }).fill("synthetic-new-password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("synthetic-other-password");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("The passwords do not match.");
  await page.getByLabel("Confirm new password", { exact: true }).fill("synthetic-new-password");
  await page.route("**/auth/password/reset", route => route.fulfill({ status: 400, json: { code: "RESET_LINK_INVALID", message: "Expired" } }));
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("heading", { name: "Request a fresh link" })).toBeVisible();
  expect(navigations.some(url => url.includes(token))).toBe(false);
  expect(await page.evaluate(value => Object.values(localStorage).some(stored => stored.includes(value)), token)).toBe(false);
});

test("a successful reset requires a fresh sign-in and never retains the token in the URL", async ({ page }) => {
  await page.route("**/auth/password/reset", route => route.fulfill({ status: 204 }));
  await page.goto(`/reset-password#token=${randomBytes(32).toString("base64url")}`);
  await page.getByLabel("New password", { exact: true }).fill("synthetic-new-password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("synthetic-new-password");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("heading", { name: "Your password is updated" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
  await expect(page).toHaveURL(/\/reset-password$/);
});
