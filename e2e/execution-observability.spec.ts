import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test("pin a redacted output for test runs and unpin after reloading", async ({ page }) => {
  const api = `http://localhost:${process.env.E2E_API_PORT ?? "3001"}/api/v1`;
  const registration = await page.request.post(`${api}/auth/register`, { data: { email: `pin-${Date.now()}@example.test`, password: "synthetic-pin-test", displayName: "Pin test" } });
  expect(registration.ok()).toBeTruthy();
  const { workspaces } = await (await page.request.get(`${api}/workspaces`)).json();
  const graph = { nodes: [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "request", type: "action.http-request", position: { x: 300, y: 0 }, config: { url: "https://example.test/first", method: "GET" } },
  ], edges: [{ id: "edge", source: "start", target: "request", kind: "success" }] };
  const created = await page.request.post(`${api}/workspaces/${workspaces[0].id}/workflows`, { data: { name: "Pinned output", graph } });
  const { workflow } = await created.json();
  await page.goto(`/editor?workflow=${encodeURIComponent(workflow.id)}`);
  await page.locator('[data-id="request"] .workflow-node').click();
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Pin output for tests" }).click();
  await page.getByLabel("URL", { exact: true }).fill("https://example.test/second");
  const rerun = page.waitForResponse((response) => response.request().method() === "POST" && /\/workflows\/[^/]+\/executions$/.test(new URL(response.url()).pathname));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await rerun;
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("https://example.test/first", { exact: false }).last()).toBeVisible();
  await page.reload();
  await page.locator('[data-id="request"] .workflow-node').click();
  await expect(page.getByRole("button", { name: "Unpin output" })).toBeVisible();
  await page.getByRole("button", { name: "Unpin output" }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
});

async function signUpRunAndOpenDetails(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Runtime Owner");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/sample data does not verify live connections or all inputs/i)).toBeVisible();
  await expect(page.getByRole("img", { name: "Last run: Succeeded" })).toHaveCount(3);
  await page.getByRole("button", { name: "Run details", exact: true }).click();
}

test("canvas distinguishes successful, failed and skipped nodes without changing the graph", async ({ page }) => {
  await signUpRunAndOpenDetails(page, `canvas-status-${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Close execution details" }).click();
  const response = page.waitForResponse((result) => result.request().method() === "POST" && /\/workflows\/[^/]+\/executions$/.test(new URL(result.url()).pathname));
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const { execution } = await (await response).json();
  const snapshot = { ...execution, status: "FAILED", error: { code: "HTTP_ERROR", message: "Google Chat returned 403.", retryable: false }, nodeExecutions: execution.graph.nodes.map((node: { id: string; type: string }, index: number) => ({ nodeId: node.id, nodeType: node.type, status: ["SUCCEEDED", "SKIPPED", "FAILED"][index], attempt: 1, input: null, output: null, error: index === 2 ? { code: "HTTP_ERROR", message: "Google Chat returned 403.", retryable: false } : null, startedAt: null, completedAt: null, durationMs: null, failureHandling: null, skipReason: null, items: [] })) };
  await page.route(`**/executions/${execution.id}*`, (route) => route.fulfill({ json: { execution: snapshot } }));
  await page.goto(`/editor?workflow=${encodeURIComponent(execution.workflowId)}&execution=${encodeURIComponent(execution.id)}`);
  await expect(page.getByRole("img", { name: "Last run: Succeeded" })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Last run: Failed" })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Last run: Skipped" })).toHaveCount(1);
  await expect(page.locator(".workflow-node--execution-failed")).toHaveCount(1);
  await page.locator(".workflow-node--execution-failed").click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await expect(page.getByText(/Check that the incoming webhook exists in the intended Google Chat space/)).toBeVisible();
  }
  await page.getByRole("button", { name: "Run details", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Execution details" }).getByText(/Check that the incoming webhook exists in the intended Google Chat space/)).toBeVisible();
  await page.getByRole("button", { name: "Inspect failed node", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Execution details" })).toHaveCount(0);
  await expect(page.locator("#node-inspector").getByText("Google Chat returned 403.", { exact: false }).first()).toBeVisible();
});

test("handled and unhandled item failures appear on the canvas after mock runs", async ({ page }) => {
  const api = `http://localhost:${process.env.E2E_API_PORT ?? "3001"}/api/v1`;
  const registered = await page.request.post(`${api}/auth/register`, { data: { email: `item-error-${Date.now()}@example.test`, password: "synthetic-item-test", displayName: "Item test" } });
  expect(registered.ok()).toBeTruthy();
  const { workspaces } = await (await page.request.get(`${api}/workspaces`)).json();
  const graph = {
    nodes: [
      { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
      { id: "source", type: "action.mongodb", position: { x: 300, y: 0 }, config: { database: "sample", collection: "items", operation: "find", limit: 1 } },
      { id: "failure", type: "action.http-request", position: { x: 600, y: 0 }, config: { url: "{{ $json.example }}" } },
      { id: "success", type: "action.http-request", position: { x: 900, y: 0 }, config: { url: "https://example.test/success" } },
      { id: "recovery", type: "action.http-request", position: { x: 900, y: 200 }, config: { url: "https://example.test/recovery" } },
    ],
    edges: [
      { id: "start-source", source: "start", target: "source", kind: "success" },
      { id: "source-failure", source: "source", target: "failure", kind: "success" },
      { id: "failure-success", source: "failure", target: "success", kind: "success" },
      { id: "failure-recovery", source: "failure", target: "recovery", kind: "error" },
    ],
  };
  const created = await page.request.post(`${api}/workspaces/${workspaces[0].id}/workflows`, { data: { name: "Item error routing", graph } });
  expect(created.ok()).toBeTruthy();
  const { workflow } = await created.json();
  const started = await page.request.post(`${api}/workflows/${workflow.id}/executions`, { data: { mock: true } });
  expect(started.ok()).toBeTruthy();
  const { execution: initial } = await started.json();
  await expect.poll(async () => (await (await page.request.get(`${api}/executions/${initial.id}`)).json()).execution.status, { timeout: 15_000 }).not.toMatch(/^(QUEUED|RUNNING)$/);
  const { execution } = await (await page.request.get(`${api}/executions/${initial.id}`)).json();
  expect(execution.status).toBe("SUCCEEDED");
  expect(execution.nodeExecutions.find((node: { nodeId: string }) => node.nodeId === "failure").status).toBe("FAILED");
  expect(execution.nodeExecutions.find((node: { nodeId: string }) => node.nodeId === "recovery").status).toBe("SUCCEEDED");
  expect(execution.nodeExecutions.find((node: { nodeId: string }) => node.nodeId === "success").status).toBe("SKIPPED");
  await page.goto(`/editor?workflow=${encodeURIComponent(workflow.id)}&execution=${encodeURIComponent(execution.id)}`);
  await expect(page.locator('[data-id="failure"] .workflow-node')).toHaveClass(/workflow-node--execution-failed/);
  await expect(page.locator('[data-id="recovery"] .workflow-node')).toHaveClass(/workflow-node--execution-succeeded/);
  await expect(page.locator('[data-id="success"] .workflow-node')).toHaveClass(/workflow-node--execution-skipped/);

  const unhandledGraph = { nodes: graph.nodes.filter((node) => node.id !== "recovery"), edges: graph.edges.filter((edge) => edge.target !== "recovery") };
  const unhandledCreated = await page.request.post(`${api}/workspaces/${workspaces[0].id}/workflows`, { data: { name: "Unhandled item error", graph: unhandledGraph } });
  expect(unhandledCreated.ok()).toBeTruthy();
  const { workflow: unhandledWorkflow } = await unhandledCreated.json();
  const unhandledStarted = await page.request.post(`${api}/workflows/${unhandledWorkflow.id}/executions`, { data: { mock: true } });
  expect(unhandledStarted.ok()).toBeTruthy();
  const { execution: unhandledInitial } = await unhandledStarted.json();
  await expect.poll(async () => (await (await page.request.get(`${api}/executions/${unhandledInitial.id}`)).json()).execution.status, { timeout: 15_000 }).not.toMatch(/^(QUEUED|RUNNING)$/);
  const { execution: unhandled } = await (await page.request.get(`${api}/executions/${unhandledInitial.id}`)).json();
  expect(unhandled.status).toBe("FAILED");
  expect(unhandled.nodeExecutions.find((node: { nodeId: string }) => node.nodeId === "failure").status).toBe("FAILED");
  expect(unhandled.nodeExecutions.find((node: { nodeId: string }) => node.nodeId === "success").status).toBe("SKIPPED");
  await page.goto(`/editor?workflow=${encodeURIComponent(unhandledWorkflow.id)}&execution=${encodeURIComponent(unhandled.id)}`);
  await expect(page.locator('[data-id="failure"] .workflow-node')).toHaveClass(/workflow-node--execution-failed/);
  await expect(page.locator('[data-id="success"] .workflow-node')).toHaveClass(/workflow-node--execution-skipped/);
});

test("execution timeline is keyboard-safe, theme-safe, zoom-safe, and downloads redacted diagnostics", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 900 });
  await signUpRunAndOpenDetails(page, `observability-${Date.now()}@example.test`);

  const panel = page.getByRole("dialog", { name: "Execution details" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run details" })).toBeVisible();
  await expect(panel.locator(".execution-timeline__item")).toHaveCount(3);
  await expect(panel.getByText(/attempt 1/).first()).toBeVisible();
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(960);

  const close = panel.getByRole("button", { name: "Close execution details" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-label"))).toBe("Execution details");

  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(panel).toHaveCSS("background-color", "rgb(17, 23, 18)");
  await expect(panel.getByText("Safe diagnostic snapshot")).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await expect(panel).toHaveCSS("background-color", "rgb(255, 254, 249)");

  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^fluxora-execution-.+-diagnostic\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, "utf8");
  expect(content).toContain('"schemaVersion": "fluxora.execution-diagnostic.v1"');
  expect(content).not.toMatch(/triggerData|"input"|"output"|authorization|webhookUrl|discord\.com\/api\/webhooks/);

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
});

test("execution details expose loading, API error with retry, empty state, and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Runtime Owner");
  await page.locator('input[autocomplete="email"]').fill(`observability-state-${Date.now()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Use Steam template" }).click();
  await expect(page).toHaveURL(/\/editor\?workflow=/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await expect(page.getByText(/Mock execution succeeded/i)).toBeVisible({ timeout: 15_000 });

  let releaseRequest!: () => void;
  const requestGate = new Promise<void>((resolve) => { releaseRequest = resolve; });
  let detailRequests = 0;
  await page.route("**/executions/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (!/\/executions\/[^/]+$/.test(requestUrl.pathname) || requestUrl.searchParams.get("view") !== "timeline") return route.continue();
    detailRequests += 1;
    // Next.js development Strict Mode may run the mount effect twice. Hold both
    // initial requests so the loading surface remains observable and deterministic.
    if (detailRequests <= 2) {
      await requestGate;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Timeline temporarily unavailable." }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ execution: {
        id: "execution-empty",
        status: "QUEUED",
        mode: "mock",
        workflowId: "workflow-1",
        workflowVersion: 1,
        graph: { nodes: [], edges: [] },
        error: null,
        createdAt: "2026-10-27T10:00:00.000Z",
        startedAt: null,
        completedAt: null,
        durationMs: null,
        recoveryCount: 0,
        nodeExecutions: [],
      } }),
    });
  });

  await page.getByRole("button", { name: "Run details", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Execution details" });
  await expect(panel.getByText("Loading execution timeline")).toBeVisible();
  await expect(panel.locator(".ui-skeleton").first()).toHaveCSS("animation-name", "none");
  releaseRequest();
  await expect(panel.getByText("Could not load this run")).toBeVisible();
  await expect(panel.getByText("Timeline temporarily unavailable.")).toBeVisible();
  await panel.getByRole("button", { name: "Retry" }).click();
  await expect(panel.getByText("No node activity yet")).toBeVisible();
  await expect(panel.getByText("The run is queued or has not persisted its first node state.")).toBeVisible();
});
