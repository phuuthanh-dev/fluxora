import { expect, test } from "@playwright/test";

test("Uptime Kuma setup explains the required header and pins registration", async ({ page }) => {
  const graph = { nodes: [{ id: "kuma", type: "trigger.uptime-kuma.alert", position: { x: 100, y: 100 }, config: { path: "kuma-alert", secretRequired: true } }], edges: [] };
  const workflow = { id: "kuma-test", workspaceId: "workspace-1", name: "Uptime Kuma", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: { id: "published", version: 1, graph } };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/kuma-test")) return send({ workflow });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") return send({ endpoint: null });
      expect(route.request().postDataJSON().secretRequired).toBe(true);
      return send({ endpoint: { id: "endpoint", path: "kuma-alert", secret: "synthetic-secret", workflowVersionId: "published", createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=kuma-test");
  await page.locator(".react-flow__node").filter({ hasText: "Monitor alert" }).click();
  await page.getByRole("button", { name: "Configure webhook" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByText(/Additional Headers/)).toBeVisible();
  await expect(panel.getByText('{"x-workflow-secret":"YOUR_SECRET"}', { exact: true })).toBeVisible();
  await expect(panel.getByText(/Test button checks the connection without starting a workflow run/)).toBeVisible();
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
  await panel.getByRole("button", { name: "Create registration" }).click();
  await expect(panel.getByText("synthetic-secret")).toBeVisible();
});
