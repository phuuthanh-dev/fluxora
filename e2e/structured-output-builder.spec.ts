import { expect, test } from "@playwright/test";

test("structured AI fields are staged and must be applied before running", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "gemini", type: "action.gemini", position: { x: 300, y: 0 }, config: { credentialId: "", model: "gemini-2.5-flash", prompt: "Summarize", maxOutputTokens: 256, timeoutMs: 30000 } },
    { id: "openai", type: "action.openai", position: { x: 600, y: 0 }, config: { credentialId: "", model: "gpt-4o-mini", prompt: "Summarize", maxOutputTokens: 256, timeoutMs: 30000 } },
  ], edges: [] };
  const workflow = { id: "schema-demo", workspaceId: "workspace", name: "Schema demo", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "owner", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/auth/identities")) return send({ identities: [] });
    if (path.endsWith("/auth/providers")) return send({ google: false, github: false, steam: false });
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
  for (const node of ["gemini", "openai"]) {
    await page.getByTestId(`rf__node-${node}`).click();
    for (const theme of ["dark", "light"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
      const checkbox = page.getByLabel("Structured output", { exact: true });
      await checkbox.check();
      const size = await checkbox.boundingBox();
      expect(size?.width).toBeGreaterThanOrEqual(14);
      expect(size?.width).toBeLessThanOrEqual(20);
      expect(size?.height).toBeGreaterThanOrEqual(14);
      expect(size?.height).toBeLessThanOrEqual(20);
      await expect(page.getByText("Use text for IDs and numbers that need exact precision.", { exact: false })).toBeVisible();
      await checkbox.uncheck();
    }
  }
});

test("AI token limit does not silently reset when cleared or set to zero", async ({ page }) => {
  const graph = { nodes: [{ id: "gemini", type: "action.gemini", position: { x: 200, y: 100 }, config: { credentialId: "", model: "gemini-2.5-flash", prompt: "Summarize", maxOutputTokens: 256, timeoutMs: 30000 } }], edges: [] };
  const workflow = { id: "limit-demo", workspaceId: "workspace", name: "Limit demo", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "owner", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/auth/identities")) return send({ identities: [] });
    if (path.endsWith("/auth/providers")) return send({ google: false, github: false, steam: false });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "workspace", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/limit-demo")) return send({ workflow });
    return send({});
  });
  await page.goto("/editor?workflow=limit-demo");
  await page.getByTestId("rf__node-gemini").click();
  const limit = page.getByLabel("Max output tokens");
  await limit.fill("0");
  await expect(limit).toHaveValue("0");
  await expect(page.getByText("Max output tokens must be between 1 and 8,192.")).toBeVisible();
  await limit.fill("");
  await expect(limit).toHaveValue("");
  await expect(page.getByText("Max output tokens must be between 1 and 8,192.")).toBeVisible();
  await limit.fill("128");
  await expect(limit).toHaveValue("128");
  await expect(page.getByText("Max output tokens must be between 1 and 8,192.")).toHaveCount(0);
});
