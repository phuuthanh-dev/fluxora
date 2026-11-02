import { expect, test } from "@playwright/test";

test("Sheets mapping is opt-in, staged and position preserving", async ({ page }) => {
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 10, y: 350 }, config: {} },
    { id: "sheets", type: "action.google-sheets", position: { x: 100, y: 100 }, config: { credentialId: "google-1", spreadsheetId: "book-1", operation: "append", range: "Old!D5:F", values: [["old", 42], ["keep", true]] } },
  ], edges: [] };
  const workflow = { id: "workflow-sheets", workspaceId: "workspace-1", name: "Sheets test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  let headerRequests = 0;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/auth/identities")) return send({ identities: [] });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google-1", provider: "GOOGLE", label: "Google" }] });
    if (url.pathname.endsWith("/google/files")) return send({ files: [{ id: "book-1", name: "Book" }], nextPageToken: null });
    if (url.pathname.endsWith("/google/sheets/tabs")) { expect(url.searchParams.get("spreadsheetId")).toBe("book-1"); return send({ tabs: [{ id: 1, title: "Bob's tab" }], hasMore: false }); }
    if (url.pathname.endsWith("/google/sheets/headers")) { headerRequests++; expect(url.searchParams.get("sheet")).toBe("Bob's tab"); return send({ headers: [{ column: 1, name: "Name" }, { column: 2, name: "" }, { column: 3, name: "Name" }], columnLimit: 100 }); }
    if (url.pathname.endsWith("/workflows/workflow-sheets")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-sheets");
  await page.getByTestId("rf__node-sheets").click();
  await expect(page.getByLabel("Range", { exact: true })).toHaveValue("Old!D5:F");
  expect(headerRequests).toBe(0);
  await page.getByRole("button", { name: "Load tabs" }).click();
  await page.getByLabel("Sheet tab", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Preview selected tab" }).click();
  await expect(page.getByRole("button", { name: "Run test" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByLabel("Range", { exact: true })).toHaveValue("Old!D5:F");
  expect(headerRequests).toBe(0);
  await page.getByRole("button", { name: "Read headers" }).click();
  await expect(page.getByText("(blank header)")).toBeVisible();
  expect(headerRequests).toBe(1);
  await page.getByRole("button", { name: "Prepare one append row" }).click();
  await page.getByLabel("Value for column A").fill("{{ steps.manual.output.name }}");
  await page.getByLabel("Value for column C").fill("last");
  await page.getByRole("button", { name: "Apply preview" }).click();
  await expect(page.getByLabel("Range", { exact: true })).toHaveValue("'Bob''s tab'!A1");
  await expect(page.getByLabel("Values row 1 column 1")).toHaveValue("{{ steps.manual.output.name }}");
  await expect(page.getByLabel("Values row 1 column 2")).toHaveValue("");
  await expect(page.getByLabel("Values row 1 column 3")).toHaveValue("last");
  await expect(page.getByRole("button", { name: "Run test" })).toBeEnabled();
});

test("Sheets denial and stale previews preserve manual values", async ({ page }) => {
  const graph = { nodes: [{ id: "sheets", type: "action.google-sheets", position: { x: 100, y: 100 }, config: { credentialId: "google-1", spreadsheetId: "book-1", operation: "read", range: "Sheet1!A1", values: [["unchanged"]] } }], edges: [] };
  const workflow = { id: "workflow-sheets", workspaceId: "workspace-1", name: "Sheets test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/auth/identities")) return send({ identities: [] });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google-1", provider: "GOOGLE", label: "Google" }] });
    if (url.pathname.endsWith("/google/files")) return send({ files: [{ id: "book-1", name: "Book" }], nextPageToken: null });
    if (url.pathname.endsWith("/google/sheets/tabs")) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "GOOGLE_SHEETS_DISCOVERY_DENIED", message: "Enter a range manually or use an expression." }) });
    if (url.pathname.endsWith("/workflows/workflow-sheets")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=workflow-sheets");
  await page.getByTestId("rf__node-sheets").click();
  await page.getByRole("button", { name: "Load tabs" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter a range manually" })).toBeVisible();
  await page.getByLabel("Or enter a tab name").fill("Sheet2");
  await page.getByRole("button", { name: "Preview entered tab" }).click();
  await page.getByLabel("Range", { exact: true }).fill("{{ steps.manual.output.range }}");
  await expect(page.getByRole("button", { name: "Apply preview" })).toBeDisabled();
  await page.getByRole("button", { name: "Discard preview" }).click();
  await expect(page.getByLabel("Range", { exact: true })).toHaveValue("{{ steps.manual.output.range }}");
});

test("read tab preview covers rows and discloses the header row", async ({ page }) => {
  const graph = { nodes: [{ id: "sheets", type: "action.google-sheets", position: { x: 100, y: 100 }, config: { credentialId: "google-1", spreadsheetId: "book-1", operation: "read", range: "Old!D3:D4", values: [["preserve"]] } }], edges: [] };
  const workflow = { id: "workflow-sheets-read", workspaceId: "workspace-1", name: "Sheets read", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/auth/identities")) return send({ identities: [] });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google-1", provider: "GOOGLE", label: "Google" }] });
    if (url.pathname.endsWith("/google/files")) return send({ files: [{ id: "book-1", name: "Book" }], nextPageToken: null });
    if (url.pathname.endsWith("/workflows/workflow-sheets-read")) return send({ workflow });
    return send({});
  });
  await page.goto("/editor?workflow=workflow-sheets-read");
  await page.getByTestId("rf__node-sheets").click();
  await page.getByLabel("Or enter a tab name").fill("Bob's tab");
  await page.getByRole("button", { name: "Preview entered tab" }).click();
  await expect(page.getByText(/Reads all rows in columns A–CV, including the header row/)).toBeVisible();
  await expect(page.getByLabel("Range", { exact: true })).toHaveValue("Old!D3:D4");
  await page.getByRole("button", { name: "Apply preview" }).click();
  await expect(page.getByLabel("Range", { exact: true })).toHaveValue("'Bob''s tab'!A:CV");
  expect(JSON.parse(await page.getByLabel("Node JSON configuration").inputValue()).values).toEqual([["preserve"]]);
});

for (const action of ["Publish", "Run test", "Run node"] as const) {
  for (const edit of ["pending", "applied"] as const) {
    test(`delayed ${action} stops when a Sheets preview is ${edit} during save`, async ({ page }) => {
      const graph = { nodes: [
        { id: "manual", type: "trigger.manual", position: { x: 10, y: 350 }, config: {} },
        { id: "sheets", type: "action.google-sheets", position: { x: 100, y: 100 }, config: { credentialId: "google-1", spreadsheetId: "book-1", operation: "append", range: "Old!A1", values: [["old"]] } },
      ], edges: [] };
      const workflow = { id: "workflow-race", workspaceId: "workspace-1", name: "Save race", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
      let releaseSave: () => void = () => {};
      const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
      let followupRequests = 0;
      let savedRange: unknown;
      await page.route("**/api/v1/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
        if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
        if (url.pathname.endsWith("/auth/identities")) return send({ identities: [] });
        if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
        if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google-1", provider: "GOOGLE", label: "Google" }] });
        if (url.pathname.endsWith("/google/files")) return send({ files: [{ id: "book-1", name: "Book" }], nextPageToken: null });
        if (url.pathname.endsWith("/workflows/workflow-race/draft") && request.method() === "PATCH") {
          const body = request.postDataJSON() as { graph: { nodes: Array<{ id: string; config: { range?: unknown } }> } };
          savedRange = body.graph.nodes.find((node) => node.id === "sheets")?.config.range;
          await saveGate;
          return send({ workflow });
        }
        if (url.pathname.endsWith("/workflows/workflow-race/publish") || url.pathname.endsWith("/workflows/workflow-race/executions")) { followupRequests++; return send({}); }
        if (url.pathname.endsWith("/workflows/workflow-race")) return send({ workflow });
        return send({});
      });
      await page.goto("/editor?workflow=workflow-race");
      await page.getByTestId("rf__node-sheets").click();
      const saving = page.waitForRequest((request) => request.url().endsWith("/workflows/workflow-race/draft") && request.method() === "PATCH");
      await page.getByRole("button", { name: action, exact: true }).click();
      await saving;
      await page.getByLabel("Or enter a tab name").fill("New tab");
      await page.getByRole("button", { name: "Preview entered tab" }).click();
      if (edit === "applied") await page.getByRole("button", { name: "Apply preview" }).click();
      releaseSave();
      if (edit === "pending") {
        await expect(page.getByText(/Apply or discard edits in/)).toBeVisible();
        await expect(page.getByRole("button", { name: "Run test" })).toBeDisabled();
        await expect(page.getByLabel("Range", { exact: true })).toHaveValue("Old!A1");
      } else {
        await expect(page.getByText(/workflow changed while saving/)).toBeVisible();
        await expect(page.getByLabel("Range", { exact: true })).toHaveValue("'New tab'!A1");
      }
      expect(savedRange).toBe("Old!A1");
      expect(followupRequests).toBe(0);
    });
  }
}

test("Sheets preview and node JSON cannot overwrite each other", async ({ page }) => {
  const graph = { nodes: [{ id: "sheets", type: "action.google-sheets", position: { x: 100, y: 100 }, config: { credentialId: "google-1", spreadsheetId: "book-1", operation: "append", range: "Old!A1", values: [["old"]] } }], edges: [] };
  const workflow = { id: "workflow-conflict", workspaceId: "workspace-1", name: "Sheets conflict", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/auth/identities")) return send({ identities: [] });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test", slug: "test", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "google-1", provider: "GOOGLE", label: "Google" }] });
    if (url.pathname.endsWith("/google/files")) return send({ files: [{ id: "book-1", name: "Book" }], nextPageToken: null });
    if (url.pathname.endsWith("/workflows/workflow-conflict")) return send({ workflow });
    return send({});
  });
  await page.goto("/editor?workflow=workflow-conflict");
  await page.getByTestId("rf__node-sheets").click();
  await page.getByLabel("Or enter a tab name").fill("New tab");
  await page.getByRole("button", { name: "Preview entered tab" }).click();
  await page.getByLabel("Node JSON configuration").fill('{"range":"another edit"}');
  await expect(page.getByRole("button", { name: "Apply preview" })).toBeDisabled();
  await page.getByRole("button", { name: "Apply JSON" }).click();
  await expect(page.getByText("Apply or discard the other pending edits for this node first.")).toBeVisible();
  await page.getByRole("button", { name: "Discard JSON changes" }).click();
  await page.getByRole("button", { name: "Apply preview" }).click();
  await expect(page.getByLabel("Range", { exact: true })).toHaveValue("'New tab'!A1");
  expect(JSON.parse(await page.getByLabel("Node JSON configuration").inputValue()).values).toEqual([["old"]]);
});
