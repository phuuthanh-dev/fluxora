import { expect, test } from "@playwright/test";

test("Merge has two distinct inputs, preserves their order when saved, and explains whole-workflow testing", async ({ page }, testInfo) => {
  const graph = { nodes: [
    { id: "start", type: "trigger.manual", position: { x: 10, y: 120 }, config: {} },
    { id: "merge", type: "action.merge", position: { x: 380, y: 120 }, config: {} },
  ], edges: [
    { id: "first", source: "start", target: "merge", kind: "success", targetHandle: "input1" },
    { id: "second", source: "start", target: "merge", kind: "success", targetHandle: "input2" },
  ] };
  const workflow = { id: "merge-test", workspaceId: "workspace-1", name: "Append two inputs", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  let saved: typeof graph | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", displayName: "Owner", email: "owner@example.test", avatarColor: "lime" } });
    if (path.endsWith("/auth/identities")) return send({ identities: [] });
    if (path.endsWith("/auth/providers")) return send({ google: false, github: false, steam: false });
    if (path.endsWith("/admin/access")) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Forbidden" }) });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [] });
    if (route.request().method() === "PATCH" && path.endsWith("/draft")) { saved = route.request().postDataJSON().graph; return send({ workflow }); }
    if (path.endsWith("/workflows/merge-test")) return send({ workflow });
    return send({});
  });
  await page.goto("/editor?workflow=merge-test");
  const merge = page.locator('.react-flow__node[data-id="merge"]');
  await merge.click();
  for (const number of [1, 2]) await expect(merge.getByLabel(`Connect Input ${number} to Merge`, { exact: true })).toBeVisible();
  await expect(page.getByText(/Connect one branch to each numbered input/)).toBeVisible();
  await page.getByText("Test & debug", { exact: true }).click();
  await expect(page.getByText("Run the full workflow to inspect Merge with both inputs. This node cannot run on its own.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run node", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => saved?.edges.map((edge) => edge.targetHandle)).toEqual(["input1", "input2"]);
  for (const theme of ["light", "dark"]) {
    const toggle = page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const number of [1, 2]) await expect(merge.getByLabel(`Connect Input ${number} to Merge`, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`merge-two-inputs-${theme}.png`) });
  }
});
