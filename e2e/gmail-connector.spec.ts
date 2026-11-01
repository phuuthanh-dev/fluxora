import { expect, test } from "@playwright/test";

test("Gmail uses a dedicated connection and guided inbox filter", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "gmail", type: "action.gmail.read", position: { x: 400, y: 100 }, config: { credentialId: "gmail-1", mailbox: "unread", query: "", limit: 5 } },
  ], edges: [] };
  const workflow = { id: "gmail-test", workspaceId: "workspace-1", name: "Gmail test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "gmail-1", provider: "GMAIL", label: "My Gmail" }] });
    if (path.endsWith("/gmail/labels")) return send({ labels: [{ id: "Label_1", name: "Support" }], hasMore: false });
    if (path.endsWith("/workflows/gmail-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=gmail-test");
  await page.locator(".react-flow__node").filter({ hasText: "Read messages" }).click();
  await expect(page.getByLabel("Gmail credential")).toHaveValue("gmail-1");
  await expect(page.getByLabel("Messages", { exact: true })).toHaveValue("unread");
  await expect(page.getByLabel("Maximum messages (1–10)")).toHaveValue("5");
  await page.getByLabel("Messages", { exact: true }).selectOption("inbox");
  await expect(page.getByLabel("Messages", { exact: true })).toHaveValue("inbox");
});

test("Gmail trigger shows polling choices and requires confirmation before checkpoint reset", async ({ page }) => {
  const graph = { nodes: [{ id: "mail", type: "trigger.gmail", position: { x: 100, y: 100 }, config: { credentialId: "gmail-1", mailbox: "inbox", pollMinutes: "5" } }], edges: [] };
  const workflow = { id: "gmail-trigger-test", workspaceId: "workspace-1", name: "Gmail trigger", description: null, isActive: false, draft: { id: "draft", version: 2, graph }, published: { id: "published", version: 1, graph } };
  let resets = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "gmail-1", provider: "GMAIL", label: "My Gmail" }] });
    if (path.endsWith("/gmail/labels")) return send({ labels: [{ id: "Label_1", name: "Support" }], hasMore: false });
    if (path.endsWith("/workflows/gmail-trigger-test")) return send({ workflow });
    if (path.endsWith("/gmail-trigger-status")) return send({ active: false, checkpoints: [{ nodeId: "mail", state: "ERROR", lastErrorCode: "GMAIL_HISTORY_EXPIRED" }] });
    if (path.endsWith("/gmail-trigger-reset")) { resets++; return send({ success: true }); }
    return route.continue();
  });
  await page.goto("/editor?workflow=gmail-trigger-test");
  await page.locator(".react-flow__node").filter({ hasText: "New message" }).click();
  await expect(page.getByLabel("Check for new mail")).toHaveValue("5");
  await page.getByRole("combobox", { name: "Label (optional)" }).selectOption("Label_1");
  await expect(page.getByRole("combobox", { name: "Label (optional)" })).toHaveValue("Label_1");
  await expect(page.getByText(/Gmail history is no longer available/)).toBeVisible();
  await page.getByRole("button", { name: "Reset checkpoint…" }).click();
  await expect(page.getByRole("dialog", { name: "Reset Gmail checkpoint" })).toContainText("permanently missed");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(resets).toBe(0);
});
