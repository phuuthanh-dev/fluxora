import { expect, test } from "@playwright/test";

const pages = [
  { path: "/privacy", title: "Your data. Clear boundaries." },
  { path: "/terms", title: "Build with care. Stay in control." },
  { path: "/support", title: "Let’s get your workflow moving." },
];

for (const width of [375, 768, 1440]) {
  test(`public documents remain readable and navigable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const item of pages) {
      const response = await page.goto(item.path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(item.title);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://fluxora.io.vn${item.path}`);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Fluxora/);
      await expect(page.getByRole("navigation", { name: "Footer", exact: true }).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
      if (process.env.UI_CAPTURE) await page.screenshot({ path: info.outputPath(`${item.path.slice(1)}-${width}.png`), fullPage: true });
    }
  });
}

test("public routes expose only intended crawl metadata and working support paths", async ({ page, request }) => {
  const sitemap = await request.get("/sitemap.xml");
  const xml = await sitemap.text();
  expect(sitemap.status()).toBe(200);
  for (const route of ["/", ...pages.map(item => item.path)]) expect(xml).toContain(`<loc>https://fluxora.io.vn${route}</loc>`);
  expect(xml).not.toMatch(/dashboard|editor|login|register/);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /dashboard");
  expect(robots).toContain("Disallow: /register");
  expect(robots).toContain("Sitemap: https://fluxora.io.vn/sitemap.xml");
  const image = await request.get("/opengraph-image");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  const contact = await request.get("/contact", { maxRedirects: 0 });
  expect(contact.status()).toBe(308);
  expect(contact.headers().location).toBe("/support");
  const missing = await request.get("/missing-public-page");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("This path doesn’t lead anywhere.");
  await page.goto("/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByRole("link", { name: "Privacy policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("link", { name: "phuuthanh2003@gmail.com" }).first()).toHaveAttribute("href", "mailto:phuuthanh2003@gmail.com");
  for (const path of ["/dashboard", "/dashboard/connections", "/dashboard/executions", "/editor"]) {
    const html = await (await request.get(path)).text();
    expect(html).toMatch(/name="robots" content="noindex, nofollow"/);
  }
});

test("privacy, terms and support remain accessible without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const item of pages) {
    await page.goto(`http://localhost:3000${item.path}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(item.title);
  }
  await page.getByRole("navigation", { name: "Footer", exact: true }).getByRole("link", { name: "Privacy" }).click();
  await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Your choices" }).click();
  await expect(page).toHaveURL(/privacy#choices$/);
  await expect(page.locator("#choices")).toBeInViewport();
  await context.close();
});
