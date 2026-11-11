import { expect, test } from "@playwright/test";

test("RSS trigger explains a checkpoint gap and confirms an explicit reset", async ({ page }) => {
  const graph = { nodes: [{ id: "rss", type: "trigger.rss.new-item", position: { x: 100, y: 100 }, config: { url: "https://example.test/feed?lang=vi", pollMinutes: "5" } }], edges: [] };
  const workflow = { id: "rss-test", workspaceId: "workspace-1", name: "RSS trigger", description: null, isActive: false, draft: { id: "draft", version: 2, graph }, published: { id: "published", version: 1, graph } };
  let resets = 0;
  let errorCode = "RSS_SNAPSHOT_GAP";
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/rss-test")) return send({ workflow });
    if (path.endsWith("/live-readiness")) return send({ readiness: { ready: true, requirements: [], unavailableNodes: [] } });
    if (path.endsWith("/rss-trigger-status")) return send({ active: false, checkpoints: [{ nodeId: "rss", state: "ERROR", lastErrorCode: errorCode }] });
    if (path.endsWith("/rss-trigger-reset")) {
      expect(route.request().postDataJSON()).toEqual({ confirmDataGap: true });
      resets++;
      return send({ success: true });
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=rss-test");
  await page.getByRole("button", { name: "Go live" }).click();
  await expect(page.getByRole("dialog", { name: "Activate workflow" })).toContainText("The first activation records the current RSS feed");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByTestId("rf__node-rss").click();
  await expect(page.getByLabel("Public feed URL")).toHaveValue("https://example.test/feed?lang=vi");
  await expect(page.getByLabel("Check for new items")).toHaveValue("5");
  await expect(page.getByText(/feed no longer overlaps/)).toBeVisible();
  await page.getByRole("button", { name: "Reset checkpoint…" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset RSS checkpoint" });
  await expect(dialog).toContainText("may be missed");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(resets).toBe(0);
  await page.getByRole("button", { name: "Reset checkpoint…" }).click();
  await page.getByRole("dialog", { name: "Reset RSS checkpoint" }).getByRole("button", { name: "Reset checkpoint", exact: true }).click();
  await expect.poll(() => resets).toBe(1);
  errorCode = "RSS_NOT_READY";
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByText(/A required connection is unavailable/)).toContainText("saved checkpoint will be retained");
});

test("Reddit access changes are explained without mislabeling other RSS hosts", async ({ page }) => {
  const graph = { nodes: [
    { id: "rss", type: "trigger.rss.new-item", position: { x: 100, y: 100 }, config: { url: "https://example.test/feed", pollMinutes: "5" } },
    { id: "reddit", type: "action.reddit.list-posts", position: { x: 500, y: 100 }, config: { credentialId: "", subreddit: "technology", sort: "new", limit: 20 } },
  ], edges: [] };
  const workflow = { id: "reddit-access", workspaceId: "workspace-1", name: "Reddit access", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "owner", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/auth/identities")) return send({ identities: [] });
    if (path.endsWith("/auth/providers")) return send({ google: false, github: false, steam: false });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Workspace", slug: "workspace", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/reddit-access")) return send({ workflow });
    if (path.endsWith("/rss-trigger-status")) return send({ active: false, checkpoints: [] });
    return send({});
  });
  await page.goto("/editor?workflow=reddit-access");
  await page.getByTestId("rf__node-rss").click();
  const feed = page.getByLabel("Public feed URL");
  await expect(page.getByText("Reddit RSS support is ending")).toHaveCount(0);
  await feed.fill("https://www.reddit.com/r/technology/.rss");
  await expect(page.getByText("Reddit RSS support is ending")).toBeVisible();
  await feed.fill("https://reddit.com.example.test/feed");
  await expect(page.getByText("Reddit RSS support is ending")).toHaveCount(0);
  await page.getByTestId("rf__node-reddit").click();
  await expect(page.getByText("Reddit access is changing")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read Reddit's migration timeline" })).toHaveAttribute("href", "https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026");
});
