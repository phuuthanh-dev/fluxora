import { expect, test } from "@playwright/test";

test("Telegram reply and edit expose message-specific settings", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 50, y: 100 }, config: {} },
    { id: "reply", type: "action.telegram.reply", position: { x: 400, y: 100 }, config: { credentialId: "telegram-1", destinationType: "supergroup", chatId: "-10012345", messageId: "42", messageThreadId: "7", text: "Hello", parseMode: "" } },
    { id: "edit", type: "action.telegram.edit-message", position: { x: 750, y: 100 }, config: { credentialId: "telegram-1", destinationType: "dm", chatId: "12345", messageId: "42", text: "Updated", parseMode: "" } },
  ], edges: [] };
  const workflow = { id: "telegram-ops", workspaceId: "workspace-1", name: "Telegram operations", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "telegram-1", provider: "TELEGRAM_BOT", label: "My bot" }] });
    if (path.endsWith("/workflows/telegram-ops")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=telegram-ops");
  await page.getByTestId("rf__node-reply").click();
  await expect(page.getByLabel("Message ID")).toHaveValue("42");
  await expect(page.getByLabel("Topic / thread ID (optional)")).toHaveValue("7");
  await page.getByLabel("Telegram destination type").selectOption("dm");
  await page.getByLabel("Telegram destination type").selectOption("supergroup");
  await expect(page.getByLabel("Topic / thread ID (optional)")).toHaveValue("");
  await page.getByTestId("rf__node-edit").click();
  await expect(page.getByLabel("Message ID")).toHaveValue("42");
  await expect(page.getByLabel("Topic / thread ID (optional)")).toHaveCount(0);
});
