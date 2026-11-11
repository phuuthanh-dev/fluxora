import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) test(`Slack mapping and failure settings in ${theme} mode`, async ({ page }) => {
  const graph = { nodes: [
    { id: "ai", type: "action.gemini", position: { x: 250, y: 300 }, config: { prompt: "Synthetic", structuredOutput: true, outputSchema: { type: "object", properties: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`field${i}`, { type: "string" }])), required: Array.from({ length: 25 }, (_, i) => `field${i}`), additionalProperties: false } } },
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "slack", type: "action.slack.webhook", position: { x: 450, y: 100 }, config: { credentialId: "slack-1", message: "Before after" } },
  ], edges: [{ id: "edge-1", source: "manual", target: "ai", kind: "success" }, { id: "edge-2", source: "ai", target: "slack", kind: "success" }] };
  const workflow = { id: "test-wf", workspaceId: "workspace-1", name: "Test workflow", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  let alert: unknown;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "slack-1", provider: "SLACK_WEBHOOK", label: "Slack" }, { id: "telegram-1", provider: "TELEGRAM_BOT", label: "Telegram" }] });
    if (path.endsWith("/failure-alert")) { if (route.request().method() === "PATCH") alert = route.request().postDataJSON(); return send({ provider: null, credentialId: null, chatId: null }); }
    if (path.endsWith("/workflows/test-wf")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=test-wf");
  await page.locator("html").evaluate((el, value) => el.setAttribute("data-theme", value), theme);
  await page.locator('.react-flow__node[data-id="slack"]').click();
  const message = page.getByLabel("Message", { exact: true });
  await message.focus();
  await message.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(7, 7));
  await expect(page.getByRole("button", { name: "{{ steps.manual.output.received }}", exact: true })).toHaveCount(0);
  await page.getByText("Use data from an earlier step", { exact: true }).click();
  await page.getByLabel("Mapping source step").selectOption("manual");
  await page.getByRole("button", { name: "{{ steps.manual.output.received }}", exact: true }).click();
  await expect(message).toHaveValue("Before {{ steps.manual.output.received }}after");
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Failure notifications" }).click();
  await page.getByLabel("Send alerts to").selectOption("telegram");
  await page.getByLabel("Failure alert connection").selectOption("telegram-1");
  await page.getByLabel("Failure alert Telegram chat ID").fill("123");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Notification settings saved.")).toBeVisible();
  expect(alert).toEqual({ provider: "telegram", credentialId: "telegram-1", chatId: "123" });
});
