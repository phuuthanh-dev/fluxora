import { expect, test } from "@playwright/test";

test("login and register share readable layouts across themes and viewport sizes", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/auth/providers", route => route.fulfill({ json: { google: true, github: true } }));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const mode of ["login", "register"]) {
      await page.goto(`/${mode}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(mode === "login" ? "Sign in to your workspace" : "Create your workspace");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.getByRole("button", { name: "Google", exact: true })).toBeEnabled();
      for (const theme of ["light", "dark"]) {
        if (await page.locator("html").getAttribute("data-theme") !== theme) {
          await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
        }
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".auth-page")).toHaveCSS("background-color", theme === "dark" ? "rgb(11, 16, 12)" : "rgb(245, 247, 241)");
        await expect(page.locator(".auth-oauth-button").first()).toHaveCSS("color", theme === "dark" ? "rgb(243, 246, 236)" : "rgb(16, 20, 16)");
        await page.locator('input[type="email"]').focus();
        await expect(page.locator('input[type="email"]')).toHaveCSS("outline-style", "solid");
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await expect(page.locator("#auth-password")).toHaveAttribute("type", "password");
        // Allow the compositor to paint the new theme before recording evidence.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await page.screenshot({ path: info.outputPath(`${mode}-${theme}-${width}.png`), fullPage: true });
      }
    }
  }
});

test("auth route switching, password visibility and pending/error feedback remain operable", async ({ page }) => {
  await page.route("**/auth/providers", route => route.fulfill({ json: { google: false, github: false } }));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Google.*Unavailable/ })).toBeDisabled();
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.locator("#auth-password")).toHaveAttribute("minlength", "12");
  await page.locator("#auth-password").fill("local-visible-password");
  await page.getByRole("button", { name: "Show password" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#auth-password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.locator("#auth-password")).toHaveAttribute("type", "password");
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("#auth-password")).toHaveValue("");
  await expect(page.locator("#auth-password")).toHaveAttribute("autocomplete", "current-password");

  let release!: () => void;
  let posts = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/auth/login", async route => {
    posts += 1;
    await held;
    await route.fulfill({ status: 401, json: { message: "Email or password is incorrect." } });
  });
  await page.getByLabel("Email", { exact: true }).fill("auth-feedback@example.test");
  await page.getByLabel("Password", { exact: true }).fill("local-wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create an account" })).toBeDisabled();
  await expect(page.locator(".auth-card form")).toHaveAttribute("aria-busy", "true");
  await page.locator(".auth-card form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  release();
  await expect(page.locator(".auth-card").getByRole("alert")).toHaveText("Email or password is incorrect.");
  expect(posts).toBe(1);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("auth-feedback@example.test");
});

test("social buttons retain their provider start routes without contacting providers", async ({ page }) => {
  await page.route("**/auth/providers", route => route.fulfill({ json: { google: true, github: true } }));
  for (const provider of ["google", "github"]) {
    const path = `/api/v1/auth/${provider}/start`;
    // Fulfil the local API navigation; no OAuth redirect or real provider request.
    await page.route(`**${path}`, route => route.fulfill({ contentType: "text/html", body: "<p>Local OAuth routing fixture</p>" }));
    await page.goto("/login");
    const navigated = page.waitForRequest(request => new URL(request.url()).pathname === path);
    await page.getByRole("button", { name: provider === "google" ? "Google" : "GitHub", exact: true }).click();
    await navigated;
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});
