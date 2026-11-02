import { expect, test } from "@playwright/test";

test("Sentry trigger separates integration client secret from its API connection", async ({ page }) => {
  const graph = { nodes: [{ id: "sentry", type: "trigger.sentry.issue-created", position: { x: 100, y: 100 }, config: { credentialId: "", organization: "test-org", project: "web", installationId: "64bf2cf2-37ee-46ae-a093-b7a52bd41a2a" } }], edges: [] };
  const workflow = { id: "sentry-test", workspaceId: "workspace-1", name: "Sentry test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: { id: "published", version: 1, graph } };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/sentry-test")) return send({ workflow });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") return send({ endpoint: null });
      expect(route.request().postDataJSON()).toMatchObject({ path: "sentry-sentry-test", secretRequired: true, signingSecret: "synthetic-client-secret", publishedVersionId: "published" });
      return send({ endpoint: { id: "endpoint", path: "sentry-sentry-test", secret: null, workflowVersionId: "published", createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=sentry-test");
  await page.getByTestId("rf__node-sentry").click();
  await page.getByRole("button", { name: "Configure webhook" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByText(/Project service hooks use a different protocol/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Create registration" })).toBeDisabled();
  await panel.getByLabel("Sentry integration client secret").fill("synthetic-client-secret");
  await panel.getByRole("button", { name: "Create registration" }).click();
  await expect(panel.getByText(/Client secret saved/)).toBeVisible();
  await expect(panel.getByLabel("Sentry integration client secret")).toHaveValue("");
});
