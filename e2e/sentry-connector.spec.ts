import { expect, test } from "@playwright/test";

test("Sentry setup selects organization and project and clears stale projects", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "sentry", type: "action.sentry.list-issues", position: { x: 400, y: 100 }, config: { credentialId: "sentry-1", organization: "org-one", project: "web", status: "unresolved", limit: 20 } },
  ], edges: [] };
  const workflow = { id: "sentry-test", workspaceId: "workspace-1", name: "Sentry test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "sentry-1", provider: "SENTRY", label: "My Sentry" }] });
    if (path.endsWith("/sentry/organizations")) return send({ organizations: [{ id: "org-one", name: "First org" }, { id: "org-two", name: "Second org" }] });
    if (path.endsWith("/sentry/projects")) return send({ projects: url.searchParams.get("organization") === "org-one" ? [{ id: "web", name: "Web" }] : [] });
    if (path.endsWith("/workflows/sentry-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=sentry-test");
  await page.locator(".react-flow__node").filter({ hasText: "List issues" }).click();
  await expect(page.getByLabel("Sentry connection")).toHaveValue("sentry-1");
  const organization = page.getByRole("group", { name: "Organization" }).getByRole("combobox");
  const project = page.getByRole("group", { name: "Project" }).getByRole("combobox");
  await expect(organization.getByRole("option", { name: "First org" })).toHaveAttribute("value", "org-one");
  await expect(project).toHaveValue("web");
  await organization.selectOption("org-two");
  await expect(project).toHaveValue("");
  await expect(page.getByLabel("Issue status")).toHaveValue("unresolved");
});
