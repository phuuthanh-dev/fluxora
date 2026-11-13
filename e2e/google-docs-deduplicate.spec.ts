import { expect, test } from "@playwright/test";

test("Google Docs discovery and duplicate comparison can be configured in the editor", async ({ page }) => {
  const graph = { nodes: [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "unique", type: "action.remove-duplicates", position: { x: 350, y: 0 }, config: { compare: "all" } },
    { id: "document", type: "action.google-docs.update", position: { x: 700, y: 0 }, config: { credentialId: "google", documentId: "doc-1", operation: "append", text: "Example" } },
  ], edges: [{ id: "first", source: "start", target: "unique", kind: "success" }, { id: "second", source: "unique", target: "document", kind: "success" }] };
  const workflow = { id: "docs-test", workspaceId: "workspace", name: "Docs test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  let saved: { nodes: Array<{ id: string; config: Record<string, unknown> }> } | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "owner", displayName: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/auth/identities")) return send({ identities: [] });
    if (url.pathname.endsWith("/auth/providers")) return send({ google: false, github: false, steam: false });
    if (url.pathname.endsWith("/admin/access")) return route.fulfill({ status: 403, body: "{}" });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "workspace", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google", provider: "GOOGLE", label: "Google" }] });
    if (url.pathname.endsWith("/google/files")) { expect(url.searchParams.get("kind")).toBe("document"); return send({ files: [{ id: "doc-1", name: "Example document" }], nextPageToken: null }); }
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/draft")) { saved = route.request().postDataJSON().graph; return send({ workflow }); }
    if (url.pathname.endsWith("/workflows/docs-test")) return send({ workflow });
    return send({});
  });
  await page.goto("/editor?workflow=docs-test");
  await page.getByRole("button", { name: "Collapse node palette" }).click();
  await page.getByRole("button", { name: "Fit canvas" }).click();
  await page.locator('.react-flow__node[data-id="unique"]').getByRole("heading", { level: 3 }).click();
  await page.getByLabel("Compare", { exact: true }).selectOption("selected");
  await page.getByLabel("Fields to compare").fill("customer.id, email");
  await page.locator('.react-flow__node[data-id="document"]').getByRole("heading", { level: 3 }).click();
  await expect(page.getByRole("group", { name: "Document", exact: true }).getByRole("option", { name: "Example document" })).toBeAttached();
  await page.getByLabel("Action", { exact: true }).selectOption("replace");
  await page.getByLabel("Text to find").fill("before");
  await page.getByLabel("Text", { exact: true }).fill("after");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.nodes.find((node) => node.id === "unique")?.config.fields).toBe("customer.id, email");
  expect(saved?.nodes.find((node) => node.id === "document")?.config).toMatchObject({ documentId: "doc-1", operation: "replace", find: "before", text: "after" });
});
