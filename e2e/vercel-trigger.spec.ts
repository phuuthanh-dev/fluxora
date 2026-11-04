import { expect, test } from "@playwright/test";

test("Vercel trigger uses a separate imported webhook signing secret", async ({ page }) => {
  const graph = { nodes: [{ id: "vercel", type: "trigger.vercel.deployment", position: { x: 100, y: 100 }, config: { credentialId: "", team: "personal", project: "prj_example", event: "deployment.ready" } }], edges: [] };
  const workflow = { id: "vercel-test", workspaceId: "workspace-1", name: "Vercel test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: { id: "published", version: 1, graph } };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/workflows/vercel-test")) return send({ workflow });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") return send({ endpoint: null });
      expect(route.request().postDataJSON()).toMatchObject({ path: "vercel-vercel-test", secretRequired: true, signingSecret: "synthetic-secret", publishedVersionId: "published", expectedEndpoint: null });
      return send({ endpoint: { id: "endpoint", path: "vercel-vercel-test", secret: null, workflowVersionId: "published", createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=vercel-test");
  await page.getByTestId("rf__node-vercel").click();
  await page.getByRole("button", { name: "Configure webhook" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByText(/separate from your API token/i)).toBeVisible();
  await expect(panel.getByText(/does not create or verify the remote webhook/i)).toBeVisible();
  await expect(panel.getByLabel("Public path")).toHaveValue("vercel-vercel-test");
  await expect(panel.getByRole("button", { name: "Create registration" })).toBeDisabled();
  await panel.getByLabel("Vercel webhook signing secret").fill("synthetic-secret");
  await panel.getByRole("button", { name: "Create registration" }).click();
  await expect(panel.getByText(/Signing secret saved/)).toBeVisible();
  await expect(panel.getByLabel("Vercel webhook signing secret")).toHaveValue("");
  await expect(panel.getByText("synthetic-secret")).toHaveCount(0);
  await panel.getByLabel("Public path").fill("vercel-new-path");
  await expect(panel.getByText(/webhooks\/vercel-new-path/)).toBeVisible();
  await expect(panel.getByText(/current URL remains active until you rotate/)).toBeVisible();
});
