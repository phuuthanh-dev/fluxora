import { queryNotionDataSource } from "../execution/notion-operations";
import { NodeFailure } from "../execution/node-failure";

type NotionPage = { id: string; createdTime: string; editedTime: string; item: Record<string, unknown> };
type Query = typeof queryNotionDataSource;
const idPattern = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const maxItems = 1_000;

/** Fetch a complete bounded change window before the caller advances its checkpoint. */
export async function notionChangedPages(token: string, dataSourceId: string, editedAfter: string, query: Query = queryNotionDataSource): Promise<NotionPage[]> {
  if (!idPattern.test(dataSourceId) || !Number.isFinite(Date.parse(editedAfter))) throw new NodeFailure("INVALID_INPUT", "Choose a Notion data source and valid checkpoint.", false);
  const pages: NotionPage[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const result = await query({ token, dataSourceId, pageSize: 100, sort: "edited-oldest", editedAfter, ...(cursor ? { cursor } : {}) });
    if (result.queryCompleteness === "incomplete") throw new NodeFailure("NOTION_TRIGGER_LIMIT", "Notion returned an incomplete change window. Review the trigger before continuing.", false);
    for (const entry of result.results) {
      if (entry.object !== "page") continue;
      const id = entry.id, created = entry.created_time, edited = entry.last_edited_time;
      if (typeof id !== "string" || !idPattern.test(id) || typeof created !== "string" || typeof edited !== "string" || !Number.isFinite(Date.parse(created)) || !Number.isFinite(Date.parse(edited))) throw new NodeFailure("INVALID_RESPONSE", "Notion returned a page without a valid ID or timestamp.", false);
      pages.push({ id, createdTime: created, editedTime: edited, item: entry });
      if (pages.length > maxItems) throw new NodeFailure("NOTION_TRIGGER_LIMIT", "Too many Notion pages changed in one poll. Review the trigger before continuing.", false);
    }
    if (!result.hasMore) return pages;
    if (!result.nextCursor || cursors.has(result.nextCursor)) throw new NodeFailure("INVALID_RESPONSE", "Notion returned an invalid continuation cursor.", false);
    cursor = result.nextCursor;
    cursors.add(cursor);
  }
  throw new NodeFailure("NOTION_TRIGGER_LIMIT", "Notion pagination did not finish within the poll limit.", false);
}
