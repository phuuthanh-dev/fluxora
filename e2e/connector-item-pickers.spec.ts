import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) test(`connector resource choices, search, paging and stale parents (${theme})`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript((value) => localStorage.setItem("fluxora-theme", value), theme);
  const nodes = [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "jira", type: "action.jira.update-issue", position: { x: 300, y: 0 }, config: { credentialId: "jira", issue: "TEST-7", summary: "Updated" } },
    { id: "gitlab", type: "action.gitlab.get-pipeline", position: { x: 600, y: 0 }, config: { credentialId: "gitlab", project: "42", pipeline: "999" } },
    { id: "mr", type: "action.gitlab.get-merge-request", position: { x: 0, y: 220 }, config: { credentialId: "gitlab", project: "42", mergeRequest: "7" } },
    { id: "labels", type: "action.github", position: { x: 300, y: 220 }, config: { credentialId: "github", repository: "owner/repo", title: "Test", labels: [] } },
    { id: "sentry", type: "action.sentry.get-issue", position: { x: 600, y: 220 }, config: { credentialId: "sentry", organization: "acme", project: "web", issueId: "123" } },
    { id: "vercel", type: "action.vercel.public-deployment-lookup", position: { x: 0, y: 440 }, config: { credentialId: "vercel", team: "personal", project: "prj_test", deploymentId: "dpl_test" } },
  ];
  const graph = { nodes, edges: nodes.slice(1).map((n) => ({ id: `e-${n.id}`, source: "manual", target: n.id, kind: "success" })) };
  const workflow = { id: "items", name: "Resource choices", workspaceId: "workspace", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  let saved: typeof graph | undefined;
  const queries: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (data: unknown) => route.fulfill({ json: data });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user", displayName: "Test user", email: "test@example.test" } });
    if (url.pathname.endsWith("/auth/identities")) return send({ identities: [] });
    if (url.pathname.endsWith("/auth/providers")) return send({ google: false, github: false, steam: false });
    if (url.pathname.endsWith("/admin/access")) return route.fulfill({ status: 403, json: { message: "Forbidden" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Test workspace" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: ["jira", "gitlab", "github", "sentry", "vercel"].map((id) => ({ id, provider: id.toUpperCase(), label: id })) });
    if (url.pathname.endsWith("/draft") && route.request().method() === "PATCH") { saved = route.request().postDataJSON().graph; return send({ workflow: { ...workflow, draft: { ...workflow.draft, graph: saved } } }); }
    if (url.pathname.endsWith("/workflows/items")) return send({ workflow });
    if (url.pathname.endsWith("/gitlab/projects")) return send({ projects: [{ id: "42", name: "Test project" }, { id: "43", name: "Other project" }] });
    if (url.pathname.endsWith("/github/repositories")) return send({ repositories: [{ id: 1, fullName: "owner/repo", private: true }], nextPage: null });
    if (url.pathname.endsWith("/sentry/organizations")) return send({ organizations: [{ id: "acme", name: "Acme" }] });
    if (url.pathname.endsWith("/sentry/projects")) return send({ projects: [{ id: "web", name: "Web" }] });
    if (url.pathname.endsWith("/vercel/teams")) return send({ teams: [{ id: "personal", name: "Personal account" }] });
    if (url.pathname.endsWith("/vercel/projects")) return send({ projects: [{ id: "prj_test", name: "Test project" }] });
    if (url.pathname.includes("/items/")) {
      const resource = url.pathname.split("/").at(-1);
      if (resource === "jira-issue") {
        queries.push(url.searchParams.get("query") ?? "");
        return send({ items: [{ id: "TEST-7", name: `TEST-7 · ${url.searchParams.get("query") || "Fix login"}` }], nextCursor: url.searchParams.has("cursor") ? null : "next" });
      }
      const items = resource === "github-label" ? [{ id: "type, bug", name: "type, bug" }, { id: "urgent", name: "urgent" }]
        : resource === "gitlab-pipeline" ? url.searchParams.get("parent") === "43" ? [] : [{ id: "999", name: "#999 · success · main" }]
        : resource === "gitlab-merge-request" ? [{ id: "7", name: "#7 · Fix login" }]
        : resource === "sentry-issue" ? [{ id: "123", name: "WEB-1 · Error" }]
        : [{ id: "dpl_test", name: "Preview · READY · dpl_test" }];
      return send({ items, nextCursor: null });
    }
    if (url.pathname.endsWith("/executions")) return send({ executions: [] });
    return send({});
  });
  await page.goto("/editor?workflow=items");
  await page.getByRole("button", { name: "Collapse node palette" }).click();
  await page.getByRole("button", { name: "Fit canvas" }).click();
  const node = async (id: string) => page.getByTestId(`rf__node-${id}`).click();
  await node("jira");
  const issue = page.getByRole("group", { name: "Issue", exact: true });
  await expect(issue.getByRole("combobox")).toHaveValue("TEST-7");
  await issue.getByLabel("Issue search").fill("billing");
  await expect(issue.getByRole("option", { name: "TEST-7 · billing" })).toHaveCount(1);
  expect(queries).toContain("billing");
  await issue.getByRole("button", { name: "Load more issues" }).click();
  await expect(issue.getByRole("button", { name: "Load more issues" })).toHaveCount(0);
  await issue.getByRole("button", { name: "Enter value or expression" }).click();
  await issue.getByLabel("Issue value").fill("");
  await issue.getByLabel("Issue value").focus();
  await page.getByText("Use data from an earlier step", { exact: true }).click();
  await expect(page.getByText("Inserting into: Issue value")).toBeVisible();
  await page.getByLabel("Mapping source step").selectOption("manual");
  await page.getByRole("button", { name: "{{ steps.manual.output.received }}", exact: true }).click();
  await expect(issue.getByLabel("Issue value")).toHaveValue("{{ steps.manual.output.received }}");
  await issue.getByLabel("Issue value").fill("");
  const suggestion = page.getByRole("button", { name: "{{ steps.manual.output.received }}", exact: true });
  await suggestion.scrollIntoViewIfNeeded();
  const sourceBox = (await suggestion.boundingBox())!;
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2 - 15, { steps: 5 });
  await issue.getByLabel("Issue value").scrollIntoViewIfNeeded();
  const destinationBox = (await issue.getByLabel("Issue value").boundingBox())!;
  await page.mouse.move(destinationBox.x + destinationBox.width / 2, destinationBox.y + destinationBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(issue.getByLabel("Issue value")).toHaveValue("{{ steps.manual.output.received }}");
  await node("gitlab");
  await expect(page.getByRole("group", { name: "Pipeline", exact: true }).getByRole("combobox")).toHaveValue("999");
  await page.getByRole("group", { name: "Project", exact: true }).getByRole("combobox").selectOption("43");
  await expect(page.getByRole("group", { name: "Pipeline", exact: true }).getByRole("combobox")).toHaveValue("");
  await node("mr");
  await expect(page.getByRole("option", { name: "#7 · Fix login" })).toHaveAttribute("value", "7");
  await node("labels");
  const labels = page.getByRole("group", { name: "Labels (optional)", exact: true });
  await labels.getByRole("combobox").selectOption("type, bug");
  await labels.getByRole("combobox").selectOption("urgent");
  await expect(labels.getByRole("button", { name: "Remove label type, bug" })).toBeVisible();
  await node("sentry");
  await expect(page.getByRole("option", { name: "WEB-1 · Error" })).toHaveAttribute("value", "123");
  await node("vercel");
  await expect(page.getByRole("option", { name: "Preview · READY · dpl_test" })).toHaveAttribute("value", "dpl_test");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.nodes.find((n) => n.id === "labels")?.config.labels).toEqual(["type, bug", "urgent"]);
  await page.screenshot({ path: testInfo.outputPath(`resource-picker-${theme}.png`), animations: "disabled" });
});
