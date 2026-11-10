import { expect, test } from "@playwright/test";

test("Jira trigger selects a project and connects its managed webhook", async ({ page }) => {
  const graph = { nodes: [{ id: "jira", type: "trigger.jira.issue", position: { x: 100, y: 100 }, config: { credentialId: "credential-1", project: "10001", event: "jira:issue_created" } }], edges: [] };
  const workflow = { id: "jira-test", workspaceId: "workspace-1", name: "Jira test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: { id: "published", version: 1, graph } };
  let endpoint: Record<string, unknown> | null = null;
  let connected = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "credential-1", provider: "JIRA", label: "Jira site", isManaged: true }] });
    if (path.endsWith("/jira/projects")) return send({ projects: [{ id: "10001", name: "Test project" }] });
    if (path.endsWith("/workflows/jira-test")) return send({ workflow });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") return send({ endpoint });
      endpoint = { id: "endpoint", path: "jira-jira-test", secret: null, workflowVersionId: "published", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
      return send({ endpoint });
    }
    if (path.endsWith("/jira-provider-webhook")) {
      if (route.request().method() === "POST") connected = true;
      return send({ providerWebhook: { enabled: true, endpoint, registration: connected ? { state: "ACTIVE", provider: "JIRA", event: "jira:issue_created", workflowVersionId: "published" } : null } });
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=jira-test");
  await page.getByTestId("rf__node-jira").click();
  await expect(page.getByText("Test project", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Configure webhook" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByRole("button", { name: "Enable Jira trigger access" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Copy URL" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Create registration" }).click();
  await panel.getByRole("button", { name: "Connect Jira" }).click();
  await expect(panel.getByText(/Jira webhook connected/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Disconnect" })).toBeVisible();
});
