import { workflowNodeTypes, type DataTransformNodeType, type ExecutableWorkflowNodeType, type WorkflowNodeType } from "./index";

/** Descriptive metadata only: it must not authorize execution or determine retry policy. */
export type OperationCredentialProvider =
  | "GOOGLE" | "STEAM" | "GOOGLE_CHAT_WEBHOOK" | "GOOGLE_CHAT_OAUTH" | "GMAIL" | "GOOGLE_CALENDAR"
  | "MONGODB" | "NOTION" | "POSTGRES" | "HTTP" | "DISCORD_WEBHOOK" | "SLACK_WEBHOOK" | "SLACK_OAUTH" | "TELEGRAM_BOT" | "GITHUB" | "GITLAB"
  | "SMTP" | "GEMINI" | "OPENAI" | "TRELLO" | "SENTRY" | "VERCEL" | "SUPABASE" | "REDDIT" | "RIOT";

export type OperationAuth =
  | { kind: "none" }
  | { kind: "credential"; provider: OperationCredentialProvider; requirement: "required" | "optional"; context?: "execution" | "trigger-setup" }
  | { kind: "conditional" | "unspecified" };

/** External data effects, not a claim about local state, billing, idempotency or retry safety. */
export type OperationEffect = "read" | "write" | "configuration-dependent" | "unspecified";

type ContinuationPagination = { kind: "continuation"; input: string; next: string; hasMore?: string; preserve?: readonly string[]; caveat?: string };
export type OperationPagination =
  | { kind: "unspecified" }
  | { kind: "output-only"; next: string; hasMore?: string }
  /** An offset is supplied explicitly; the response does not establish a next page. */
  | { kind: "offset"; input: string; page: string; preserve: readonly string[]; caveat: string }
  | ContinuationPagination
  /** Fallback applies when the selector is absent; other operations have no advertised pagination and can be invalid. */
  | { kind: "conditional"; selector: string; fallback: string; cases: readonly { values: readonly string[]; pagination: ContinuationPagination }[] };

/** Describes test behavior; it does not execute a mock or enforce security. */
export type MockBehavior = "provider-sample" | "transform" | "trigger-data" | "condition" | "approval" | "unavailable";

export type OperationMetadata = {
  readonly availability: "executable" | "planned";
  readonly auth: Readonly<OperationAuth>;
  readonly effect: OperationEffect;
  /** Known top-level fields, not an exhaustive schema or a uniform mock/live guarantee. */
  readonly output: { readonly knownFields: readonly string[] } | { readonly kind: "unspecified" };
  readonly pagination: Readonly<OperationPagination>;
  readonly mockBehavior: MockBehavior;
  /** Execution history applies a backend key-based filter, not comprehensive secret detection. */
  readonly historyRedaction: "key-based" | "not-applicable";
};

type CheckedRegistry = { [K in WorkflowNodeType]: OperationMetadata & {
  availability: K extends ExecutableWorkflowNodeType ? "executable" : "planned";
  mockBehavior: K extends ExecutableWorkflowNodeType
    ? K extends "action.edit-fields" | "action.merge" | DataTransformNodeType ? "transform" : K extends `action.${string}` ? "provider-sample"
      : K extends `trigger.${string}` ? "trigger-data"
        : K extends `condition.${string}` ? "condition" : "approval"
    : "unavailable";
} };

const unknownOutput = { kind: "unspecified" } as const;
const unknownPagination = { kind: "unspecified" } as const;
const none = { kind: "none" } as const;
const conditional = { kind: "conditional" } as const;
const unspecifiedAuth = { kind: "unspecified" } as const;
const credential = (provider: OperationCredentialProvider, requirement: "required" | "optional" = "required", context: "execution" | "trigger-setup" = "execution"): OperationAuth => ({ kind: "credential", provider, requirement, context });
const executable = (auth: OperationAuth, effect: OperationEffect, output: OperationMetadata["output"] = unknownOutput, pagination: OperationPagination = unknownPagination) => ({ availability: "executable" as const, auth, effect, output, pagination, mockBehavior: "provider-sample" as const, historyRedaction: "key-based" as const });
const trigger = (...args: Parameters<typeof executable>) => ({ ...executable(...args), mockBehavior: "trigger-data" as const });
const condition = (...args: Parameters<typeof executable>) => ({ ...executable(...args), mockBehavior: "condition" as const });
const approval = (...args: Parameters<typeof executable>) => ({ ...executable(...args), mockBehavior: "approval" as const });
const planned = { availability: "planned", auth: unspecifiedAuth, effect: "unspecified", output: unknownOutput, pagination: unknownPagination, mockBehavior: "unavailable", historyRedaction: "not-applicable" } as const;
const fields = (...knownFields: string[]) => ({ knownFields });
const notificationReceipt = fields("delivered", "provider", "destination", "messageId", "sentAt", "mode");
const trelloCard = fields("id", "name", "description", "boardId", "listId", "closed", "url");
// Trigger payloads differ by provider; only the wrapper is guaranteed.
const triggerOutput = fields("received");

const definitions = {
  "action.notion.retrieve-page": executable(credential("NOTION"), "read", fields("page", "outputInfo")),
  "action.notion.list-children": executable(credential("NOTION"), "read", fields("blocks", "hasMore", "nextCursor"), { kind: "continuation", input: "cursor", next: "nextCursor", hasMore: "hasMore", preserve: ["credentialId", "blockId", "pageSize"] }),
  "action.notion.retrieve-property": executable(credential("NOTION"), "read", fields("kind", "hasMore", "nextCursor"), { kind: "continuation", input: "cursor", next: "nextCursor", hasMore: "hasMore", preserve: ["credentialId", "pageId", "propertyId", "pageSize"], caveat: "Only list-valued properties have further pages." }),
  "action.notion.query-data-source": executable(credential("NOTION"), "read", fields("results", "hasMore", "nextCursor", "queryCompleteness"), { kind: "continuation", input: "cursor", next: "nextCursor", hasMore: "hasMore", preserve: ["credentialId", "dataSourceId", "pageSize", "sort", "editedAfter", "filterMode", "filterProperty", "filterValue"], caveat: "The provider may cap total results; check queryCompleteness." }),
  "action.notion.create-entry": executable(credential("NOTION"), "write", fields("pageId", "dataSourceId")),
  "action.notion.update-entry": executable(credential("NOTION"), "write", fields("pageId", "dataSourceId")),
  "action.notion.create-page": executable(credential("NOTION"), "write", fields("pageId", "parentPageId")),
  "action.notion.update-title": executable(credential("NOTION"), "write", fields("pageId", "updatedField")),
  "action.trello.get-card": executable(credential("TRELLO"), "read", trelloCard),
  "action.trello.update-card": executable(credential("TRELLO"), "write", trelloCard),
  "action.trello.move-card": executable(credential("TRELLO"), "write", trelloCard),
  "action.trello.archive-card": executable(credential("TRELLO"), "write", trelloCard),
  "action.trello.list-cards": executable(credential("TRELLO"), "read", fields("cards", "count", "hasMore", "nextBefore"), { kind: "continuation", input: "before", next: "nextBefore", hasMore: "hasMore", preserve: ["credentialId", "boardId", "filter", "limit"], caveat: "The next cursor is unavailable for ambiguous boundaries; changing provider data can still affect completeness." }),
  "action.trello.find-cards": executable(credential("TRELLO"), "read", fields("cards", "count", "hasMore", "page", "nextPage", "continuationUnknown", "paginationWarning"), { kind: "conditional", selector: "searchPagination", fallback: "first", cases: [{ values: ["pages"], pagination: { kind: "continuation", input: "page", next: "nextPage", hasMore: "hasMore", preserve: ["credentialId", "boardId", "query", "limit", "searchPagination"], caveat: "Page mode probes the next page and stops at overlapping pages; mutable results can still shift. At page 100 a full page has unknown continuation." } }] }),
  "action.github.list-issues": executable(credential("GITHUB"), "read", fields("repository", "items", "page", "pageSize", "state", "hasMore", "nextPage", "truncated"), { kind: "continuation", input: "page", next: "nextPage", hasMore: "hasMore", preserve: ["credentialId", "repository", "state", "pageSize"], caveat: "At the page ceiling hasMore can be true while nextPage is null." }),
  "action.github.get-issue": executable(credential("GITHUB"), "read", fields("repository", "item")),
  "action.github.update-issue": executable(credential("GITHUB"), "write", fields("repository", "issueNumber", "updatedField")),
  "action.github.list-pull-requests": executable(credential("GITHUB"), "read", fields("repository", "items", "page", "pageSize", "state", "hasMore", "nextPage", "truncated"), { kind: "continuation", input: "page", next: "nextPage", hasMore: "hasMore", preserve: ["credentialId", "repository", "state", "pageSize"], caveat: "At the page ceiling hasMore can be true while nextPage is null." }),
  "action.github.get-pull-request": executable(credential("GITHUB"), "read", fields("repository", "item")),
  "trigger.manual": trigger(none, "unspecified", triggerOutput),
  "trigger.gmail": trigger(credential("GMAIL", "required", "trigger-setup"), "unspecified", triggerOutput),
  "trigger.google-calendar.event": trigger(credential("GOOGLE_CALENDAR", "required", "trigger-setup"), "read", triggerOutput),
  "trigger.rss.new-item": trigger(none, "read", triggerOutput),
  "trigger.steam.game-news": trigger(none, "read", triggerOutput),
  "trigger.telegram.update": trigger(conditional, "read", triggerOutput),
  "trigger.gitlab.pipeline": trigger(credential("GITLAB"), "read", triggerOutput),
  "trigger.gitlab.merge-request": trigger(credential("GITLAB"), "read", triggerOutput),
  "action.gitlab.get-project": executable(credential("GITLAB"), "read", fields("project")),
  "action.gitlab.get-issue": executable(credential("GITLAB"), "read", fields("issue")),
  "action.gitlab.create-issue": executable(credential("GITLAB"), "write", fields("issue")),
  "action.gitlab.add-comment": executable(credential("GITLAB"), "write", fields("commentId", "issueNumber", "projectId")),
  "action.gitlab.list-issues": executable(credential("GITLAB"), "read", fields("items", "nextPage"), { kind: "continuation", input: "page", next: "nextPage", preserve: ["credentialId", "project", "state", "pageSize"] }),
  "trigger.slack.event": trigger(credential("SLACK_OAUTH"), "read", triggerOutput),
  "trigger.vercel.deployment": trigger(conditional, "read", triggerOutput),
  "trigger.trello.board-action": trigger(conditional, "read", triggerOutput),
  "trigger.sentry.issue-created": trigger(conditional, "read", triggerOutput),
  "trigger.cron": trigger(none, "unspecified", triggerOutput),
  "trigger.webhook": trigger(conditional, "unspecified", triggerOutput),
  "trigger.uptime-kuma.alert": trigger(conditional, "unspecified", triggerOutput),
  "trigger.github.issue-opened": trigger(conditional, "unspecified", triggerOutput),
  "trigger.github.pull-request-opened": trigger(conditional, "unspecified", triggerOutput),
  "trigger.github.push": trigger(conditional, "unspecified", triggerOutput),
  "trigger.github.workflow-run-completed": trigger(conditional, "unspecified", triggerOutput),
  "condition.if": condition(none, "unspecified", fields("matches")),
  "condition.switch": condition(none, "unspecified", fields("value", "matched")),
  "action.merge": { ...executable(none, "unspecified", { knownFields: ["items", "count"] }), mockBehavior: "transform" },
  "action.aggregate": { ...executable(none, "unspecified", { knownFields: ["items", "count"] }), mockBehavior: "transform" },
  "action.split-out": { ...executable(none, "unspecified", { knownFields: ["items", "count"] }), mockBehavior: "transform" },
  "action.sort": { ...executable(none, "unspecified", { knownFields: ["items", "count"] }), mockBehavior: "transform" },
  "action.limit": { ...executable(none, "unspecified", { knownFields: ["items", "count"] }), mockBehavior: "transform" },

  "action.edit-fields": { ...executable(none, "unspecified"), mockBehavior: "transform" },
  "approval.request": approval(conditional, "unspecified", fields("message", "expiresInHours", "notificationProvider", "notificationCredentialId")),
  "action.steam.account-snapshot": executable(credential("STEAM"), "read", fields("profile", "currentGame", "ownedGames", "recentGames", "achievements", "summary")),
  "action.steam": executable(conditional, "read", fields("operation", "result")),
  "action.riot-lol": executable(credential("RIOT"), "read", fields("operation", "result")),
  "action.riot-tft": executable(credential("RIOT"), "read", fields("operation", "result")),
  "action.riot-valorant": planned,
  "action.riot-lor": planned,
  "action.riot-2xko": planned,
  "action.google-chat.webhook": executable(credential("GOOGLE_CHAT_WEBHOOK"), "write", notificationReceipt),
  "action.google-chat.oauth": executable(credential("GOOGLE_CHAT_OAUTH"), "write", fields("delivered", "provider", "destination", "messageId", "sentAt", "threadName")),
  "action.google-chat.reply": executable(credential("GOOGLE_CHAT_OAUTH"), "write", fields("delivered", "provider", "destination", "messageId", "sentAt", "threadName")),
  "action.google-chat.edit-message": executable(credential("GOOGLE_CHAT_OAUTH"), "write", fields("updated", "messageId")),
  "action.discord.webhook": executable(credential("DISCORD_WEBHOOK"), "write", notificationReceipt),
  "action.slack.webhook": executable(credential("SLACK_WEBHOOK"), "write", fields("delivered", "provider", "destination", "sentAt", "mode")),
  "action.slack.message": executable(credential("SLACK_OAUTH"), "write", fields("delivered", "provider", "destination", "messageId", "sentAt", "mode")),
  "action.telegram.message": executable(credential("TELEGRAM_BOT"), "write", notificationReceipt),
  "action.telegram.reply": executable(credential("TELEGRAM_BOT"), "write", fields(...notificationReceipt.knownFields, "operation")),
  "action.telegram.edit-message": executable(credential("TELEGRAM_BOT"), "write", fields(...notificationReceipt.knownFields, "operation")),
  "action.google-drive.get-file": executable(credential("GOOGLE"), "read", fields("file")),
  "action.google-drive.create-folder": executable(credential("GOOGLE"), "write", fields("folder")),
  "action.google-drive": executable(credential("GOOGLE"), "configuration-dependent", fields("operation"), {
    kind: "conditional", selector: "operation", fallback: "list", cases: [{
      values: ["list", "search"],
      pagination: { kind: "continuation", input: "pageToken", next: "nextPageToken", preserve: ["credentialId", "operation", "query", "collectPages"], caveat: "Drive continuation applies only to list and search; results can change between pages." },
    }],
  }),
  "action.google-sheets": executable(credential("GOOGLE"), "configuration-dependent", fields("operation")),
  "action.http-request": executable(credential("HTTP", "optional"), "configuration-dependent", fields("status", "body")),
  "action.email": executable(credential("SMTP"), "write", fields("delivered", "submissionStatus", "acceptedCount", "deliveryConfirmed", "provider", "destination", "sentAt", "mode")),
  "action.openai": executable(credential("OPENAI"), "unspecified", fields("text", "model", "finishReason")),
  "action.gemini": executable(credential("GEMINI"), "unspecified", fields("text", "model", "finishReason")),
  "action.mongodb": executable(credential("MONGODB"), "read", fields("documents", "count")),
  "action.mongodb.insert": executable(credential("MONGODB"), "write", fields("inserted", "insertedId")),
  "action.notion.search-pages": executable(credential("NOTION"), "read", fields("pages", "hasMore", "nextCursor"), { kind: "continuation", input: "cursor", next: "nextCursor", hasMore: "hasMore", preserve: ["credentialId", "query", "pageSize", "collectPages"] }),
  "action.rss.read": executable(none, "read", fields("title", "items")),
  "action.trello.create-card": executable(credential("TRELLO"), "write", fields("id", "name", "boardId", "listId", "url")),
  "action.sentry.list-issues": executable(credential("SENTRY"), "read", fields("issues", "hasMore", "nextCursor", "partial"), { kind: "continuation", input: "cursor", next: "nextCursor", hasMore: "hasMore", preserve: ["credentialId", "organization", "project", "status", "limit"], caveat: "Continuation can be unknown; reuse the cursor with the same project and filters." }),
  "action.sentry.get-issue": executable(credential("SENTRY"), "read", fields("issue")),
  "action.vercel.list-deployments": executable(credential("VERCEL"), "read", fields("deployments", "hasMore", "nextCursor", "partial"), { kind: "continuation", input: "cursor", next: "nextCursor", hasMore: "hasMore", preserve: ["credentialId", "team", "project", "limit"], caveat: "Continuation can be unknown; reuse the cursor with the same account and project." }),
  "action.vercel.public-deployment-lookup": executable(credential("VERCEL"), "read", fields("lookup", "ownershipVerified", "deployment")),
  "action.supabase.select": executable(credential("SUPABASE"), "read", fields("rows", "count", "returnedCount", "page"), { kind: "offset", input: "offset", page: "page", preserve: ["credentialId", "table", "limit", "columns", "filters", "order", "rejectUnsafeNumbers"], caveat: "A nonzero offset requires sorting. Completeness is unknown, and changing rows can shift between pages." }),
  "action.supabase.insert-row": executable(credential("SUPABASE"), "write", fields("accepted", "table")),
  "action.reddit.list-posts": executable(credential("REDDIT"), "read", fields("posts", "hasMore")),
  "action.postgres.select": executable(credential("POSTGRES"), "read", fields("rows", "count", "returnedCount", "page"), { kind: "offset", input: "offset", page: "page", preserve: ["credentialId", "schema", "table", "limit", "columns", "conditions", "orderBy", "orderDirection"], caveat: "A nonzero offset requires sorting. Completeness is unknown, and changing rows can shift between pages." }),
  "action.gmail.read": executable(credential("GMAIL"), "read", fields("messages", "count", "hasMore", "nextPageToken"), { kind: "continuation", input: "pageToken", next: "nextPageToken", hasMore: "hasMore", preserve: ["credentialId", "mailbox", "query", "limit", "collectPages"] }),
  "action.gmail.get-message": executable(credential("GMAIL"), "read", fields("message")),
  "action.gmail.send": executable(credential("GMAIL"), "write", fields("result")),
  "action.gmail.reply": executable(credential("GMAIL"), "write", fields("result")),
  "action.gmail.create-draft": executable(credential("GMAIL"), "write", fields("result")),
  "action.gmail.update-draft": executable(credential("GMAIL"), "write", fields("result")),
  "action.gmail.modify-label": executable(credential("GMAIL"), "write", fields("result")),
  "action.google-calendar.list-events": executable(credential("GOOGLE_CALENDAR"), "read", fields("events", "count", "hasMore", "nextPageToken", "timeMin"), { kind: "continuation", input: "pageToken", next: "nextPageToken", hasMore: "hasMore", preserve: ["timeMin", "credentialId", "calendarId", "limit"], caveat: "Reuse the exact timeMin from this output as the start time, including seconds and milliseconds." }),
  "action.google-calendar.create-event": executable(credential("GOOGLE_CALENDAR"), "write", fields("id", "summary", "start", "end", "recovered")),
  "action.google-calendar.get-event": executable(credential("GOOGLE_CALENDAR"), "read", fields("id", "summary", "description", "location", "start", "end", "status")),
  "action.google-calendar.update-event": executable(credential("GOOGLE_CALENDAR"), "write", fields("id", "updated")),
  "action.google-calendar.delete-event": executable(credential("GOOGLE_CALENDAR"), "write", fields("id", "deleted", "alreadyAbsentOrInaccessible")),
  "action.google-calendar.availability": executable(credential("GOOGLE_CALENDAR"), "read", fields("available", "busy")),
  "action.github": executable(credential("GITHUB"), "write", fields("delivered", "provider", "operation", "repository", "issueNumber", "url", "labels", "deduplicated", "mode")),
  "action.github.add-label": executable(credential("GITHUB"), "write", fields("delivered", "provider", "operation", "repository", "issueNumber", "addedLabel", "labels", "mode")),
  "action.github.add-comment": executable(credential("GITHUB"), "write", fields("delivered", "provider", "operation", "repository", "issueNumber", "commentId", "url", "body", "mode")),
  "action.github.merge-pull-request": executable(credential("GITHUB"), "write", fields("delivered", "provider", "operation", "repository", "pullRequestNumber", "merged", "sha", "message", "mergeMethod", "url", "mode")),
  "action.facebook-meta": planned,
  "action.instagram": planned,
} satisfies CheckedRegistry;

function freezeMetadata(value: object): void {
  for (const child of Object.values(value)) if (child !== null && typeof child === "object" && !Object.isFrozen(child)) freezeMetadata(child);
  Object.freeze(value);
}
freezeMetadata(definitions);

/** Lazy construction avoids reading index exports during module initialization. */
export function getOperationMetadataRegistry(): Readonly<CheckedRegistry> {
  return Object.freeze(Object.fromEntries(workflowNodeTypes.map((type) => [type, definitions[type]])) as CheckedRegistry);
}

/** Only registered graph types are exposed; unknown strings never fall back to an executable entry. */
export function getOperationMetadata(type: string): OperationMetadata | undefined {
  return workflowNodeTypes.some((known) => known === type) ? definitions[type as WorkflowNodeType] : undefined;
}
