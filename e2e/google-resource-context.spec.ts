import { expect, test } from "@playwright/test";

test("Google connection changes clear selected files without deleting prepared Sheets values", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 10, y: 500 }, config: {} },
    { id: "sheets", type: "action.google-sheets", position: { x: 100, y: 100 }, config: { credentialId: "google-1", spreadsheetId: "book-1", operation: "append", range: "Sheet1!A1", values: [["keep"]], valueInputOption: "RAW" } },
    { id: "drive", type: "action.google-drive", position: { x: 100, y: 350 }, config: { credentialId: "google-1", operation: "downloadText", fileId: "file-1" } },
  ], edges: [] };
  const workflow = { id: "google-context-test", workspaceId: "workspace-1", name: "Google context", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  const saves: Array<{ graph: { nodes: Array<{ id: string; config: Record<string, unknown> }> } }> = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google-1", provider: "GOOGLE", label: "First account" }, { id: "google-2", provider: "GOOGLE", label: "Second account" }] });
    if (url.pathname.endsWith("/google/files")) return send({ files: [{ id: "book-1", name: "Book" }, { id: "file-1", name: "File" }], nextPageToken: null });
    if (url.pathname.endsWith("/workflows/google-context-test/draft") && request.method() === "PATCH") {
      const body = request.postDataJSON() as { graph: { nodes: Array<{ id: string; config: Record<string, unknown> }> } };
      saves.push(body); return send({ workflow: { ...workflow, draft: { ...workflow.draft, graph: body.graph } } });
    }
    if (url.pathname.endsWith("/workflows/google-context-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=google-context-test");
  await page.getByTestId("rf__node-sheets").click();
  await page.getByLabel("Google credential").selectOption("google-2");
  await expect(page.getByRole("group", { name: "Spreadsheet" }).getByLabel("Spreadsheet", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Range", { exact: true })).toHaveValue("Sheet1!A1");
  await expect(page.getByLabel("Values row 1 column 1")).toHaveValue("keep");
  await expect(page.getByText(/Changing the connection or spreadsheet keeps the existing range and values/)).toBeVisible();
  await page.getByTestId("rf__node-drive").click();
  await page.getByLabel("Google credential").selectOption("google-2");
  await expect(page.getByRole("group", { name: "Text file" }).getByLabel("Text file", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]!.graph.nodes.find((node) => node.id === "sheets")!.config).toMatchObject({ credentialId: "google-2", spreadsheetId: "", range: "Sheet1!A1", values: [["keep"]] });
  expect(saves[0]!.graph.nodes.find((node) => node.id === "drive")!.config).toMatchObject({ credentialId: "google-2", fileId: "" });
});
