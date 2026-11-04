import { expect, test } from "@playwright/test";

for (const type of ["action.google-drive", "action.gmail.read", "action.notion.search-pages", "action.sentry.list-issues", "action.vercel.list-deployments"] as const) {
  test(`${type}: explicit draft upgrade retains ignored continuation fields`, async ({ page }) => {
    const config = { credentialId: "synthetic", pageToken: "old-page", cursor: "old-cursor", extra: { preserved: true } };
    const workflow = { id: "workflow", workspaceId: "workspace", name: "Synthetic", description: null, isActive: false,
      draft: { id: "draft", version: 1, graph: { nodes: [
        { id: "trigger", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
        { id: "read", type, position: { x: 300, y: 0 }, config },
      ], edges: [] } }, published: null };
    const saves: Array<{ graph: { nodes: Array<{ id: string; type: string; config: unknown }> } }> = [];
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      const send = (data: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
      if (path.endsWith("/auth/me")) return send({ user: { id: "user", name: "Owner", email: "owner@example.test" } });
      if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "test", role: "OWNER" }] });
      if (path.endsWith("/credentials")) return send({ credentials: [] });
      if (path.endsWith("/workspaces/workspace/workflows")) return send({ workflows: [workflow] });
      if (path.endsWith("/workflows/workflow/draft") && request.method() === "PATCH") {
        const body = request.postDataJSON() as { graph: { nodes: Array<{ id: string; type: string; config: unknown }> } };
        saves.push(body); return send({ workflow: { ...workflow, draft: { ...workflow.draft, graph: body.graph } } });
      }
      if (path.endsWith("/workflows/workflow")) return send({ workflow });
      return route.abort();
    });
    await page.goto("/editor?workflow=workflow");
    await page.locator('.react-flow__node[data-id="read"]').click();
    await expect(page.getByText("Original pagination behavior")).toBeVisible();
    expect(saves).toHaveLength(0);
    await page.getByRole("button", { name: "Use paginated version in draft" }).click();
    expect(saves).toHaveLength(0);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect.poll(() => saves.length).toBe(1);
    const node = saves[0]!.graph.nodes.find((item) => item.id === "read")!;
    expect(node.type).toBe(`${type}.v2`);
    expect(node.config).toEqual(config);
  });
}

test("execution pagination help describes the recorded run in both themes", async ({ page }) => {
  const graph = { nodes: [{ id: "read", type: "action.google-drive.v2", position: { x: 100, y: 100 }, config: { operation: "search" } }], edges: [] };
  const workflow = { id: "pagination-workflow", workspaceId: "workspace", name: "Pagination", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  const execution = { id: "pagination-execution", status: "SUCCEEDED", mode: "mock", workflowId: workflow.id, workflowVersion: 1, graph, error: null, createdAt: "2026-01-01T00:00:00Z", startedAt: null, completedAt: null, durationMs: 5, recoveryCount: 0, nodeExecutions: [{ nodeId: "read", nodeType: "action.google-drive.v2", status: "SUCCEEDED", attempt: 1, input: { config: { operation: "search" } }, output: { files: [], nextPageToken: "synthetic-cursor" }, error: null, startedAt: null, completedAt: null, durationMs: 5, failureHandling: null, skipReason: null }] };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/executions/pagination-execution")) return send({ execution });
    if (path.endsWith("/workflows/pagination-workflow")) return send({ workflow });
    return route.abort();
  });
  await page.goto("/editor?execution=pagination-execution");
  const section = page.getByRole("region", { name: "Last execution" });
  const pagination = section.locator("details").filter({ has: page.getByText("Pagination", { exact: true }) });
  await expect(pagination).not.toHaveAttribute("open");
  await pagination.locator("summary").press("Enter");
  await expect(pagination).toContainText("nextPageToken");
  await expect(pagination).toContainText("pageToken");
  await expect(pagination).not.toContainText("synthetic-cursor");
  await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).click();
  await expect(pagination).toBeVisible();
});
