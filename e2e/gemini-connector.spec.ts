import { expect, test } from "@playwright/test";

test("Gemini node discovers models using its connection and retains manual fallback", async ({ page }) => {
  const graph = { nodes: [{ id: "gemini", type: "action.gemini", position: { x: 100, y: 100 }, config: { credentialId: "gemini-1", model: "models/example", prompt: "Hello", maxOutputTokens: 1024, timeoutMs: 30000 } }], edges: [] };
  const workflow = { id: "workflow-gemini", workspaceId: "workspace-1", name: "Gemini test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "gemini-1", provider: "GEMINI", label: "Gemini test" }] });
    if (path.endsWith("/gemini/models")) return send({ models: [{ id: "models/example", label: "Example" }], hasMore: true });
    if (path.endsWith("/workflows/workflow-gemini")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-gemini");
  await page.locator(".react-flow__node").filter({ hasText: "Generate text" }).click();
  await expect(page.getByLabel("Gemini credential")).toHaveValue("gemini-1");
  const group = page.getByRole("group", { name: "Model" });
  await expect(group.getByRole("option", { name: /Example/ })).toHaveAttribute("value", "models/example");
  await expect(group.getByText(/Showing up to 100 models/)).toBeVisible();
  await group.getByRole("button", { name: /Enter value or expression/ }).click();
  await expect(group.getByLabel("Model value")).toHaveValue("models/example");
  await expect(page.getByLabel("Prompt")).toHaveValue("Hello");
});
