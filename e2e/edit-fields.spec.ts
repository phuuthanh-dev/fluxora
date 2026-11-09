import { expect, test } from "@playwright/test";

test("Edit Fields configures named typed values without JSON", async ({ page }) => {
  const graph = { nodes: [
    { id: "start", type: "trigger.manual", position: { x: 10, y: 100 }, config: {} },
    { id: "edit", type: "action.edit-fields", position: { x: 380, y: 100 }, config: { fields: [{ name: "title", type: "text", value: "Hello" }] } },
  ], edges: [{ id: "edge", source: "start", target: "edit", kind: "success" }] };
  const workflow = { id: "edit-fields-test", workspaceId: "workspace-1", name: "Edit fields", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [] });
    if (url.pathname.endsWith("/workflows/edit-fields-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=edit-fields-test");
  await page.locator('.react-flow__node[data-id="edit"]').click();
  await expect(page.getByLabel("Field 1 name")).toHaveValue("title");
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field 2 name").fill("published");
  await page.getByLabel("Field 2 type").selectOption("boolean");
  await page.getByLabel("Field 2 value").selectOption("true");
  await expect(page.getByLabel("Field 2 value")).toHaveValue("true");
  await page.getByRole("button", { name: "Remove field 1" }).click();
  await expect(page.getByLabel("Field 1 name")).toHaveValue("published");
});
