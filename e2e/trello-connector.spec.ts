import { expect, test } from "@playwright/test";

test("Trello card setup offers connected boards and lists and clears a stale list", async ({ page }) => {
  const board = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const otherBoard = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const list = "cccccccccccccccccccccccc";
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 100, y: 100 }, config: {} },
    { id: "trello", type: "action.trello.create-card", position: { x: 400, y: 100 }, config: { credentialId: "trello-1", boardId: board, listId: list, title: "Example", description: "" } },
  ], edges: [] };
  const workflow = { id: "trello-test", workspaceId: "workspace-1", name: "Trello test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const send = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/auth/me")) return send({ user: { id: "user-1", name: "Owner", email: "owner@example.test" } });
    if (path.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace-1", name: "Test workspace", slug: "test", role: "OWNER" }] });
    if (path.endsWith("/credentials")) return send({ credentials: [{ id: "trello-1", provider: "TRELLO", label: "My Trello" }] });
    if (path.endsWith("/trello/boards")) return send({ boards: [{ id: board, name: "Planning" }, { id: otherBoard, name: "Work" }] });
    if (path.endsWith("/trello/lists")) return send({ lists: url.searchParams.get("board") === board ? [{ id: list, name: "To do" }] : [] });
    if (path.endsWith("/workflows/trello-test")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=trello-test");
  await page.locator(".react-flow__node").filter({ hasText: "Create card" }).click();
  await expect(page.getByLabel("Trello connection")).toHaveValue("trello-1");
  const boardSelect = page.getByRole("group", { name: "Board" }).getByRole("combobox");
  const listSelect = page.getByRole("group", { name: "List" }).getByRole("combobox");
  await expect(boardSelect.getByRole("option", { name: "Planning" })).toHaveAttribute("value", board);
  await expect(listSelect).toHaveValue(list);
  await boardSelect.selectOption(otherBoard);
  await expect(listSelect).toHaveValue("");
});
