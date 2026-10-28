import { expect, test } from "@playwright/test";

test("GitHub registration is readable and protects existing secrets while loading and rotating", async ({ page }) => {
  const graph = { nodes: [{ id: "github", type: "trigger.github.pull-request-opened", position: { x: 100, y: 100 }, config: { path: "github-pr", credentialId: "", event: "pull_request", action: "opened" } }], edges: [] };
  const workflow = { id: "workflow-1", workspaceId: "workspace-1", name: "GitHub test", description: null, isActive: false, draft: { id: "draft-1", version: 1, graph }, published: { id: "version-1", version: 1, graph } };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  let statusUnavailable = true;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") {
        if (statusUnavailable) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Status unavailable" }) });
        await gate;
        return send({ endpoint: { id: "endpoint-1", path: "existing-path", signingMode: "legacy", workflowVersionId: "version-1", secretRequired: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
      }
      writes++;
      return send({ endpoint: { id: "endpoint-1", path: "existing-path", secret: "test-registration-secret" } });
    }
    if (path.endsWith("/workflows/workflow-1")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-1");
  await expect(page.getByRole("heading", { name: "GitHub test" })).toBeVisible();
  await page.locator(".react-flow__node").filter({ hasText: "Pull request opened" }).click();
  const note = page.locator(".inspector-note");
  await expect(note).toContainText("Webhook setup");
  await expect(note).toHaveCSS("font-size", "12px");
  await expect(note).not.toContainText("webhookSecret");
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Webhook endpoint" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByText("Status unavailable")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Create registration" })).toBeDisabled();
  statusUnavailable = false;
  await panel.getByRole("button", { name: "Retry status check" }).click();
  await expect(panel.getByRole("button", { name: "Checking registration…" })).toBeDisabled();
  release();
  await expect(panel.getByText(/legacy secret/)).toBeVisible();
  await expect(panel.getByLabel("Public path")).toHaveValue("existing-path");
  await panel.getByRole("button", { name: "Rotate registration" }).click();
  await expect(panel.getByText(/Rotating immediately replaces/)).toBeVisible();
  expect(writes).toBe(0);
  await panel.getByRole("button", { name: "Cancel" }).click();
  expect(writes).toBe(0);
  await panel.getByRole("button", { name: "Rotate registration" }).click();
  await panel.getByRole("button", { name: "Confirm rotation" }).click();
  await expect(panel.getByText("test-registration-secret")).toBeVisible();
  expect(writes).toBe(1);
});

test("GitHub repository picker loads more pages and keeps the chosen value", async ({ page }) => {
  const graph = { nodes: [{ id: "github", type: "action.github", position: { x: 100, y: 100 }, config: { credentialId: "credential-1", repository: "", title: "Test" } }], edges: [] };
  const workflow = { id: "workflow-2", workspaceId: "workspace-1", name: "Picker test", description: null, isActive: false, draft: { id: "draft-1", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "credential-1", provider: "GITHUB", label: "GitHub" }] });
    if (url.pathname.endsWith("/github/repositories")) {
      return url.searchParams.get("page") === "2" ? send({ repositories: [{ id: 2, fullName: "owner/second", private: false }], nextPage: null }) : send({ repositories: [{ id: 1, fullName: "owner/first", private: false }], nextPage: 2 });
    }
    if (url.pathname.endsWith("/workflows/workflow-2")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-2");
  await page.locator(".react-flow__node").filter({ hasText: "Create issue" }).click();
  const picker = page.getByRole("group", { name: "Repository", exact: true });
  await expect(picker.getByRole("button", { name: "Load more repositories" })).toBeVisible();
  await picker.getByRole("button", { name: "Load more repositories" }).click();
  await picker.getByLabel("Repository", { exact: true }).selectOption("owner/second");
  await picker.getByLabel("Repository search").fill("first");
  await expect(picker.getByLabel("Repository", { exact: true })).toHaveValue("owner/second");
  await picker.getByRole("button", { name: "Enter value or expression" }).click();
  await expect(picker.getByLabel("Repository value")).toHaveValue("owner/second");
});

test("Google Sheets picker selects a spreadsheet and supports manual input", async ({ page }) => {
  const graph = { nodes: [{ id: "sheets", type: "action.google-sheets", position: { x: 100, y: 100 }, config: { credentialId: "google-1", spreadsheetId: "", operation: "read", range: "Sheet1!A1" } }], edges: [] };
  const workflow = { id: "workflow-3", workspaceId: "workspace-1", name: "Sheets test", description: null, isActive: false, draft: { id: "draft-1", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google-1", provider: "GOOGLE", label: "Google" }] });
    if (url.pathname.endsWith("/google/files")) return send(url.searchParams.get("pageToken") === "next" ? { files: [{ id: "sheet-2", name: "Budget" }], nextPageToken: null } : { files: [{ id: "sheet-1", name: "Report" }], nextPageToken: "next" });
    if (url.pathname.endsWith("/workflows/workflow-3")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-3");
  await page.locator(".react-flow__node").filter({ hasText: "Read or write rows" }).click();
  const picker = page.getByRole("group", { name: "Spreadsheet", exact: true });
  await picker.getByRole("button", { name: "Load more spreadsheets" }).click();
  await picker.getByLabel("Spreadsheet", { exact: true }).selectOption("sheet-2");
  await picker.getByRole("button", { name: "Enter value or expression" }).click();
  await expect(picker.getByLabel("Spreadsheet value")).toHaveValue("sheet-2");
});
