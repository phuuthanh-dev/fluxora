import { expect, test } from "@playwright/test";

async function ready(page: import("@playwright/test").Page) {
  await expect(page.locator(".landing-loader")).toBeHidden({ timeout: 8_000 });
  await expect(page.getByRole("button", { name: "Run sample", exact: true })).toBeEnabled({
    timeout: 8_000,
  });
}

test("the intro owns the first paint instead of flashing the static landing", async ({ page }) => {
  await page.goto("/", { waitUntil: "commit" });
  const loader = page.locator(".landing-loader");
  await expect(loader).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip intro" })).toBeVisible();
});

test("navigation becomes a frosted plate only after leaving the hero top", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await ready(page);
  const nav = page.locator(".landing-nav");
  await expect(nav).toHaveAttribute("data-scrolled", "false");
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: "instant" }));
  await expect(nav).toHaveAttribute("data-scrolled", "true");
  expect((await nav.boundingBox())!.y).toBe(12);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(nav).toHaveAttribute("data-scrolled", "false");
});

test("Product keeps a dark reading surface when the lime stream passes beneath it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".landing-loader")).toBeHidden();
  const product = page.locator("#workspace-preview");
  await product.scrollIntoViewIfNeeded();
  await expect(product.locator("h2")).toHaveCSS("color", "rgb(255, 255, 255)");
  const surface = await product.evaluate((element) => {
    const veil = getComputedStyle(element, "::before");
    return {
      image: veil.backgroundImage,
      zIndex: veil.zIndex,
      isolation: getComputedStyle(element).isolation,
    };
  });
  expect(surface.image).toContain("radial-gradient");
  expect(surface.image).not.toContain("product-accent.png");
  expect(surface.zIndex).toBe("-1");
  expect(surface.isolation).toBe("isolate");
});

test("fine pointers get bounded landing depth and a cursor ring without affecting reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await ready(page);
  const demo = page.locator(".landing-demo");
  const box = (await demo.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.3);
  await expect(demo).toHaveAttribute("data-pointer-depth", "active");
  await expect(page.locator(".landing-cursor")).toHaveAttribute("data-interactive", "false");
  const signIn = page.locator(".landing-nav__sign-in");
  const signInBox = (await signIn.boundingBox())!;
  await page.mouse.move(signInBox.x + signInBox.width / 2, signInBox.y + signInBox.height / 2);
  await expect(page.locator(".landing-cursor")).toHaveAttribute("data-interactive", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".landing-cursor")).toHaveCSS("display", "none");
  await expect(demo).not.toHaveAttribute("data-pointer-depth", "active");
});
