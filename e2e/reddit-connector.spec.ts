import { expect, test } from "@playwright/test";

test("Reddit setup provides a connection, public community and sort choices", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "reddit", type: "action.reddit.list-posts", position: { x: 400, y: 100 }, config: { credentialId: "reddit-1", subreddit: "technology", sort: "new", limit: 20 } },
  ], edges: [] };
  const workflow = { id: "reddit-test", workspaceId: "workspace-1", name: "Reddit test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "reddit-1", provider: "REDDIT", label: "My Reddit" }] });
    if (path.endsWith("/workflows/reddit-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=reddit-test");
  await page.locator(".react-flow__node").filter({ hasText: "List posts" }).click();
  await expect(page.getByLabel("Reddit connection")).toHaveValue("reddit-1");
  await expect(page.getByLabel("Public community (e.g. technology)")).toHaveValue("technology");
  await expect(page.getByLabel("Sort posts")).toHaveValue("new");
  await page.getByLabel("Sort posts").selectOption("hot");
});
