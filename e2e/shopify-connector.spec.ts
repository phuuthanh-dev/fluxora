import { expect, test } from "@playwright/test";

test("Shopify order filter clears the previous pagination cursor", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "shopify", type: "action.shopify.list-orders", position: { x: 400, y: 100 }, config: { credentialId: "shopify-1", orderName: "#1001", cursor: "old-cursor", limit: 10 } },
  ], edges: [] };
  const workflow = { id: "shopify-test", workspaceId: "workspace-1", name: "Shopify test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "shopify-1", provider: "SHOPIFY", label: "My Shopify" }] });
    if (path.endsWith("/workflows/shopify-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=shopify-test");
  await page.locator(".react-flow__node").filter({ hasText: "List orders" }).click();
  await expect(page.getByLabel("Shopify connection")).toHaveValue("shopify-1");
  await page.getByText("Advanced pagination", { exact: true }).click();
  const cursor = page.getByLabel("Next cursor (optional)");
  await expect(cursor).toHaveValue("old-cursor");
  await page.getByLabel("Order number (optional)").fill("#1002");
  await expect(cursor).toHaveValue("");
});
