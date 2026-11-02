import { expect, test } from "@playwright/test";

test("Trello board trigger requires its app secret and exact public callback", async ({ page }) => {
  const graph = { nodes: [{ id: "trello", type: "trigger.trello.board-action", position: { x: 100, y: 100 }, config: { credentialId: "", boardId: "4d5ea62fd76aa1136000000c", action: "all" } }], edges: [] };
  const workflow = { id: "trello-test", workspaceId: "workspace-1", name: "Trello test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: { id: "published", version: 1, graph } };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/trello-test")) return send({ workflow });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") return send({ endpoint: null });
      expect(route.request().postDataJSON()).toMatchObject({ path: "trello-trello-test", secretRequired: true, signingSecret: "synthetic-app-secret", callbackUrl: "https://api.example.test/api/v1/webhooks/trello-trello-test", publishedVersionId: "published" });
      return send({ endpoint: { id: "endpoint", path: "trello-trello-test", secret: null, workflowVersionId: "published", createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=trello-test");
  await page.getByTestId("rf__node-trello").click();
  await page.getByRole("button", { name: "Configure webhook" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByText(/does not create or verify the remote webhook/i)).toBeVisible();
  await panel.getByLabel("Trello app secret").fill("synthetic-app-secret");
  await expect(panel.getByRole("button", { name: "Create registration" })).toBeDisabled();
  await panel.getByLabel("Exact public callback URL").fill("https://api.example.test/api/v1/webhooks/trello-trello-test");
  await panel.getByRole("button", { name: "Create registration" }).click();
  await expect(panel.getByText(/App secret saved/)).toBeVisible();
  await expect(panel.getByLabel("Trello app secret")).toHaveValue("");
});
