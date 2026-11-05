import { expect, test } from "@playwright/test";

test("execution pagination help describes the recorded run in both themes", async ({ page }) => {
  const graph = { nodes: [{ id: "read", type: "action.google-drive", position: { x: 100, y: 100 }, config: { operation: "search" } }], edges: [] };
  const workflow = { id: "pagination-workflow", workspaceId: "workspace", name: "Pagination", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  const execution = { id: "pagination-execution", status: "SUCCEEDED", mode: "mock", workflowId: workflow.id, workflowVersion: 1, graph, error: null, createdAt: "2026-01-01T00:00:00Z", startedAt: null, completedAt: null, durationMs: 5, recoveryCount: 0, nodeExecutions: [{ nodeId: "read", nodeType: "action.google-drive", status: "SUCCEEDED", attempt: 1, input: { config: { operation: "search" } }, output: { files: [], nextPageToken: "synthetic-cursor" }, error: null, startedAt: null, completedAt: null, durationMs: 5, failureHandling: null, skipReason: null }] };
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

test("Drive automatic pagination appears for read operations only and stays opt-in", async ({ page }) => {
  const graph = { nodes: [{ id: "drive", type: "action.google-drive", position: { x: 100, y: 100 }, config: { credentialId: "google", operation: "search" } }], edges: [] };
  const workflow = { id: "drive-pagination", workspaceId: "workspace", name: "Drive pagination", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "google", provider: "GOOGLE", label: "Google" }] });
    if (path.endsWith("/workflows/drive-pagination")) return send({ workflow });
    return route.abort();
  });
  await page.goto("/editor?workflow=drive-pagination");
  await page.locator('.react-flow__node[data-id="drive"]').click();
  const checkbox = page.getByLabel("Automatically fetch more results");
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(page.getByText(/at most five Drive requests/)).toBeVisible();
  await page.getByLabel("Operation", { exact: true }).selectOption("uploadText");
  await expect(checkbox).toHaveCount(0);
});
