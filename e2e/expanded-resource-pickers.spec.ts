import { expect, test } from "@playwright/test";

test("new Trello and Notion operations choose connected resources and clear stale selections", async ({ page }) => {
  const board = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const otherBoard = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const card = "cccccccccccccccccccccccc";
  const nextCard = "dddddddddddddddddddddddd";
  const notionPage = "01234567-89ab-cdef-0123-456789abcdef";
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "trello", type: "action.trello.get-card", position: { x: 300, y: 0 }, config: { credentialId: "trello", sourceBoardId: board, cardId: card } },
    { id: "notion", type: "action.notion.retrieve-page", position: { x: 600, y: 0 }, config: { credentialId: "notion", pageId: notionPage } },
    { id: "notion-create", type: "action.notion.create-page", position: { x: 900, y: 0 }, config: { credentialId: "notion", parentPageId: notionPage, title: "Daily report", content: "" } },
    { id: "notion-rename", type: "action.notion.update-title", position: { x: 1200, y: 0 }, config: { credentialId: "notion", pageId: notionPage, title: "Updated report" } },
  ], edges: [] };
  const workflow = { id: "expanded", workspaceId: "workspace", name: "Resource test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "owner", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "workspace", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "trello", provider: "TRELLO", label: "Trello" }, { id: "notion", provider: "NOTION", label: "Notion" }, { id: "other-notion", provider: "NOTION", label: "Other Notion" }] });
    if (url.pathname.endsWith("/trello/boards")) return send({ boards: [{ id: board, name: "Planning" }, { id: otherBoard, name: "Other" }] });
    if (url.pathname.endsWith("/trello/cards")) return send(url.searchParams.get("board") !== board ? { cards: [], hasMore: false, nextBefore: null } : url.searchParams.has("before") ? { cards: [{ id: nextCard, name: "Second card" }], hasMore: false, nextBefore: null } : { cards: [{ id: card, name: "First card" }], hasMore: true, nextBefore: card, warning: "Cards created in the same second at the page boundary may be missed." });
    if (url.pathname.endsWith("/notion/pages")) return send({ pages: [{ id: notionPage, title: "Shared page" }], hasMore: false, nextCursor: null });
    if (url.pathname.endsWith("/workflows/expanded")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=expanded");
  await page.locator(".react-flow__node").filter({ hasText: "Get card" }).click();
  const sourceBoard = page.getByRole("group", { name: "Source board" }).getByRole("combobox");
  const cardPicker = page.getByRole("group", { name: "Card" });
  await expect(cardPicker.getByRole("combobox")).toHaveValue(card);
  await cardPicker.getByRole("button", { name: "Load more cards" }).click();
  await expect(cardPicker.getByRole("option", { name: "Second card" })).toHaveAttribute("value", nextCard);
  await sourceBoard.selectOption(otherBoard);
  await expect(cardPicker.getByRole("combobox")).toHaveValue("");
  await page.locator(".react-flow__node").filter({ hasText: "Get page" }).click();
  await expect(page.getByRole("group", { name: "Page", exact: true }).getByRole("combobox")).toHaveValue(notionPage);
  await expect(page.getByRole("group", { name: "Page", exact: true }).getByRole("option", { name: "Shared page" })).toHaveAttribute("value", notionPage);
  await page.locator(".react-flow__node").filter({ hasText: "Create page" }).click();
  await expect(page.getByRole("group", { name: "Parent page" }).getByRole("combobox")).toHaveValue(notionPage);
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue("Daily report");
  await expect(page.getByText(/If delivery is uncertain/)).toBeVisible();
  await page.getByLabel("Notion connection").selectOption("other-notion");
  await expect(page.getByRole("group", { name: "Parent page" }).getByRole("combobox")).toHaveValue("");
  await page.locator(".react-flow__node").filter({ hasText: "Update page title" }).click();
  await expect(page.getByRole("group", { name: "Page", exact: true }).getByRole("combobox")).toHaveValue(notionPage);
  await expect(page.getByLabel("New page title", { exact: true })).toHaveValue("Updated report");
  await expect(page.getByText(/Changes made by someone else/)).toBeVisible();
});
