import { expect, test } from "@playwright/test";

test("choose which Steam trigger starts the full mock workflow", async ({ page }) => {
  const api = `http://localhost:${process.env.E2E_API_PORT ?? "3001"}/api/v1`;
  const registered = await page.request.post(`${api}/auth/register`, { data: { email: `multi-trigger-${Date.now()}@example.test`, password: "synthetic-multi-trigger", displayName: "Multi trigger test" } });
  expect(registered.ok()).toBeTruthy();
  const { workspaces } = await (await page.request.get(`${api}/workspaces`)).json();
  const graph = { nodes: [
    { id: "daily", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "16 17 * * *", timezone: "Asia/Ho_Chi_Minh" } },
    { id: "news", type: "trigger.steam.game-news", position: { x: 0, y: 200 }, config: { appId: "4115450", pollMinutes: 5 } },
    { id: "daily-action", type: "action.edit-fields", position: { x: 250, y: 0 }, config: { fields: [{ name: "kind", type: "text", value: "daily" }] } },
    { id: "news-action", type: "action.edit-fields", position: { x: 250, y: 200 }, config: { fields: [{ name: "kind", type: "text", value: "news" }] } },
  ], edges: [
    { id: "daily-edge", source: "daily", target: "daily-action", kind: "success" },
    { id: "news-edge", source: "news", target: "news-action", kind: "success" },
  ] };
  const created = await page.request.post(`${api}/workspaces/${workspaces[0].id}/workflows`, { data: { name: "Multi trigger test", graph } });
  expect(created.ok()).toBeTruthy();
  const { workflow } = await created.json();
  await page.goto(`/editor?workflow=${encodeURIComponent(workflow.id)}`);
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose test trigger" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Other trigger branches will not run");
  await dialog.getByLabel("Start from").selectOption("news");
  const response = page.waitForResponse((item) => item.url().endsWith(`/workflows/${workflow.id}/executions`) && item.request().method() === "POST");
  await dialog.getByRole("button", { name: "Run test", exact: true }).click();
  const { execution } = await (await response).json();
  expect(execution.nodeExecutions.find((node: { nodeId: string }) => node.nodeId === "news-action").status).toBe("SUCCEEDED");
  expect(execution.nodeExecutions.find((node: { nodeId: string }) => node.nodeId === "daily-action").status).toBe("SKIPPED");
});
