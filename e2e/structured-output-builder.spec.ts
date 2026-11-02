import { expect, test } from "@playwright/test";

test("structured AI fields are staged and must be applied before running", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "gemini", type: "action.gemini", position: { x: 300, y: 0 }, config: { credentialId: "", model: "gemini-2.5-flash", prompt: "Summarize", maxOutputTokens: 256, timeoutMs: 30000 } },
  ], edges: [] };
  const workflow = { id: "schema-demo", workspaceId: "workspace", name: "Schema demo", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "owner", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "workspace", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/schema-demo")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=schema-demo");
  await page.locator(".react-flow__node").filter({ hasText: "Gemini" }).click();
  await page.getByLabel("Structured output", { exact: true }).check();
  await expect(page.getByLabel("Field 1 name")).toHaveValue("summary");
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field 2 name").fill("priority");
  await page.getByLabel("Field 2 type").selectOption("number");
  await expect(page.getByRole("button", { name: "Run node" })).toBeDisabled();
  await page.getByRole("button", { name: "Apply fields" }).click();
  await expect(page.getByRole("button", { name: "Run node" })).toBeEnabled();
  await page.getByLabel("Structured output", { exact: true }).uncheck();
  await expect(page.getByLabel("Field 1 name")).toHaveCount(0);
});
