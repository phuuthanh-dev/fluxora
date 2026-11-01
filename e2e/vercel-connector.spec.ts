import { expect, test } from "@playwright/test";

test("Vercel setup chooses account and project and clears the previous project", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "vercel", type: "action.vercel.list-deployments", position: { x: 400, y: 100 }, config: { credentialId: "vercel-1", team: "personal", project: "prj_abc", limit: 20 } },
  ], edges: [] };
  const workflow = { id: "vercel-test", workspaceId: "workspace-1", name: "Vercel test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "vercel-1", provider: "VERCEL", label: "My Vercel" }] });
    if (path.endsWith("/vercel/teams")) return send({ teams: [{ id: "personal", name: "Personal account" }, { id: "team_abc", name: "Team" }] });
    if (path.endsWith("/vercel/projects")) return send({ projects: url.searchParams.get("team") === "personal" ? [{ id: "prj_abc", name: "Web" }] : [] });
    if (path.endsWith("/workflows/vercel-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=vercel-test");
  await page.locator(".react-flow__node").filter({ hasText: "List deployments" }).click();
  await expect(page.getByLabel("Vercel connection")).toHaveValue("vercel-1");
  const team = page.getByRole("group", { name: "Account or team" }).getByRole("combobox");
  const project = page.getByRole("group", { name: "Project" }).getByRole("combobox");
  await expect(team.getByRole("option", { name: "Team" })).toHaveAttribute("value", "team_abc");
  await expect(project).toHaveValue("prj_abc");
  await team.selectOption("team_abc");
  await expect(project).toHaveValue("");
});
