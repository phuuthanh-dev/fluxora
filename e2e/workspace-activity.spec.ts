import { expect, test } from "@playwright/test";

test("workspace activity handles aggregate, failure, retry and themes", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const duplicateKeys: string[] = [];
  page.on("console", (message) => { if (message.text().includes("same key")) duplicateKeys.push(message.text()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let fail = false;
  await page.route("**/execution-activity", async (route) => {
    if (route.request().method() === "OPTIONS") return route.continue();
    const response = await route.fetch();
    if (fail) return route.fulfill({ response, status: 503, json: { message: "Unavailable" } });
    return route.fulfill({ response, json: { activity: { asOf: new Date().toISOString(), total: 32, counts: { QUEUED: 1, RUNNING: 2, WAITING_APPROVAL: 1, SUCCEEDED: 25, FAILED: 2, CANCELLED: 1 } } } });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Activity Owner");
  await page.locator('input[autocomplete="email"]').fill(`activity-${Date.now()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-activity-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const api = `http://localhost:${process.env.E2E_API_PORT ?? "3001"}/api/v1`;
  const workspaceResponse = await page.request.get(`${api}/workspaces`);
  expect(workspaceResponse.ok()).toBeTruthy();
  const { workspaces } = await workspaceResponse.json();
  const created = await page.request.post(`${api}/workspaces/${workspaces[0].id}/workflows`, { data: { name: "Activity test workflow" } });
  expect(created.ok()).toBeTruthy();
  const { workflow } = await created.json();
  for (let run = 0; run < 21; run += 1) {
    const response = await page.request.post(`${api}/workflows/${workflow.id}/executions`, { data: { mock: true } });
    expect(response.ok()).toBeTruthy();
  }
  const actualResponse = await page.request.get(`${api}/workspaces/${workspaces[0].id}/execution-activity`);
  expect(actualResponse.ok()).toBeTruthy();
  const actual = await actualResponse.json();
  expect(actual.activity.total).toBe(21);
  const summary = page.getByRole("region", { name: "Workspace activity" });
  await expect(summary).toContainText("32");
  await expect(summary).toContainText("test and live");
  await expect(summary).toContainText("In progress");
  await expect(summary).toContainText("Cancelled");
  await summary.screenshot({ path: testInfo.outputPath("activity-light.png") });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await summary.screenshot({ path: testInfo.outputPath("activity-dark.png") });
  fail = true;
  await summary.getByRole("button", { name: "Refresh workspace activity" }).click();
  await expect(summary).toContainText("Could not load workspace activity");
  fail = false;
  await summary.getByRole("button", { name: "Retry" }).click();
  await expect(summary).toContainText("32");
  expect(duplicateKeys).toEqual([]);
});
