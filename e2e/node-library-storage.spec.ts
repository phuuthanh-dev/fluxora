import { expect, test } from "@playwright/test";

test("node library remains usable when preference storage rejects writes", async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("fluxora.node-library.")) throw new DOMException("Storage unavailable", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  const graph = { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} }], edges: [] };
  const workflow = { id: "storage-test", workspaceId: "workspace-1", name: "Storage test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/storage-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=storage-test");
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await page.getByRole("button", { name: /Open Telegram/ }).click();
  await page.getByRole("button", { name: "Add Send message to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove Send message from favorites" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Telegram: Send message/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await page.getByRole("button", { name: "All apps" }).click();
  await page.getByRole("button", { name: "Collapse Communication" }).click();
  await expect(page.getByRole("button", { name: "Expand Communication" })).toBeVisible();
});
