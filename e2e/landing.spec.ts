import { expect, test } from "@playwright/test";

test("public landing explains Fluxora and keeps authentication on an explicit route", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Build the work that keeps moving." })).toBeVisible();
  await expect(page.getByText("WORKFLOW AUTOMATION, MADE LEGIBLE")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start in Fluxora" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/login");
  await expect(page.getByText("WORKFLOW LIFECYCLE")).toBeVisible();
  await expect(page.locator(".landing-workflow-node")).toHaveCount(3);

  await page.getByRole("link", { name: "Start in Fluxora" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
});

test("landing remains readable without decorative motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator(".landing-page")).toHaveCSS("background-color", "rgb(5, 7, 6)");
  await expect(page.getByText("Draft safely. Publish deliberately. Run live only when you are ready.")).toBeVisible();
  await expect(page.locator(".landing-workflow-window")).toHaveCSS("transform", "none");
  await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
});

test("landing falls back to its semantic layout when WebGL is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(contextId, ...args) {
      if (contextId === "webgl" || contextId === "webgl2") return null;
      return originalGetContext.call(this, contextId, ...args);
    };
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Build the work that keeps moving." })).toBeVisible();
  await expect(page.locator(".landing-scene--hero")).toHaveAttribute("data-scene-state", "fallback");
  await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
});
