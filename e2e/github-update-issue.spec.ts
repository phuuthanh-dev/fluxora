import { expect, test } from "@playwright/test";

test("GitHub issue update guides the selected field and shows the concurrency limit", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "issue", type: "action.github.update-issue", position: { x: 400, y: 100 }, config: { credentialId: "github-1", repository: "owner/repo", issueNumber: "42", field: "title", title: "Updated", body: "", state: "open" } },
  ], edges: [] };
  const workflow = { id: "github-update-test", workspaceId: "workspace-1", name: "GitHub test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "github-1", provider: "GITHUB", label: "My GitHub" }] });
    if (path.endsWith("/github/repositories")) return send({ repositories: [{ id: 1, fullName: "owner/repo", private: false }, { id: 2, fullName: "owner/other", private: false }] });
    if (path.endsWith("/github/issues")) return send({ items: [{ id: "42", name: "#42 · Example issue" }], nextPage: null });
    if (path.endsWith("/workflows/github-update-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=github-update-test");
  await page.locator(".react-flow__node").filter({ hasText: "Update issue" }).click();
  await expect(page.getByLabel("GitHub credential")).toHaveValue("github-1");
  await expect(page.getByRole("group", { name: "Issue number" }).getByRole("combobox")).toHaveValue("42");
  await expect(page.getByLabel("New title")).toHaveValue("Updated");
  await expect(page.getByText(/can overwrite someone else's concurrent change/)).toBeVisible();
  await page.getByLabel("Field to update").selectOption("body");
  await expect(page.getByLabel("New description (empty clears it)")).toBeVisible();
  await expect(page.getByLabel("New title")).toHaveCount(0);
  await page.getByLabel("Field to update").selectOption("state");
  await expect(page.getByLabel("New state")).toHaveValue("open");
  await page.getByRole("group", { name: "Repository", exact: true }).getByRole("combobox", { name: "Repository", exact: true }).selectOption("owner/other");
  await expect(page.getByRole("group", { name: "Issue number" }).getByRole("combobox")).toHaveValue("");
});
