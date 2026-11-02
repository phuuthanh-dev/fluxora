import { expect, test } from "@playwright/test";

test("RSS trigger explains a checkpoint gap and confirms an explicit reset", async ({ page }) => {
  const graph = { nodes: [{ id: "rss", type: "trigger.rss.new-item", position: { x: 100, y: 100 }, config: { url: "https://example.test/feed?lang=vi", pollMinutes: "5" } }], edges: [] };
  const workflow = { id: "rss-test", workspaceId: "workspace-1", name: "RSS trigger", description: null, isActive: false, draft: { id: "draft", version: 2, graph }, published: { id: "published", version: 1, graph } };
  let resets = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/rss-test")) return send({ workflow });
    if (path.endsWith("/rss-trigger-status")) return send({ active: false, checkpoints: [{ nodeId: "rss", state: "ERROR", lastErrorCode: "RSS_SNAPSHOT_GAP" }] });
    if (path.endsWith("/rss-trigger-reset")) {
      expect(route.request().postDataJSON()).toEqual({ confirmDataGap: true });
      resets++;
      return send({ success: true });
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=rss-test");
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
});
