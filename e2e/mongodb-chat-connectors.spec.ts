import { expect, test } from "@playwright/test";

test("MongoDB and Chat configure provider-scoped resources with manual fallback", async ({ page }) => {
  const graph = { nodes: [
    { id: "mongo", type: "action.mongodb", position: { x: 100, y: 100 }, config: { credentialId: "mongo-1", database: "sample", collection: "items", operation: "find", filter: "{}", limit: 20 } },
    { id: "mongo-insert", type: "action.mongodb.insert", position: { x: 100, y: 350 }, config: { credentialId: "mongo-1", database: "sample", collection: "items", document: '{"name":"sample"}' } },
    { id: "chat", type: "action.google-chat.oauth", position: { x: 450, y: 100 }, config: { credentialId: "chat-1", space: "spaces/abc", message: "Hello" } },
  ], edges: [] };
  const workflow = { id: "workflow-connectors", workspaceId: "workspace-1", name: "Connector test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "mongo-1", provider: "MONGODB", label: "Database" }, { id: "chat-1", provider: "GOOGLE_CHAT_OAUTH", label: "Chat" }] });
    if (url.pathname.endsWith("/mongodb/databases")) return send({ databases: [{ id: "sample", name: "sample" }] });
    if (url.pathname.endsWith("/mongodb/collections")) { expect(url.searchParams.get("database")).toBe("sample"); return send({ collections: [{ id: "items", name: "items" }] }); }
    if (url.pathname.endsWith("/google-chat/spaces")) return send({ spaces: [{ id: "spaces/abc", name: "Team" }] });
    if (url.pathname.endsWith("/workflows/workflow-connectors")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-connectors");
  await page.locator(".react-flow__node").filter({ hasText: "Find documents" }).click();
  await expect(page.getByLabel("MongoDB credential")).toHaveValue("mongo-1");
  await expect(page.getByRole("group", { name: "Database" }).getByRole("option", { name: "sample" })).toHaveAttribute("value", "sample");
  const collection = page.getByRole("group", { name: "Collection" });
  await expect(collection.getByRole("option", { name: "items" })).toHaveAttribute("value", "items");
  await collection.getByRole("button", { name: /Enter value or expression/ }).click();
  await expect(collection.getByLabel("Collection value")).toHaveValue("items");
  await page.getByRole("button", { name: "Add condition" }).click();
  await page.getByLabel("Condition 1 field").fill("count");
  await page.getByLabel("Condition 1 operator").selectOption("gte");
  await page.getByLabel("Condition 1 value type").selectOption("number");
  await page.getByLabel("Condition 1 value", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Apply conditions" }).click();
  await page.getByRole("button", { name: "Edit JSON" }).click();
  await expect(page.getByLabel("Filter (JSON)")).toHaveValue('{"count":{"$gte":3}}');
  await page.getByLabel("Filter (JSON)").fill('{"$or":[{"count":1},{"count":2}]}');
  await expect(page.getByRole("button", { name: "Use visual builder" })).toBeDisabled();
  await page.locator(".react-flow__node").filter({ hasText: "Insert document" }).click();
  await expect(page.getByLabel("Document (JSON)")).toHaveValue('{"name":"sample"}');
  await page.locator(".react-flow__node").filter({ hasText: "Find documents" }).click();
  await expect(page.getByLabel("Filter (JSON)")).toHaveValue('{"$or":[{"count":1},{"count":2}]}');
  await page.locator(".react-flow__node").filter({ hasText: "Send OAuth message" }).click();
  await expect(page.getByLabel("Google Chat credential")).toHaveValue("chat-1");
  const space = page.getByRole("group", { name: "Space" });
  await expect(space.getByRole("option", { name: "Team" })).toHaveAttribute("value", "spaces/abc");
});
