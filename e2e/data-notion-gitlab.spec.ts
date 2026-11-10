import { expect, test } from "@playwright/test";

test("data nodes, typed Notion properties and GitLab selectors remain editable and save their configuration", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const sourceId = "00000000-0000-4000-8000-000000000001";
  const nodes = [
    { id: "merge", type: "action.merge", config: {} },
    { id: "aggregate", type: "action.aggregate", config: { outputField: "data" } },
    { id: "split", type: "action.split-out", config: { field: "data", include: "none" } },
    { id: "sort", type: "action.sort", config: { field: "score", valueType: "number", direction: "asc" } },
    { id: "limit", type: "action.limit", config: { maxItems: 10, keep: "first" } },
    { id: "notion", type: "action.notion.create-entry", config: { credentialId: "notion", dataSourceId: sourceId, properties: [] } },
    { id: "gitlab", type: "action.gitlab.add-comment", config: { credentialId: "gitlab", project: "42", issue: "3", body: "Example" } },
    { id: "jira", type: "action.jira.create-issue", config: { credentialId: "jira", project: "", issueType: "", summary: "" } },
  ].map((node, index) => ({ ...node, position: { x: index % 3 * 420, y: Math.floor(index / 3) * 220 } }));
  nodes.push({ id: "start", type: "trigger.manual", config: {}, position: { x: 0, y: -150 } });
  const graph = { nodes, edges: [
    { id: "start-aggregate", source: "start", target: "aggregate", kind: "success" },
    { id: "aggregate-split", source: "aggregate", target: "split", kind: "success" },
    { id: "split-sort", source: "split", target: "sort", kind: "success" },
    { id: "sort-limit", source: "sort", target: "limit", kind: "success" },
    { id: "limit-merge", source: "limit", target: "merge", targetHandle: "input1", kind: "success" },
    { id: "start-merge", source: "start", target: "merge", targetHandle: "input2", kind: "success" },
    { id: "merge-notion", source: "merge", target: "notion", kind: "success" },
    { id: "notion-gitlab", source: "notion", target: "gitlab", kind: "success" },
    { id: "gitlab-jira", source: "gitlab", target: "jira", kind: "success" },
  ] };
  const workflow = { id: "data-connectors", workspaceId: "workspace", name: "Data and connectors", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  let saved: { nodes: Array<{ id: string; config: Record<string, unknown> }> } | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "owner", displayName: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/auth/identities")) return send({ identities: [] });
    if (url.pathname.endsWith("/auth/providers")) return send({ google: false, github: false, steam: false });
    if (url.pathname.endsWith("/admin/access")) return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Forbidden"}' });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "workspace", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "notion", provider: "NOTION", label: "Notion" }, { id: "gitlab", provider: "GITLAB", label: "GitLab" }, { id: "jira", provider: "JIRA", label: "Jira", isManaged: true }] });
    if (url.pathname.endsWith("/notion/data-sources")) return send({ sources: [{ id: sourceId, name: "Tasks" }, { id: "00000000-0000-4000-8000-000000000002", name: "Other tasks" }], hasMore: false });
    if (url.pathname.endsWith("/notion/writable-properties")) return send({ properties: [{ id: "title", name: "Name", type: "title" }, { id: "score", name: "Score", type: "number" }, { id: "state", name: "Stage", type: "status", options: [{ id: "done", name: "Done" }] }, { id: "check", name: "Completed", type: "checkbox" }], hasMore: false });
    if (url.pathname.endsWith("/jira/projects")) return send({ projects: [{ id: "100", name: "Demo project" }], hasMore: false });
    if (url.pathname.endsWith("/jira/issue-types")) return send({ issueTypes: [{ id: "101", name: "Task" }], hasMore: false });
    if (url.pathname.endsWith("/gitlab/projects")) return send({ projects: [{ id: "42", name: "team/project" }, { id: "43", name: "team/other" }], nextPage: null });
    if (url.pathname.endsWith("/gitlab/issues")) return send({ items: url.searchParams.get("project") === "42" ? [{ id: "3", name: "#3 · Example issue" }] : [{ id: "8", name: "#8 · Another issue" }], nextPage: null });
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/draft")) { saved = route.request().postDataJSON().graph; return send({ workflow }); }
    if (url.pathname.endsWith("/workflows/data-connectors")) return send({ workflow });
    return send({});
  });
  await page.goto("/editor?workflow=data-connectors");
  await page.getByRole("button", { name: "Collapse node palette" }).click();
  await page.getByRole("button", { name: "Fit canvas" }).click();
  const selectNode = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`).click();
  await selectNode("merge");
  await page.getByLabel("Mode", { exact: true }).selectOption("matching");
  await page.getByLabel("Input 1 matching field").fill("customer.id");
  await page.getByLabel("Input 2 matching field").fill("id");
  await page.getByLabel("Output", { exact: true }).selectOption("enrich-input1");
  await selectNode("aggregate"); await page.getByLabel("Put all items in field").fill("entries");
  await selectNode("split"); await page.getByLabel("Array field to split").fill("entries");
  await selectNode("sort"); await page.getByLabel("Order", { exact: true }).selectOption("desc");
  await selectNode("limit"); await page.getByLabel("Maximum items (0–100)").fill("2");
  await expect(page.getByRole("button", { name: "Enter expression", exact: true })).toHaveCount(0);
  await selectNode("notion");
  const add = page.getByLabel("Add a property", { exact: true });
  await add.selectOption("title"); await page.getByLabel("Name", { exact: true }).fill("Daily report");
  await add.selectOption("score"); await page.getByLabel("Score", { exact: true }).fill("7.5");
  await add.selectOption("state"); await page.getByLabel("Stage", { exact: true }).selectOption("done");
  await add.selectOption("check"); await page.getByLabel("Completed", { exact: true }).check();
  for (const theme of ["light", "dark"]) {
    const toggle = page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.locator("#node-inspector").getByRole("heading", { name: "Notion · Create database page", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`typed-properties-${theme}.png`) });
  }
  await selectNode("gitlab");
  await expect(page.getByRole("group", { name: "Project", exact: true }).getByRole("combobox")).toHaveValue("42");
  await expect(page.getByRole("group", { name: "Issue", exact: true }).getByRole("option", { name: "#3 · Example issue" })).toBeAttached();
  await page.getByRole("group", { name: "Project", exact: true }).getByRole("combobox").selectOption("43");
  await expect(page.getByRole("group", { name: "Issue", exact: true }).getByRole("combobox")).toHaveValue("");
  await page.getByRole("group", { name: "Issue", exact: true }).getByRole("combobox").selectOption("8");
  await selectNode("jira");
  await page.getByRole("group", { name: "Project", exact: true }).getByRole("combobox").selectOption("100");
  await page.getByRole("group", { name: "Issue type", exact: true }).getByRole("combobox").selectOption("101");
  await page.getByLabel("Summary", { exact: true }).fill("Demo issue");
  for (const theme of ["light", "dark"]) {
    const toggle = page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("group", { name: "Issue type", exact: true })).toBeVisible();
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`jira-picker-${theme}.png`) });
  }
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.nodes.find((node) => node.id === "limit")?.config.maxItems).toBe(2);
  expect(saved?.nodes.find((node) => node.id === "merge")?.config).toMatchObject({ mode: "matching", field1: "customer.id", field2: "id", outputType: "enrich-input1" });
  expect(saved?.nodes.find((node) => node.id === "notion")?.config.properties).toEqual([{ id: "title", type: "title", value: "Daily report" }, { id: "score", type: "number", value: 7.5 }, { id: "state", type: "status", value: "done" }, { id: "check", type: "checkbox", value: true }]);
  expect(saved?.nodes.find((node) => node.id === "gitlab")?.config).toMatchObject({ project: "43", issue: "8" });
  expect(saved?.nodes.find((node) => node.id === "jira")?.config).toMatchObject({ project: "100", issueType: "101", summary: "Demo issue" });
  await selectNode("notion");
  await page.getByRole("group", { name: "Data source", exact: true }).getByRole("combobox").selectOption("00000000-0000-4000-8000-000000000002");
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
});
