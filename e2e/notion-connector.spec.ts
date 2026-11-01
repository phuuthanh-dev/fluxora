import { expect, test } from "@playwright/test";

test("Notion and PostgreSQL offer separate connections and guided fields", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "notion", type: "action.notion.search-pages", position: { x: 400, y: 100 }, config: { credentialId: "notion-1", query: "Notes", pageSize: 20 } },
    { id: "postgres", type: "action.postgres.select", position: { x: 400, y: 350 }, config: { credentialId: "postgres-1", schema: "public", table: "items", limit: 20 } },
  ], edges: [] };
  const workflow = { id: "notion-test", workspaceId: "workspace-1", name: "Notion test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "notion-1", provider: "NOTION", label: "My Notion" }, { id: "postgres-1", provider: "POSTGRES", label: "My database" }] });
    if (path.endsWith("/postgres/schemas")) return send({ schemas: [{ id: "public", name: "public" }] });
    if (path.endsWith("/postgres/tables")) { expect(new URL(route.request().url()).searchParams.get("schema")).toBe("public"); return send({ tables: [{ id: "items", name: "items" }] }); }
    if (path.endsWith("/workflows/notion-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=notion-test");
  await page.locator(".react-flow__node").filter({ hasText: "Search pages" }).click();
  await expect(page.getByLabel("Notion credential")).toHaveValue("notion-1");
  await expect(page.getByLabel("Page title contains (optional)")).toHaveValue("Notes");
  await expect(page.getByLabel("Maximum pages (1–100)")).toHaveValue("20");
  await page.locator(".react-flow__node").filter({ hasText: "Select rows" }).click();
  await expect(page.getByLabel("PostgreSQL credential")).toHaveValue("postgres-1");
  await expect(page.getByRole("group", { name: "Schema" }).getByRole("option", { name: "public" })).toHaveAttribute("value", "public");
  await expect(page.getByRole("group", { name: "Table" }).getByRole("option", { name: "items" })).toHaveAttribute("value", "items");
});
