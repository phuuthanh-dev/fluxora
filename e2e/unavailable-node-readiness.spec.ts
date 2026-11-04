import { expect, test } from "@playwright/test";

test("legacy unavailable nodes explain why activation is blocked", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "future", type: "action.instagram", position: { x: 400, y: 100 }, config: {} },
  ], edges: [] };
  const workflow = { id: "planned-test", workspaceId: "workspace-1", name: "Legacy workflow", description: null, isActive: false, draft: { id: "draft", version: 2, graph }, published: { id: "published", version: 1, graph } };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "owner", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [] });
    if (url.pathname.endsWith("/live-readiness")) return send({ readiness: { ready: false, requirements: [], unavailableNodes: [{ nodeId: "future", type: "action.instagram" }] } });
    if (url.pathname.endsWith("/workflows/planned-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=planned-test");
  await page.getByRole("button", { name: "Go live" }).click();
  const dialog = page.getByRole("dialog", { name: "Activate workflow" });
  await expect(dialog.getByText("Remove unavailable nodes and publish a new version before going live.")).toBeVisible();
  await expect(dialog.getByText("action.instagram")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Activate workflow" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Open credentials" })).toHaveCount(0);
});
