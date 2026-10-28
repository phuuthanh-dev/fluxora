import { expect, test } from "@playwright/test";

test("generic webhook explains the one-time header secret without GitHub-specific instructions", async ({ page }) => {
  const graph = { nodes: [{ id: "webhook", type: "trigger.webhook", position: { x: 100, y: 100 }, config: { path: "generic-hook", secretRequired: true } }], edges: [] };
  const workflow = { id: "workflow-generic", workspaceId: "workspace-1", name: "Generic webhook", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: { id: "published", version: 1, graph } };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/provider-webhook")) return send({ providerWebhook: { enabled: false, endpoint: null, registration: null } });
    if (path.endsWith("/workflows/workflow-generic")) return send({ workflow });
    if (path.endsWith("/webhook-endpoint")) return send(route.request().method() === "GET" ? { endpoint: null } : { endpoint: { id: "endpoint", path: "generic-hook", secret: "synthetic-header-secret", workflowVersionId: "published", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-generic");
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Webhook endpoint" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await panel.getByRole("button", { name: "Create registration" }).click();
  await expect(panel.getByText("synthetic-header-secret")).toBeVisible();
  await expect(panel.getByText(/send it in the x-workflow-secret header/)).toBeVisible();
  await expect(panel.getByText(/paste it into GitHub/)).toHaveCount(0);
});

test("webhook setup follows published trigger even when the draft differs", async ({ page }) => {
  const graph = (type: string, config: Record<string, string>) => ({ nodes: [{ id: "trigger", type, position: { x: 100, y: 100 }, config }], edges: [] });
  const workflow = { id: "workflow-versions", workspaceId: "workspace-1", name: "Versioned webhook", description: null, isActive: false,
    draft: { id: "draft", version: 3, graph: graph("trigger.github.pull-request-opened", { event: "pull_request", action: "opened", path: "draft-path" }) },
    published: { id: "published-2", version: 2, graph: graph("trigger.github.push", { event: "push", path: "published-path" }) } };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/provider-webhook")) return send({ providerWebhook: { enabled: false, endpoint: null, registration: null } });
    if (path.endsWith("/webhook-endpoint")) return send({ endpoint: { id: "endpoint-1", path: "old-path", signingMode: "registration", workflowVersionId: "published-1", secretRequired: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
    if (path.endsWith("/workflows/workflow-versions")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-versions");
  await page.locator(".react-flow__node").filter({ hasText: "Pull request opened" }).click();
  await expect(page.locator(".inspector-note")).toContainText("not this draft node");
  await page.getByRole("button", { name: "Manage published webhook" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByText(/settings for/)).toContainText("push");
  await expect(panel.getByText(/settings for/)).not.toContainText("pull_request");
  await expect(panel.getByText(/still uses an older published version/)).toBeVisible();
  await expect(panel.getByLabel("Public path")).toHaveValue("old-path");
});

test("webhook registration stays disabled when the trigger exists only in the draft", async ({ page }) => {
  const draftGraph = { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 100, y: 100 }, config: { path: "github-push", event: "push" } }], edges: [] };
  const workflow = { id: "workflow-draft", workspaceId: "workspace-1", name: "Draft webhook", description: null, isActive: false, draft: { id: "draft", version: 2, graph: draftGraph }, published: { id: "published", version: 1, graph: { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} }], edges: [] } } };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/provider-webhook")) return send({ providerWebhook: { enabled: false, endpoint: null, registration: null } });
    if (path.endsWith("/webhook-endpoint")) return send({ endpoint: null });
    if (path.endsWith("/workflows/workflow-draft")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-draft");
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Webhook endpoint" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(panel.getByText(/Publish a version containing this webhook trigger/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Create registration" })).toBeDisabled();
});

test("a second draft webhook does not open the first trigger's setup", async ({ page }) => {
  const graph = { nodes: [
    { id: "first", type: "trigger.github.push", position: { x: 100, y: 100 }, config: { path: "first", event: "push" } },
    { id: "second", type: "trigger.github.pull-request-opened", position: { x: 500, y: 100 }, config: { path: "second", event: "pull_request", action: "opened" } },
  ], edges: [] };
  const workflow = { id: "workflow-multiple", workspaceId: "workspace-1", name: "Multiple triggers", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/provider-webhook")) return send({ providerWebhook: { enabled: false, endpoint: null, registration: null } });
    if (path.endsWith("/workflows/workflow-multiple")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-multiple");
  await page.locator(".react-flow__node").filter({ hasText: "Pull request opened" }).click();
  await expect(page.locator(".inspector-note")).toContainText("multiple webhook triggers");
  await expect(page.getByRole("button", { name: "Configure webhook" })).toHaveCount(0);
});

test("GitHub registration is readable and protects existing secrets while loading and rotating", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 820 });
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
    if (path.endsWith("/provider-webhook")) return send({ providerWebhook: { enabled: false, endpoint: null, registration: null } });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") {
        if (statusUnavailable) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Status unavailable" }) });
        await gate;
        return send({ endpoint: { id: "endpoint-1", path: "existing-path", signingMode: "legacy", workflowVersionId: "version-1", secretRequired: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
      }
      writes++;
      if (writes === 2) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "The webhook registration changed. Reload its status before trying again." }) });
      expect(route.request().postDataJSON()).toMatchObject({ publishedVersionId: "version-1", expectedEndpoint: { id: "endpoint-1", updatedAt: "2026-01-01" } });
      return send({ endpoint: { id: "endpoint-1", path: "existing-path", secret: "test-registration-secret", workflowVersionId: "version-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" } });
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
  await page.getByRole("button", { name: "Configure webhook" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await expect(page.getByRole("dialog", { name: "Node inspector" })).toHaveCount(0);
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
  await panel.getByRole("button", { name: "Rotate registration" }).click();
  await panel.getByRole("button", { name: "Confirm rotation" }).click();
  await expect(panel.getByText("The webhook registration changed. Reload its status before trying again.")).toBeVisible();
});

test("a lost rotation response clears the old secret and reloads endpoint status", async ({ page }) => {
  const graph = { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 100, y: 100 }, config: { path: "github-push", event: "push" } }], edges: [] };
  const workflow = { id: "workflow-error", workspaceId: "workspace-1", name: "Uncertain rotation", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: { id: "published", version: 1, graph } };
  let reads = 0;
  let writes = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (path.endsWith("/provider-webhook")) return send({ providerWebhook: { enabled: false, endpoint: null, registration: null } });
    if (path.endsWith("/workflows/workflow-error")) return send({ workflow });
    if (path.endsWith("/webhook-endpoint")) {
      if (route.request().method() === "GET") {
        reads++;
        return send({ endpoint: writes === 0 ? null : { id: "endpoint-1", path: "github-push", signingMode: "registration", workflowVersionId: "published", secretRequired: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
      }
      writes++;
      if (writes === 1) return send({ endpoint: { id: "endpoint-1", path: "github-push", secret: "old-test-secret", workflowVersionId: "published", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" } });
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-error");
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Webhook endpoint" }).click();
  const panel = page.getByRole("dialog", { name: "Webhook endpoint" });
  await panel.getByRole("button", { name: "Create registration" }).click();
  await expect(panel.getByText("old-test-secret")).toBeVisible();
  const readsBeforeRotation = reads;
  await panel.getByRole("button", { name: "Rotate registration" }).click();
  await panel.getByRole("button", { name: "Confirm rotation" }).click();
  await expect(panel.getByText("old-test-secret")).toHaveCount(0);
  await expect(panel.getByText(/endpoint may have changed/)).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThan(readsBeforeRotation);
  await expect(panel.getByRole("button", { name: "Rotate registration" })).toBeEnabled();
  expect(writes).toBe(2);
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
  const searchBox = await picker.getByLabel("Repository search").boundingBox();
  const selectBox = await picker.getByLabel("Repository", { exact: true }).boundingBox();
  expect(searchBox).not.toBeNull();
  expect(selectBox).not.toBeNull();
  expect(selectBox!.y - (searchBox!.y + searchBox!.height)).toBeGreaterThanOrEqual(6);
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
