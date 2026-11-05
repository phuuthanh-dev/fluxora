import { expect, test } from "@playwright/test";

test("Drive metadata and folder creation use guided resources", async ({ page }) => {
  const graph = { nodes: [
    { id: "get", type: "action.google-drive.get-file", position: { x: 0, y: 0 }, config: { credentialId: "google", fileId: "" } },
    { id: "create", type: "action.google-drive.create-folder", position: { x: 300, y: 0 }, config: { credentialId: "google", parentId: "", name: "Reports" } },
  ], edges: [] };
  const workflow = { id: "drive-ops", workspaceId: "workspace", name: "Drive operations", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  const kinds: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "google", provider: "GOOGLE", label: "Google" }] });
    if (path.endsWith("/google/files")) { const kind = url.searchParams.get("kind") ?? ""; kinds.push(kind); return send({ files: kind === "all" ? [{ id: "pdf_1", name: "Report.pdf", mimeType: "application/pdf" }] : [{ id: "folder_1", name: "Work", mimeType: "application/vnd.google-apps.folder" }], nextPageToken: null }); }
    if (path.endsWith("/workflows/drive-ops")) return send({ workflow });
    return route.abort();
  });
  await page.goto("/editor?workflow=drive-ops");
  await page.locator('.react-flow__node[data-id="get"]').click();
  const file = page.getByRole("group", { name: "File", exact: true });
  await expect(file.getByRole("option", { name: "Report.pdf" })).toHaveAttribute("value", "pdf_1");
  await file.getByRole("combobox").selectOption("pdf_1");
  await page.locator('.react-flow__node[data-id="create"]').click();
  await expect(page.getByLabel("Folder name")).toHaveValue("Reports");
  const parent = page.getByRole("group", { name: "Parent folder (optional)" });
  await expect(parent.getByRole("option", { name: "Work" })).toHaveAttribute("value", "folder_1");
  await expect(page.getByText(/check Drive before retrying/)).toBeVisible();
  expect(kinds).toContain("all");
  expect(kinds).toContain("folder");
});
