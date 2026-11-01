import { expect, test } from "@playwright/test";

test("owners can find and restore an archived workflow without activating it", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('input[autocomplete="name"]').fill("Archive Owner");
  await page.locator('input[autocomplete="email"]').fill(`archive-${Date.now()}@example.test`);
  await page.locator('input[autocomplete="new-password"]').fill("e2e-archive-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const api = "http://localhost:3001/api/v1";
  const workspaces = await (await page.request.get(`${api}/workspaces`)).json();
  const workspaceId = workspaces.workspaces[0].id as string;
  const created = await page.request.post(`${api}/workspaces/${workspaceId}/workflows`, { data: { name: "Recoverable workflow" } });
  expect(created.ok()).toBeTruthy();
  const { workflow } = await created.json();
  expect((await page.request.post(`${api}/workflows/${workflow.id}/publish`)).ok()).toBeTruthy();
  expect((await page.request.post(`${api}/workflows/${workflow.id}/activate`)).ok()).toBeTruthy();
  await page.reload();

  const card = page.locator(".workflow-card").filter({ hasText: "Recoverable workflow" });
  await expect(card).toContainText("Live");
  await card.locator("summary").click();
  await card.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("dialog", { name: "Archive workflow" }).getByRole("button", { name: "Archive workflow" }).click();
  await expect(card).toHaveCount(0);

  const archived = page.getByRole("region", { name: "Archived workflows" });
  await archived.getByRole("button", { name: "Archived workflows" }).click();
  await expect(archived).toContainText("Recoverable workflow");
  await expect(archived).toContainText("stay inactive");
  await archived.screenshot({ path: testInfo.outputPath("archive-light.png") });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await archived.screenshot({ path: testInfo.outputPath("archive-dark.png") });
  await archived.getByRole("button", { name: "Restore Recoverable workflow" }).click();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Published");
  await expect(card).not.toContainText("Live");
  await expect(archived).toContainText("No archived workflows");
  const restored = await (await page.request.get(`${api}/workflows/${workflow.id}`)).json();
  expect(restored.workflow.isActive).toBe(false);
  expect(restored.workflow.published.version).toBe(1);
  expect(restored.workflow.archivedAt).toBeNull();
});
