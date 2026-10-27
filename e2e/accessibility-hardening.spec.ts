import { expect, test, type Locator, type Page } from "@playwright/test";

async function signUpAndOpenEditor(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Accessibility Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
}

async function expectInsideViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

test("core editor actions remain visible and focusable at 125 and 150 percent zoom equivalents", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signUpAndOpenEditor(page, `a11y-zoom-${Date.now()}@example.test`);

  for (const width of [1152, 960]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((nextTheme) => {
        document.documentElement.dataset.theme = nextTheme;
        window.localStorage.setItem("fluxora-theme", nextTheme);
      }, theme);

      for (const name of ["Save draft", "Publish", "Run test", "Go live"]) {
        const action = page.getByRole("button", { name, exact: true });
        await expect(action).toBeVisible();
        await expectInsideViewport(action, page);
      }

      await page.getByRole("button", { name: "Save draft", exact: true }).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      const runTest = page.getByRole("button", { name: "Run test", exact: true });
      await expect(runTest).toBeFocused();
      expect(await runTest.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
      await expect(runTest).toHaveCSS("outline-style", "solid");
      expect(await page.locator(".editor-header").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  }
});

test("reduced motion removes non-essential editor animation and transforms", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUpAndOpenEditor(page, `a11y-motion-${Date.now()}@example.test`);

  const edgePath = page.locator(".react-flow__edge.animated path").first();
  await expect(edgePath).toBeAttached();
  await expect(edgePath).toHaveCSS("animation-name", "none");
  await expect(page.locator(".workflow-node").first()).toHaveCSS("transition-property", "none");

  await page.getByRole("button", { name: "Collapse node palette" }).click();
  const addNode = page.getByRole("button", { name: "Add node" });
  await addNode.hover();
  const transitionSeconds = await addNode.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(transitionSeconds).toBeLessThanOrEqual(0.00001);
});
