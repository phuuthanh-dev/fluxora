import { expect, test, type Page } from "@playwright/test";

type Provider = "postgres" | "supabase";
type MetadataResponse = { status?: number; body: unknown };
type HarnessOptions = {
  provider?: Provider;
  legacy?: boolean;
  insert?: boolean;
  configOverride?: Record<string, unknown>;
  metadata?: (table: string) => MetadataResponse | Promise<MetadataResponse>;
  clone?: () => Promise<void>;
  save?: () => Promise<void>;
};

function workflow(id: string, provider: Provider, table = "items", legacy = false, insert = false) {
  const config = insert ? { credentialId: "sb-1", table, fields: [] } : provider === "postgres"
    ? { credentialId: "pg-1", schema: "public", table, limit: 20, columns: ["id"], orderBy: "id", orderDirection: "asc", offset: 0, retryAttempts: 2 }
    : { credentialId: "sb-1", table, limit: 20, columns: ["id"], filters: [{ column: "active", operator: "equals", value: true }], order: [{ column: "id", direction: "desc", nulls: "last" }], offset: 0, timeoutMs: 9000 };
  return {
    id, workspaceId: "workspace-1", name: id === "first" ? "First workflow" : "Second workflow", description: null, isActive: false,
    draft: { id: `draft-${id}`, version: 1, graph: { nodes: [
      { id: "manual", type: "trigger.manual", position: { x: 50, y: 100 }, config: {} },
      // Deliberately reuse the node ID in both workflows.
      { id: "relational", type: insert ? "action.supabase.insert-row" : `action.${provider}.select${legacy ? "" : ".v2"}`, ...(legacy ? {} : { nodeVersion: 1 }), position: { x: 420, y: 100 }, config },
    ], edges: [] } }, published: null,
  };
}

async function setup(page: Page, options: HarnessOptions = {}) {
  const provider = options.provider ?? "postgres";
  const first = workflow("first", provider, "items", options.legacy, options.insert);
  Object.assign(first.draft.graph.nodes[1]!.config, options.configOverride);
  const second = workflow("second", provider, "other_items", options.legacy, options.insert);
  const saves: Array<Record<string, unknown>> = [];
  const requests: string[] = [];
  const metadataRequests: Array<{ provider: string; credential: string; table: string | null; schema: string | null }> = [];
  const metadataCompleted: Array<{ table: string | null; status: number }> = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    requests.push(`${request.method()} ${path}`);
    const send = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "pg-1", provider: "POSTGRES", label: "Postgres" }, { id: "pg-2", provider: "POSTGRES", label: "Second Postgres" }, { id: "sb-1", provider: "SUPABASE", label: "Supabase" }] });
    if (path.endsWith("/postgres/schemas")) return send({ schemas: [{ id: "public", name: "public" }, { id: "analytics", name: "analytics" }] });
    if (path.endsWith("/postgres/tables") || path.endsWith("/supabase/tables")) return send({ tables: [{ id: "items", name: "items" }, { id: "other_items", name: "other_items" }] });
    if (path.endsWith("/postgres/columns") || path.endsWith("/supabase/columns")) {
      const endpointProvider = path.includes("/postgres/") ? "postgres" : "supabase";
      metadataRequests.push({ provider: endpointProvider, credential: path.split("/credentials/")[1]!.split("/")[0]!, table: url.searchParams.get("table"), schema: url.searchParams.get("schema") });
      const response = await (options.metadata?.(url.searchParams.get("table") ?? "") ?? { body: { columns: [{ name: "id", type: "integer" }, { name: "active", type: "boolean" }], partial: false, hasMore: false } });
      // The UI may abort an obsolete request before this synthetic response is released.
      try { await send(response.body, response.status ?? 200); metadataCompleted.push({ table: url.searchParams.get("table"), status: response.status ?? 200 }); return; } catch { return; }
    }
    if (path.endsWith("/workspaces/workspace-1/workflows")) return send({ workflows: [first, second] });
    if (path.endsWith("/workflows/first/clone")) {
      await options.clone?.();
      return send({ workflow: second });
    }
    if (path.endsWith("/workflows/first/draft") && request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      saves.push(body);
      await options.save?.();
      return send({ workflow: { ...first, draft: { ...first.draft, graph: body.graph } } });
    }
    if (path.endsWith("/workflows/first")) return send({ workflow: first });
    if (path.endsWith("/workflows/second")) return send({ workflow: second });
    // No real API or provider requests are permitted in these synthetic tests.
    return route.abort();
  });
  await page.goto("/editor?workflow=first");
  await expect(page.locator('.react-flow__node[data-id="relational"]')).toBeVisible();
  return { first, second, saves, requests, metadataRequests, metadataCompleted };
}

const selectRelational = (page: Page) => page.locator('.react-flow__node[data-id="relational"]').click();
const configFromSave = (save: Record<string, unknown>) => {
  const graph = save.graph as { nodes: Array<{ id: string; config: Record<string, unknown> }> };
  return graph.nodes.find((node) => node.id === "relational")!.config;
};

test("current relational node saves its existing .v2 type", async ({ page }) => {
  const { saves } = await setup(page, { provider: "postgres" });
  await selectRelational(page);
  await expect(page.getByText("Choose rows and columns")).toBeVisible();
  await expect(page.getByText("Original selection behavior")).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  const graph = saves[0]!.graph as { nodes: Array<{ id: string; type: string; nodeVersion?: number }> };
  expect(graph.nodes.find((node) => node.id === "relational")).toMatchObject({ type: "action.postgres.select.v2", nodeVersion: 1 });
});

test("a saved expression is not presented as a checked boolean or changed until selected", async ({ page }) => {
  const { saves } = await setup(page, { provider: "supabase", configOverride: { rejectUnsafeNumbers: "{{ steps.manual.output.flag }}" } });
  await selectRelational(page);
  const toggle = page.getByLabel("Stop if numeric values would be rounded");
  await expect(toggle).toHaveAttribute("aria-checked", "mixed");
  await expect(toggle).toHaveJSProperty("indeterminate", true);
  await expect(page.getByText(/The saved value is not a true\/false literal/)).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(configFromSave(saves[0]!).rejectUnsafeNumbers).toBe("{{ steps.manual.output.flag }}");
  await toggle.check();
  await expect(toggle).not.toHaveAttribute("aria-checked", "mixed");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(configFromSave(saves[1]!).rejectUnsafeNumbers).toBe(true);
});

test("numeric fields preserve a saved expression and allow an explicit return to a fixed value", async ({ page }) => {
  const expression = "{{ steps.manual.output.count }}";
  const { saves } = await setup(page, { provider: "supabase", configOverride: { limit: expression } });
  await selectRelational(page);
  const limit = page.getByLabel("Maximum rows (1–100)");
  await expect(limit).toHaveValue(expression);
  await expect(page.getByRole("button", { name: "Use fixed number", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(configFromSave(saves[0]!).limit).toBe(expression);
  await limit.fill("12");
  await page.getByRole("button", { name: "Use fixed number", exact: true }).click();
  await expect(limit).toHaveAttribute("type", "number");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(configFromSave(saves[1]!).limit).toBe(12);
  await page.getByRole("button", { name: "Enter expression", exact: true }).click();
  await limit.fill(expression);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(3);
  expect(configFromSave(saves[2]!).limit).toBe(expression);
});

test("Supabase insert builds typed columns without JSON and clears them when the table changes", async ({ page }) => {
  const { saves } = await setup(page, { provider: "supabase", insert: true });
  await selectRelational(page);
  await page.getByRole("button", { name: "Add column" }).click();
  await expect(page.locator('datalist option[value="id"]').first()).toHaveText("id · integer");
  await page.getByLabel("Column 1 name").fill("name");
  await page.getByLabel("Column 1 value", { exact: true }).fill("Example");
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Column 2 name").fill("active");
  await page.getByLabel("Column 2 type").selectOption("boolean");
  await page.getByLabel("Column 2 value", { exact: true }).selectOption("false");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(configFromSave(saves[0]!)).toMatchObject({ table: "items", fields: [{ column: "name", type: "text", value: "Example" }, { column: "active", type: "boolean", value: "false" }] });
  await page.getByRole("group", { name: "Table" }).getByLabel("Table", { exact: true }).selectOption("other_items");
  await expect(page.getByLabel("Column 1 name")).toHaveCount(0);
  await expect(page.getByText(/Changing the connection or table clears these values/)).toBeVisible();
});

test("Supabase insert allows exact column names when discovery is denied", async ({ page }) => {
  await setup(page, { provider: "supabase", insert: true, metadata: () => ({ status: 403, body: { code: "SUPABASE_COLUMNS_UNAVAILABLE", message: "Unavailable" } }) });
  await selectRelational(page);
  await expect(page.getByText("Column suggestions are unavailable. Enter exact column names.")).toBeVisible();
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Column 1 name").fill("private_column");
  await expect(page.getByLabel("Column 1 name")).toHaveValue("private_column");
});

test("changing a PostgreSQL schema or connection clears dependent resource selections", async ({ page }) => {
  const { saves } = await setup(page);
  await selectRelational(page);
  const schema = page.getByRole("group", { name: "Schema" }).getByLabel("Schema", { exact: true });
  const table = page.getByRole("group", { name: "Table" }).getByLabel("Table", { exact: true });
  await expect(schema).toHaveValue("public");
  await expect(table).toHaveValue("items");
  await schema.selectOption("analytics");
  await expect(table).toHaveValue("");
  await table.selectOption("other_items");
  await page.getByLabel("PostgreSQL credential").selectOption("pg-2");
  await expect(schema).toHaveValue("");
  await expect(table).toHaveCount(0);
  await expect(page.getByText("Choose the parent resource first, or enter a value manually.")).toBeVisible();
  await expect(page.getByText(/Changing the connection, schema or table keeps these selection settings/)).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(configFromSave(saves[0]!)).toMatchObject({ credentialId: "pg-2", schema: "", table: "", columns: ["id"], orderBy: "id" });
});

test("PostgreSQL metadata and staged conditions survive inspector close; only applied values are saved", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  const { saves, requests, metadataRequests } = await setup(page);
  await selectRelational(page);
  await expect.poll(() => metadataRequests.length).toBeGreaterThan(0);
  expect(metadataRequests[0]).toEqual({ provider: "postgres", credential: "pg-1", schema: "public", table: "items" });
  await expect(page.locator('datalist option[value="id"]').first()).toHaveText("id · integer");
  await page.getByRole("button", { name: "Add condition" }).click();
  await page.getByLabel("Condition 1 column").fill("active");
  await page.getByLabel("Condition 1 value type").selectOption("boolean");
  await page.getByLabel("Condition 1 value", { exact: true }).selectOption("false");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run test" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close node inspector" }).click();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByLabel("Condition 1 column")).toHaveValue("active");
  await expect(page.getByLabel("Condition 1 value", { exact: true })).toHaveValue("false");
  expect(requests.some((request) => /\/(draft|publish|executions)$/.test(request))).toBe(false);
  await page.getByRole("button", { name: "Apply selection" }).click();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await page.getByRole("button", { name: "Close node inspector" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(configFromSave(saves[0]!)).toEqual({ credentialId: "pg-1", schema: "public", table: "items", limit: 20, columns: ["id"], conditions: [{ column: "active", operator: "equals", value: false }], orderBy: "id", orderDirection: "asc", offset: 0, retryAttempts: 2 });
});

test("Supabase metadata unavailable and partial metadata both allow exact manual column names", async ({ page }) => {
  const { saves, metadataRequests, metadataCompleted } = await setup(page, { provider: "supabase", metadata: (table) => table === "items" ? { status: 400, body: { code: "SUPABASE_COLUMNS_UNAVAILABLE", message: "Unavailable" } } : { body: { columns: [{ name: "id", type: "uuid" }], partial: true } } });
  await selectRelational(page);
  await expect.poll(() => metadataCompleted.some((item) => item.table === "items" && item.status === 400)).toBe(true);
  expect(metadataRequests[0]).toEqual({ provider: "supabase", credential: "sb-1", schema: null, table: "items" });
  await expect(page.getByText("Column metadata is unavailable. Enter exact column names manually.")).toBeVisible();
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Column 2", { exact: true }).fill("while_unavailable");
  await page.getByRole("button", { name: "Apply selection" }).click();
  const table = page.getByRole("group", { name: "Table" });
  await table.getByLabel("Table", { exact: true }).selectOption("other_items");
  await expect(page.getByText(/Column metadata is incomplete/)).toBeVisible();
  await expect(page.locator('datalist option[value="id"]').first()).toHaveText("id · uuid");
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Column 3", { exact: true }).fill("not_discovered");
  await page.getByRole("button", { name: "Apply selection" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(configFromSave(saves[0]!)).toEqual({ credentialId: "sb-1", table: "other_items", limit: 20, columns: ["id", "while_unavailable", "not_discovered"], filters: [{ column: "active", operator: "equals", value: true }], order: [{ column: "id", direction: "desc", nulls: "last" }], offset: 0, timeoutMs: 9000 });
});

test("changing a resource conflicts with a staged edit, including if the original resource is restored", async ({ page }) => {
  const { saves } = await setup(page);
  await selectRelational(page);
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Column 2", { exact: true }).fill("name");
  const table = page.getByRole("group", { name: "Table" });
  await table.getByLabel("Table", { exact: true }).selectOption("other_items");
  await expect(page.getByRole("button", { name: "Apply selection" })).toBeDisabled();
  await expect(page.getByText("The selection or table changed elsewhere. Discard these edits to continue.")).toBeVisible();
  await table.getByLabel("Table", { exact: true }).selectOption("items");
  await expect(page.getByRole("button", { name: "Apply selection" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run test" })).toBeDisabled();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByLabel("Column 1", { exact: true })).toHaveValue("id");
  await expect(page.getByLabel("Column 2", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(configFromSave(saves[0]!).columns).toEqual(["id"]);
});

test("advanced JSON is staged and a workflow switch with reused node IDs does not retain the prior draft", async ({ page }) => {
  test.setTimeout(60_000);
  await setup(page, { provider: "supabase" });
  await selectRelational(page);
  await page.getByRole("button", { name: "Advanced settings" }).click();
  await page.getByLabel("Selection settings (JSON)").fill('{"columns":"{{ steps.rows.output }}"}');
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run test" })).toBeDisabled();
  await page.locator('.react-flow__node[data-id="manual"]').click();
  await page.getByRole("button", { name: "Review edits" }).click();
  await expect(page.getByLabel("Selection settings (JSON)")).toHaveValue('{"columns":"{{ steps.rows.output }}"}');
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByRole("dialog", { name: "Workflow library" }).getByRole("button", { name: /Second workflow/ }).click();
  await expect(page.getByRole("heading", { name: "Second workflow" })).toBeVisible();
  await selectRelational(page);
  await expect(page.getByLabel("Column 1", { exact: true })).toHaveValue("id");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Apply selection" })).toHaveCount(0);
});

test("an asynchronous clone cannot replace a graph after a selection draft starts", async ({ page }) => {
  let release!: () => void;
  const cloneGate = new Promise<void>((resolve) => { release = resolve; });
  const { requests } = await setup(page, { clone: () => cloneGate });
  await selectRelational(page);
  await page.getByLabel("Manage actions").click();
  await page.getByRole("button", { name: "Clone workflow" }).click();
  await expect.poll(() => requests.some((request) => request.endsWith("/workflows/first/clone"))).toBe(true);
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Column 2", { exact: true }).fill("pending_column");
  release();
  await expect(page.getByText("The copy was created. Apply or discard pending edits before opening it.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "First workflow" })).toBeVisible();
  await expect(page.getByLabel("Column 2", { exact: true })).toHaveValue("pending_column");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
});


test("late metadata from a previous table cannot replace the current suggestions", async ({ page }) => {
  let releaseOld!: () => void;
  const oldResponse = new Promise<void>((resolve) => { releaseOld = resolve; });
  let oldResolved = false;
  const { metadataRequests } = await setup(page, { provider: "supabase", metadata: async (table) => {
    if (table === "items") { await oldResponse; oldResolved = true; return { body: { columns: [{ name: "old_column", type: "text" }], partial: false } }; }
    return { body: { columns: [{ name: "new_column", type: "text" }], partial: false } };
  } });
  await selectRelational(page);
  await expect.poll(() => metadataRequests.some((request) => request.table === "items")).toBe(true);
  await page.getByRole("group", { name: "Table" }).getByLabel("Table", { exact: true }).selectOption("other_items");
  await expect(page.locator('datalist option[value="new_column"]').first()).toHaveText("new_column · text");
  releaseOld();
  await expect.poll(() => oldResolved).toBe(true);
  await expect(page.locator('datalist option[value="old_column"]')).toHaveCount(0);
  await expect(page.locator('datalist option[value="new_column"]').first()).toHaveText("new_column · text");
});

test("PostgreSQL cannot apply a positive offset until a sort is supplied", async ({ page }) => {
  await setup(page);
  await selectRelational(page);
  await page.getByRole("button", { name: "Remove sort 1" }).click();
  await page.getByLabel("Rows to skip").fill("10");
  await page.getByRole("button", { name: "Apply selection" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "PostgreSQL requires a sort order when skipping rows." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await page.getByRole("button", { name: "Add sort" }).click();
  await page.getByLabel("Sort 1 column").fill("id");
  await page.getByRole("button", { name: "Apply selection" }).click();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
});


for (const action of ["publish", "run test", "run node"] as const) test(`applied selection during a delayed save prevents ${action} from using the old graph`, async ({ page }) => {
  let releaseSave!: () => void;
  const gate = new Promise<void>((resolve) => { releaseSave = resolve; });
  let firstSave = true;
  const { saves, requests } = await setup(page, { save: async () => { if (firstSave) { firstSave = false; await gate; } } });
  await selectRelational(page);
  if (action === "publish") await page.getByRole("button", { name: "Publish", exact: true }).click();
  else if (action === "run test") await page.getByRole("button", { name: "Run test" }).click();
  else await page.getByRole("button", { name: "Run node" }).click();
  await expect.poll(() => saves.length).toBe(1);
  expect(configFromSave(saves[0]!).columns).toEqual(["id"]);
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Column 2", { exact: true }).fill("during_save");
  await page.getByRole("button", { name: "Apply selection" }).click();
  await expect(page.getByRole("button", { name: "Apply selection" })).toHaveCount(0);
  releaseSave();
  await expect(page.getByText("An earlier graph was saved, but the workflow changed while saving. Save again before publishing or running.")).toBeVisible();
  expect(requests.some((request) => request.endsWith("/publish") || request.endsWith("/executions"))).toBe(false);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(2);
  expect(configFromSave(saves[1]!).columns).toEqual(["id", "during_save"]);
});

test("unsafe numeric conditions direct the user to text instead of rounding", async ({ page }) => {
  await setup(page);
  await selectRelational(page);
  await page.getByRole("button", { name: "Add condition" }).click();
  await page.getByLabel("Condition 1 column").fill("id");
  await page.getByLabel("Condition 1 value type").selectOption("number");
  await page.getByLabel("Condition 1 value", { exact: true }).fill("9007199254740993");
  await page.getByRole("button", { name: "Apply selection" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose Text to preserve its digits" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await page.getByLabel("Condition 1 value type").selectOption("string");
  await page.getByLabel("Condition 1 value", { exact: true }).fill("9007199254740993");
  await page.getByRole("button", { name: "Apply selection" }).click();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
});


for (const provider of ["postgres", "supabase"] as const) test(`${provider} legacy selection upgrades only after explicit opt-in`, async ({ page }) => {
  const { saves, first } = await setup(page, { provider, legacy: true });
  await selectRelational(page);
  await expect(page.getByText("Original selection behavior")).toBeVisible();
  if (provider === "supabase") await expect(page.getByText(/This version ignores a connection's user access token/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add column" })).toHaveCount(0);
  expect(saves).toHaveLength(0);
  await page.getByRole("button", { name: "Use new selection in draft" }).click();
  await expect(page.getByRole("button", { name: "Add column" })).toBeVisible();
  expect(saves).toHaveLength(0);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => saves.length).toBe(1);
  const graph = saves[0]!.graph as { nodes: Array<{ id: string; type: string; nodeVersion?: number; config: unknown }> };
  const migrated = graph.nodes.find((node) => node.id === "relational")!;
  expect(migrated.nodeVersion).toBe(1);
  expect(migrated.type).toBe(`action.${provider}.select.v2`);
  expect(migrated.config).toEqual(first.draft.graph.nodes.find((node) => node.id === "relational")!.config);
});
