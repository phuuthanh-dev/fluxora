import { expect, test } from "@playwright/test";

test("Telegram trigger explains manual setup and creates a secret-protected endpoint", async ({ page }) => {
  const graph = { nodes: [{ id: "telegram", type: "trigger.telegram.update", position: { x: 100, y: 100 }, config: { event: "message", chatMode: "allowlist", allowedChatIds: "12345" } }], edges: [] };
  const workflow = { id: "telegram-test", workspaceId: "workspace-1", name: "Telegram test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: { id: "published", version: 1, graph } };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/telegram-test")) return send({ workflow });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") return send({ endpoint: null });
      expect(route.request().postDataJSON()).toMatchObject({ path: "telegram-telegram-test", secretRequired: true, publishedVersionId: "published", expectedEndpoint: null });
      return send({ endpoint: { id: "endpoint", path: "telegram-telegram-test", secret: "synthetic-secret", workflowVersionId: "published", createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=telegram-test");
  await page.getByTestId("rf__node-telegram").click();
  await expect(page.getByLabel("Allowed chat IDs (comma-separated)")).toHaveValue("12345");
  await page.getByRole("button", { name: "Configure webhook" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByText(/one webhook per bot/i)).toBeVisible();
  await expect(panel.getByText(/does not register or change it automatically/i)).toBeVisible();
  await expect(panel.getByLabel("Public path")).toHaveValue("telegram-telegram-test");
  await panel.getByLabel("Public path").fill("bad/path");
  await expect(panel.getByRole("button", { name: "Create registration" })).toBeDisabled();
  await panel.getByLabel("Public path").fill("telegram-telegram-test");
  await panel.getByRole("button", { name: "Create registration" }).click();
  await expect(panel.getByText("synthetic-secret")).toBeVisible();
  await expect(panel.getByText(/displayed only once/i)).toBeVisible();
});
