import { expect, test } from "@playwright/test";

test("League actions expose guided Riot ID and match inputs", async ({ page }) => {
  const graph = { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} }], edges: [] };
  const workflow = { id: "riot-test", workspaceId: "workspace-1", name: "League test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "riot-1", provider: "RIOT", label: "My Riot" }] });
    if (path.endsWith("/workflows/riot-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=riot-test");
  const library = page.getByRole("complementary", { name: "Node Library" });
  await library.getByLabel("Search apps and operations").fill("Riot ID");
  await library.getByRole("button", { name: /League of Legends: Find account by Riot ID/ }).click();
  await expect(page.getByLabel("Operation", { exact: true })).toHaveValue("accountByRiotId");
  await expect(page.getByLabel("Player's League server")).toHaveValue("vn2");
  await expect(page.getByLabel("Riot ID game name")).toBeVisible();
  await expect(page.getByLabel("Riot ID tag (without #)")).toBeVisible();
  await page.getByLabel("Operation", { exact: true }).selectOption("match");
  await expect(page.getByLabel("Match ID")).toBeVisible();
  await expect(page.getByLabel("Riot ID game name")).toHaveCount(0);
  await expect(page.locator(".react-flow__node").filter({ hasText: "Get match" })).toBeVisible();
  await library.getByLabel("Search apps and operations").fill("");
  await library.getByRole("button", { name: "Roadmap" }).click();
  const instagram = library.locator('[data-app-id="instagram"] svg');
  for (let theme = 0; theme < 2; theme += 1) {
    await expect(instagram.locator("linearGradient")).toHaveCount(1);
    await expect(instagram.locator("path").first()).toHaveAttribute("fill", /^url\(#brand.+-instagram\)$/);
    await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).click();
  }
});

test("large execution output loads branches on demand and retains the full raw result", async ({ page }) => {
  const graph = { nodes: [{ id: "riot", type: "action.riot-lol", position: { x: 100, y: 100 }, config: { operation: "timeline", platform: "vn2", matchId: "VN2_123" } }], edges: [] };
  const workflow = { id: "riot-large", workspaceId: "workspace-1", name: "League test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  const output = { result: { frames: Array.from({ length: 60 }, (_, index) => ({ index, data: "x".repeat(2200) })) }, operation: "timeline" };
  const execution = { id: "execution-large", status: "SUCCEEDED", mode: "mock", workflowId: workflow.id, workflowVersion: 1, graph, error: null, createdAt: "2026-01-01T00:00:00Z", startedAt: null, completedAt: null, durationMs: 5, recoveryCount: 0, nodeExecutions: [{ nodeId: "riot", nodeType: "action.riot-lol", status: "SUCCEEDED", attempt: 1, input: {}, output, error: null, startedAt: null, completedAt: null, durationMs: 5, failureHandling: null, skipReason: null }] };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/executions/execution-large")) return send({ execution });
    if (path.endsWith("/workflows/riot-large")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?execution=execution-large");
  await expect(page.getByText("Large output: expand individual sections to explore. Raw JSON contains the complete data.")).toBeVisible();
  await page.getByText("Object · 1 fields", { exact: true }).click();
  await page.getByText("Array · 60 items", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Show more (10 remaining)" })).toBeVisible();
  await page.getByRole("button", { name: "Show more (10 remaining)" }).click();
  await expect(page.getByRole("button", { name: /Show more/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Raw JSON" }).last().click();
  await expect(page.locator("pre").last()).toContainText('"index": 59');
});
