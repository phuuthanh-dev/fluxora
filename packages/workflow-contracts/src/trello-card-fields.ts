import type { NodeConfigurationField } from "./node-configuration-fields";

export type TrelloCardOperation = "get" | "update" | "move" | "archive" | "list" | "find";

/** UI descriptors are shared for discovery. They do not replace Trello's
 * server-side validation, authorization, or provider-specific retry rules. */
export function trelloCardConfigurationFields(operation: TrelloCardOperation): NodeConfigurationField[] {
  const collection = operation === "list" || operation === "find";
  const fields: NodeConfigurationField[] = [
    { kind: "credential", key: "credentialId", label: "Trello connection", providers: ["TRELLO"] },
    { kind: "resource", key: collection ? "boardId" : "sourceBoardId", label: collection ? "Board" : "Source board", resource: "trello-board", credentialKey: "credentialId", placeholder: "Search boards" },
  ];
  if (!collection) fields.push({ kind: "resource", key: "cardId", label: "Card", resource: "trello-card", credentialKey: "credentialId", dependencyKey: "sourceBoardId", placeholder: "Search cards" });
  if (operation === "move") fields.push(
    { kind: "resource", key: "boardId", label: "Destination board", resource: "trello-board", credentialKey: "credentialId", placeholder: "Search boards" },
    { kind: "resource", key: "listId", label: "Destination list", resource: "trello-list", credentialKey: "credentialId", dependencyKey: "boardId", placeholder: "Search lists" },
  );
  if (operation === "update") fields.push({ kind: "text", key: "title", label: "New title (optional)" }, { kind: "textarea", key: "description", label: "New description (optional)" });
  if (operation === "find") fields.push({ kind: "text", key: "query", label: "Search query" });
  if (collection) fields.push({ kind: "number", key: "limit", label: "Maximum cards (1–50)", fallbackValue: 20 });
  if (operation === "list") fields.push(
    { kind: "select", key: "filter", label: "Card status", options: [{ value: "open", label: "Open" }, { value: "closed", label: "Archived" }, { value: "all", label: "All" }] },
    { kind: "text", key: "before", label: "Continue before card ID (optional)", advanced: { summary: "Advanced pagination", help: "Use nextBefore from the previous output with the same connection, board, status and limit. An ambiguous boundary has no continuation; Trello results can change between requests." } },
  );
  return fields;
}
