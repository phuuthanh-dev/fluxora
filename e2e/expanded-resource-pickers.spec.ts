import { expect, test } from "@playwright/test";

test("new Trello and Notion operations choose connected resources and clear stale selections", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const board = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const otherBoard = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const card = "cccccccccccccccccccccccc";
  const nextCard = "dddddddddddddddddddddddd";
  const notionPage = "01234567-89ab-cdef-0123-456789abcdef";
  const otherPage = "11234567-89ab-cdef-0123-456789abcdef";
  const staleRequests: string[] = [];
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "trello", type: "action.trello.get-card", position: { x: 300, y: 0 }, config: { credentialId: "trello", sourceBoardId: board, cardId: card } },
    { id: "notion", type: "action.notion.retrieve-page", position: { x: 600, y: 0 }, config: { credentialId: "notion", pageId: notionPage } },
    { id: "notion-create", type: "action.notion.create-page", position: { x: 0, y: 220 }, config: { credentialId: "notion", parentPageId: notionPage, title: "Daily report", content: "" } },
    { id: "notion-rename", type: "action.notion.update-title", position: { x: 300, y: 220 }, config: { credentialId: "notion", pageId: notionPage, title: "Updated report" } },
    { id: "notion-property", type: "action.notion.retrieve-property", position: { x: 600, y: 220 }, config: { credentialId: "notion", pageId: notionPage, propertyId: "title", pageSize: 20, cursor: "property-cursor" } },
    { id: "notion-source", type: "action.notion.query-data-source", position: { x: 300, y: 440 }, config: { credentialId: "notion", dataSourceId: notionPage, pageSize: 20, cursor: "old-cursor" } },
    { id: "trello-list", type: "action.trello.list-cards", position: { x: 0, y: 440 }, config: { credentialId: "trello", boardId: board, filter: "open", limit: 20, before: card } },
  ], edges: [] };
  const workflow = { id: "expanded", workspaceId: "workspace", name: "Resource test", description: null, isActive: false, draft: { id: "draft", version: 1, graph }, published: null };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/auth/me")) return send({ user: { id: "owner", name: "Owner", email: "owner@example.test" } });
    if (url.pathname.endsWith("/workspaces")) return send({ workspaces: [{ id: "workspace", name: "Workspace", slug: "workspace", role: "OWNER" }] });
    if (url.pathname.endsWith("/credentials")) return send({ credentials: [{ id: "trello", provider: "TRELLO", label: "Trello" }, { id: "notion", provider: "NOTION", label: "Notion" }, { id: "other-notion", provider: "NOTION", label: "Other Notion" }] });
    if (url.pathname.endsWith("/trello/boards")) return send({ boards: [{ id: board, name: "Planning" }, { id: otherBoard, name: "Other" }] });
    if (url.pathname.endsWith("/trello/cards")) {
      if (url.searchParams.get("board") === otherBoard && url.searchParams.has("before")) staleRequests.push("trello cursor sent for another board");
      return send(url.searchParams.get("board") !== board ? { cards: [], hasMore: false, nextBefore: null } : url.searchParams.has("before") ? { cards: [{ id: nextCard, name: "Second card" }], hasMore: false, nextBefore: null } : { cards: [{ id: card, name: "First card" }], hasMore: true, nextBefore: card, warning: "Cards created in the same second at the page boundary may be missed." });
    }
    if (url.pathname.endsWith("/notion/pages")) return send({ pages: [{ id: notionPage, title: "Shared page" }, { id: otherPage, title: "Other page" }], hasMore: false, nextCursor: null });
    if (url.pathname.endsWith("/notion/properties")) return send({ properties: url.searchParams.get("pageId") === notionPage ? [{ id: "title", name: "Name" }, { id: "f%5C%3Ap", name: "Status" }] : [{ id: "other", name: "Other property" }], hasMore: false });
    if (url.pathname.endsWith("/notion/data-sources")) {
      if (url.pathname.includes("/other-notion/") && url.searchParams.has("cursor")) staleRequests.push("notion cursor sent with another connection");
      return url.searchParams.has("cursor") ? send({ sources: [], hasMore: false, nextCursor: null }) : send({ sources: [{ id: notionPage, name: "Projects" }, { id: otherPage, name: "Tasks" }], hasMore: true, nextCursor: "source-next" });
    }
    if (url.pathname.endsWith("/notion/data-source-properties")) return send({ properties: [{ id: "state", name: "Status · status" }, { id: "flag", name: "Done · checkbox" }] });
    if (url.pathname.endsWith("/notion/data-source-options")) return send({ options: [{ id: "Done", name: "Done" }, { id: "In progress", name: "In progress" }] });
    if (url.pathname.endsWith("/workflows/expanded")) return send({ workflow });
    return route.continue();
  });
  await page.goto("/editor?workflow=expanded");
  await page.getByRole("button", { name: "Collapse node palette" }).click();
  await page.getByRole("button", { name: "Fit canvas" }).click();
  await page.locator(".react-flow__node").filter({ hasText: "Get card" }).click();
  const sourceBoard = page.getByRole("group", { name: "Source board" }).getByRole("combobox");
  const cardPicker = page.getByRole("group", { name: "Card" });
  await expect(cardPicker.getByRole("combobox")).toHaveValue(card);
  await cardPicker.getByRole("button", { name: "Load more cards" }).click();
  await expect(cardPicker.getByRole("option", { name: "Second card" })).toHaveAttribute("value", nextCard);
  await sourceBoard.selectOption(otherBoard);
  await expect(cardPicker.getByRole("combobox")).toHaveValue("");
  await expect(cardPicker.getByText("No cards found for this connection.")).toBeVisible();
  expect(staleRequests).toEqual([]);
  await page.getByTestId("rf__node-trello-list").click();
  await page.getByText("Advanced pagination").click();
  const before = page.getByLabel("Continue before card ID (optional)");
  await expect(before).toHaveValue(card);
  await page.getByLabel("Card status").selectOption("closed");
  await expect(before).toHaveValue("");
  await before.fill(card);
  await page.getByLabel("Maximum cards (1–50)").fill("10");
  await expect(before).toHaveValue("");
  await page.locator('.react-flow__node[data-id="notion"]').click();
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
  await page.locator('.react-flow__node[data-id="notion-property"]').click();
  const property = page.getByRole("group", { name: "Property", exact: true });
  await page.getByText("Advanced pagination").click();
  const propertyCursor = page.getByLabel("Next cursor (optional)");
  await expect(propertyCursor).toHaveValue("property-cursor");
  await expect(property.getByRole("option", { name: "Status" })).toHaveAttribute("value", "f%5C%3Ap");
  await property.getByRole("combobox").selectOption("f%5C%3Ap");
  await expect(propertyCursor).toHaveValue("");
  await propertyCursor.fill("another-property-cursor");
  await page.getByRole("group", { name: "Page", exact: true }).getByRole("combobox").selectOption(otherPage);
  await expect(propertyCursor).toHaveValue("");
  await expect(property.getByRole("combobox")).toHaveValue("");
  await expect(property.getByRole("option", { name: "Other property" })).toHaveAttribute("value", "other");
  await property.getByRole("button", { name: /Enter.*manually|Enter value or expression/ }).click();
  await property.getByLabel("Property value").fill("custom-property-id");
  await page.locator('.react-flow__node[data-id="notion-source"]').click();
  const source = page.getByRole("group", { name: "Data source", exact: true });
  await expect(source.getByRole("option", { name: "Projects" })).toHaveAttribute("value", notionPage);
  await source.getByRole("button", { name: "Load more data sources" }).click();
  await source.getByRole("combobox").selectOption(otherPage);
  await page.getByText("Advanced pagination").click();
  await expect(page.getByLabel("Next cursor (optional)")).toHaveValue("");
  await page.getByLabel("Next cursor (optional)").fill("another-cursor");
  await page.getByLabel("Sort entries").selectOption("edited-newest");
  await expect(page.getByLabel("Next cursor (optional)")).toHaveValue("");
  await page.getByLabel("Property filter").selectOption("status");
  const filterProperty = page.getByRole("group", { name: "Filter property" });
  await expect(filterProperty.getByRole("option", { name: "Status · status" })).toHaveAttribute("value", "state");
  await expect(filterProperty.getByRole("option", { name: "Done · checkbox" })).toHaveCount(0);
  await filterProperty.getByRole("combobox").selectOption("state");
  const filterValue = page.getByRole("group", { name: "Property value" });
  await expect(filterValue.getByRole("option", { name: "Done" })).toHaveAttribute("value", "Done");
  await filterValue.getByRole("combobox").selectOption("Done");
  await page.getByLabel("Property filter").selectOption("checkbox");
  await expect(filterProperty.getByRole("combobox")).toHaveValue("");
  await expect(page.getByLabel("Checkbox value")).toHaveValue("true");
  await page.getByLabel("Property filter").selectOption("status");
  await filterProperty.getByRole("combobox").selectOption("state");
  await filterValue.getByRole("combobox").selectOption("Done");
  await page.getByLabel("Notion connection").selectOption("other-notion");
  await expect(source.getByRole("combobox")).toHaveValue("");
  await expect(source.getByRole("option", { name: "Projects" })).toHaveAttribute("value", notionPage);
  expect(staleRequests).toEqual([]);
  await expect(filterProperty.getByRole("combobox")).toHaveCount(0);
  await expect(filterValue.getByRole("combobox")).toHaveCount(0);
  await source.getByRole("combobox").selectOption(notionPage);
  await filterProperty.getByRole("combobox").selectOption("state");
  await expect(filterValue.getByRole("combobox")).toHaveValue("");
});
