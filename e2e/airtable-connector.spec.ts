import { expect, test } from "@playwright/test";

test("Airtable setup loads account resources and clears dependent fields when the base changes", async ({ page }) => {
  const base = "app12345678901234", other = "app98765432109876", table = "tbl12345678901234", field = "fld12345678901234";
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "airtable", type: "action.airtable.create-record", position: { x: 300, y: 0 }, config: { credentialId: "airtable", baseId: base, tableId: table, fields: [] } },
  ], edges: [] };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "owner", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "workspace", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "airtable", provider: "AIRTABLE", label: "Airtable", isManaged: true }] });
    if (path.endsWith("/airtable/bases")) return send({ items: [{ id: base, name: "Planning" }, { id: other, name: "Other" }], truncated: false });
    if (path.endsWith("/airtable/tables")) return send({ items: [{ id: table, name: "Tasks" }], truncated: false });
    if (path.endsWith("/airtable/fields")) return send({ items: [{ id: field, name: "Task name" }], truncated: false });
    if (path.endsWith("/workflows/airtable-test")) return send({ workflow: { id: "airtable-test", workspaceId: "workspace", name: "Airtable test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null } });
    return route.continue();
  });
  await page.goto("/editor?workflow=airtable-test");
  await page.getByTestId("rf__node-airtable").click();
  await expect(page.getByRole("group", { name: "Base", exact: true }).getByRole("option", { name: "Planning" })).toHaveAttribute("value", base);
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field 1", { exact: true }).selectOption(field);
  await page.getByLabel("Field 1 value", { exact: true }).fill("Example");
  await page.getByRole("group", { name: "Base", exact: true }).getByRole("combobox").selectOption(other);
  await expect(page.getByRole("group", { name: "Table", exact: true }).getByRole("combobox")).toHaveValue("");
  await expect(page.getByLabel("Field 1", { exact: true })).toHaveCount(0);
});
