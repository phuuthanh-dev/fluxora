/** Explicit list output fields. Other arrays remain inside a single item. */
const collectionFields: Readonly<Record<string, string>> = {
  "action.merge": "items",
  "action.aggregate": "items",
  "action.split-out": "items",
  "action.sort": "items",
  "action.limit": "items",
  "action.remove-duplicates": "items",
  "action.mongodb": "documents",
  "action.airtable.list-records": "records",
  "action.postgres.select": "rows",
  "action.supabase.select": "rows",
  "action.jira.search-issues": "items",
  "action.gitlab.list-issues": "items",
  "action.notion.search-pages": "pages",
  "action.notion.list-children": "blocks",
  "action.notion.query-data-source": "results",
  "action.trello.list-cards": "cards",
  "action.trello.find-cards": "cards",
  "action.github.list-issues": "items",
  "action.github.list-pull-requests": "items",
  "action.gmail.read": "messages",
  "action.google-calendar.list-events": "events",
  "action.rss.read": "items",
  "action.reddit.list-posts": "posts",
  "action.sentry.list-issues": "issues",
  "action.vercel.list-deployments": "deployments",
};

export function getItemCollectionField(type: string, config: Record<string, unknown>): string | undefined {
  const operation = String(config.operation ?? (type === "action.google-sheets" ? "read" : "list"));
  const dynamic = operation.includes("{{");
  if (type === "action.google-sheets") return dynamic || operation === "read" ? "values" : undefined;
  if (type === "action.google-drive") return dynamic || ["list", "search"].includes(operation) ? "files" : undefined;
  return Object.hasOwn(collectionFields, type) ? collectionFields[type] : undefined;
}
