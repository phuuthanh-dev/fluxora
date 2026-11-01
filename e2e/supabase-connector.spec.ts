import { expect, test } from "@playwright/test";

for (const failure of [
  { code: "SUPABASE_DISCOVERY_RESTRICTED", message: "Schema discovery is unavailable; enter the table name manually." },
  { code: "SUPABASE_TABLES_UNAVAILABLE", message: "Tables could not be listed. Check the connection or enter the table name manually." },
]) test(`Supabase table discovery falls back and retries after ${failure.code}`, async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "supabase", type: "action.supabase.select", position: { x: 400, y: 100 }, config: { credentialId: "supabase-1", table: "items", limit: 20 } },
  ], edges: [] };
  const workflow = { id: "supabase-test", workspaceId: "workspace-1", name: "Supabase test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  let discoveryAvailable = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "supabase-1", provider: "SUPABASE", label: "My Supabase" }] });
    if (path.endsWith("/supabase/tables")) {
      if (discoveryAvailable) return send({ tables: [{ id: "items", name: "items" }] });
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify(failure) });
    }
    if (path.endsWith("/workflows/supabase-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=supabase-test");
  await page.locator(".react-flow__node").filter({ hasText: "Select rows" }).click();
  await expect(page.getByLabel("Supabase connection")).toHaveValue("supabase-1");
  const table = page.getByRole("group", { name: "Table" });
  await expect(table.getByRole("status")).toHaveText(failure.message);
  await expect(table.getByRole("textbox", { name: "Table value" })).toHaveValue("items");
  discoveryAvailable = true;
  await table.getByRole("button", { name: "Choose from list" }).click();
  await expect(table.getByRole("combobox", { name: "Table" })).toHaveValue("items");
  await expect(table.getByText("1 of 1 loaded tables match.")).toBeVisible();
});
