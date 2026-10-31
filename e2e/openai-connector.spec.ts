import { expect, test } from "@playwright/test";

test("OpenAI node loads connection-scoped models and supports manual model IDs", async ({ page }) => {
  const graph = { nodes: [{ id: "openai", type: "action.openai", position: { x: 100, y: 100 }, config: { credentialId: "openai-1", model: "example", prompt: "Hello", maxOutputTokens: 1024, timeoutMs: 30000 } }], edges: [] };
  const workflow = { id: "workflow-openai", workspaceId: "workspace-1", name: "OpenAI test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "openai-1", provider: "OPENAI", label: "OpenAI test" }] });
    if (path.endsWith("/openai/models")) return send({ models: [{ id: "example", label: "example" }], hasMore: false });
    if (path.endsWith("/workflows/workflow-openai")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-openai");
  await page.locator(".react-flow__node").filter({ hasText: "Generate text" }).click();
  await expect(page.getByLabel("OpenAI credential")).toHaveValue("openai-1");
  const group = page.getByRole("group", { name: "Model" });
  await expect(group.getByRole("option", { name: "example" })).toHaveAttribute("value", "example");
  await expect(group.getByText(/supports text generation/)).toBeVisible();
  await group.getByRole("button", { name: /Enter value or expression/ }).click();
  await expect(group.getByLabel("Model value")).toHaveValue("example");
});
