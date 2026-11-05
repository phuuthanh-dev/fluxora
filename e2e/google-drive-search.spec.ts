import { expect, test } from "@playwright/test";

test("Drive filters build a safe query, clear a stale cursor and preserve advanced queries", async ({ page }) => {
  const originalQuery = "trashed = false or name = 'Report'";
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 200 }, config: {} },
    { id: "guided", type: "action.google-drive", position: { x: 300, y: 100 }, config: { credentialId: "google-1", operation: "search", query: "", pageToken: "old-page" } },
    { id: "advanced", type: "action.google-drive", position: { x: 300, y: 350 }, config: { credentialId: "google-1", operation: "search", query: originalQuery } },
  ], edges: [] };
  const workflow = { id: "drive-search", workspaceId: "workspace-1", name: "Drive search", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  const saves: Array<{ graph: typeof graph }> = [];
  const requests: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google-1", provider: "GOOGLE", label: "Google" }] });
    if (url.pathname.endsWith("/google/files")) { requests.push(url.searchParams.get("kind") ?? ""); return send({ files: [{ id: "folder_1", name: "Reports" }], nextPageToken: null }); }
    if (url.pathname.endsWith("/workflows/drive-search/draft") && request.method() === "PATCH") {
      const body = request.postDataJSON() as { graph: typeof graph }; saves.push(body); return send({ workflow: { ...workflow, draft: { ...workflow.draft, graph: body.graph } } });
    }
    if (url.pathname.endsWith("/workflows/drive-search")) return send({ workflow });
    return route.abort();
  });
  await page.goto("/editor?workflow=drive-search");
  await page.getByTestId("rf__node-guided").click();
  await page.getByLabel("Name starts with").fill("O'Brien");
  await page.getByLabel("File type").selectOption("spreadsheet");
  const folder = page.getByRole("group", { name: "Parent folder (optional)" });
  await folder.getByLabel("Parent folder (optional)", { exact: true }).selectOption("folder_1");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  const saved = saves[0]!.graph.nodes.find((node) => node.id === "guided")!.config;
  expect(saved.query).toBe("name contains 'O\\'Brien' and mimeType = 'application/vnd.google-apps.spreadsheet' and 'folder_1' in parents");
  expect(saved.pageToken).toBe("");
  expect(requests).toContain("folder");
  await page.getByRole("button", { name: "Hide minimap" }).click();
  await page.getByTestId("rf__node-advanced").click();
  await expect(page.getByLabel("Search query")).toHaveValue(originalQuery);
  await expect(page.getByRole("button", { name: "Use filters" })).toBeDisabled();
  expect(saves[0]!.graph.nodes.find((node) => node.id === "advanced")!.config.query).toBe(originalQuery);
});
