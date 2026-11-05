import assert from "node:assert/strict";
import test from "node:test";
import { executableWorkflowNodeTypes, hasNodeConfigSchema, nodeConfigIssues, workflowNodeTypes } from "@workflow/contracts";
import { resolveExpressions } from "./expression";

test("each executable node has a configuration entry; planned and unknown nodes do not", () => {
  for (const type of executableWorkflowNodeTypes) assert.equal(hasNodeConfigSchema(type), true, type);
  for (const type of workflowNodeTypes.filter((candidate) => !executableWorkflowNodeTypes.includes(candidate as typeof executableWorkflowNodeTypes[number]))) assert.equal(hasNodeConfigSchema(type), false, type);
  assert.equal(hasNodeConfigSchema("__proto__"), false);
});

test("Steam snapshot schema distinguishes omitted, literal, expression and resolved values", () => {
  const type = "action.steam.account-snapshot";
  assert.equal(hasNodeConfigSchema(type), true);
  assert.equal(hasNodeConfigSchema("action.not-yet-migrated"), false);
  assert.deepEqual(nodeConfigIssues(type, {}, "resolved"), []);
  assert.deepEqual(nodeConfigIssues(type, { steamId: " 7656 ", includeOwnedGames: false, achievementAppId: " 620 " }, "resolved"), []);
  assert.equal(nodeConfigIssues(type, { includeOwnedGames: "false" }, "resolved")[0]?.field, "includeOwnedGames");
  const config = { includeOwnedGames: "{{ steps.previous.output.include }}" };
  assert.deepEqual(nodeConfigIssues(type, config, "static"), []);
  const missing = resolveExpressions(config, { steps: {} }) as Record<string, unknown>;
  assert.equal(nodeConfigIssues(type, missing, "resolved")[0]?.field, "includeOwnedGames");
  const valid = resolveExpressions(config, { steps: { previous: { output: { include: false } } } }) as Record<string, unknown>;
  assert.deepEqual(nodeConfigIssues(type, valid, "resolved"), []);
  assert.deepEqual(config, { includeOwnedGames: "{{ steps.previous.output.include }}" });
});

test("Steam operation schema validates only fields used by the selected operation", () => {
  const type = "action.steam";
  assert.equal(hasNodeConfigSchema(type), true);
  assert.deepEqual(nodeConfigIssues(type, { operation: "profile", appId: "stale-hidden-value" }, "resolved"), []);
  assert.equal(nodeConfigIssues(type, { operation: "achievements" }, "resolved")[0]?.field, "appId");
  assert.equal(nodeConfigIssues(type, { operation: "resolveVanity", vanity: "https://example.test/id/player" }, "resolved")[0]?.field, "vanity");
  assert.deepEqual(nodeConfigIssues(type, { operation: "resolveVanity", vanity: "https://steamcommunity.com/id/player/" }, "resolved"), []);
  assert.deepEqual(nodeConfigIssues(type, { operation: "{{ steps.previous.output.operation }}" }, "static"), []);
  const resolved = resolveExpressions({ operation: "{{ steps.previous.output.operation }}" }, { steps: { previous: { output: { operation: "achievements" } } } }) as Record<string, unknown>;
  assert.equal(nodeConfigIssues(type, resolved, "resolved")[0]?.field, "appId");
});

test("MongoDB schemas preserve intentional empty filters but reject unresolved data", () => {
  const find = "action.mongodb";
  const insert = "action.mongodb.insert";
  assert.equal(hasNodeConfigSchema(find), true);
  assert.equal(hasNodeConfigSchema(insert), true);
  const resources = { database: "sample", collection: "items" };
  assert.deepEqual(nodeConfigIssues(find, { ...resources, filter: "{}" }, "resolved"), []);
  assert.deepEqual(nodeConfigIssues(find, resources, "resolved"), []);
  assert.equal(nodeConfigIssues(find, { ...resources, filter: { owner: undefined } }, "resolved")[0]?.field, "filter");
  assert.equal(nodeConfigIssues(find, { ...resources, filter: { nested: { $where: "true" } } }, "resolved")[0]?.field, "filter");
  assert.equal(nodeConfigIssues(insert, { ...resources, document: { owner: undefined } }, "resolved")[0]?.field, "document");
  assert.deepEqual(nodeConfigIssues(insert, { ...resources, document: { name: "safe" } }, "resolved"), []);
});

test("Gemini and OpenAI configuration schemas validate literal limits and preserve schema descriptions", () => {
  for (const type of ["action.gemini", "action.openai"]) {
    const schema = { type: "object", properties: { summary: { type: "string", description: "Example {{ text }}" } }, required: ["summary"], additionalProperties: false };
    const valid = { model: "example-model", prompt: "Summarize this", maxOutputTokens: 1024, timeoutMs: 30000, outputSchema: schema };
    assert.equal(hasNodeConfigSchema(type), true);
    assert.deepEqual(nodeConfigIssues(type, valid, "resolved"), []);
    assert.equal(nodeConfigIssues(type, { ...valid, maxOutputTokens: 0 }, "resolved")[0]?.field, "maxOutputTokens");
    assert.equal(nodeConfigIssues(type, { ...valid, outputSchema: { type: "object" } }, "resolved")[0]?.field, "outputSchema");
    assert.deepEqual(nodeConfigIssues(type, { ...valid, prompt: "{{ steps.previous.output.text }}" }, "static"), []);
    const unresolved = resolveExpressions({ ...valid, prompt: "{{ steps.missing.output.text }}" }, { steps: {} }) as Record<string, unknown>;
    assert.equal(nodeConfigIssues(type, unresolved, "resolved")[0]?.field, "prompt");
  }
});

test("HTTP schema validates URL, method, headers and timeout without limiting valid custom methods", () => {
  const type = "action.http-request";
  assert.equal(hasNodeConfigSchema(type), true);
  assert.deepEqual(nodeConfigIssues(type, { url: "https://example.test", method: "PROPFIND", headers: { Accept: "application/json" }, timeoutMs: 5000 }, "resolved"), []);
  assert.equal(nodeConfigIssues(type, { url: "ftp://example.test" }, "resolved")[0]?.field, "url");
  assert.equal(nodeConfigIssues(type, { url: "https://example.test", headers: { Accept: 1 } }, "resolved")[0]?.field, "headers");
  assert.equal(nodeConfigIssues(type, { url: "https://example.test", timeoutMs: 0 }, "resolved")[0]?.field, "timeoutMs");
  assert.deepEqual(nodeConfigIssues(type, { url: "{{ steps.previous.output.url }}" }, "static"), []);
  const unresolved = resolveExpressions({ url: "{{ steps.missing.output.url }}" }, { steps: {} }) as Record<string, unknown>;
  assert.equal(nodeConfigIssues(type, unresolved, "resolved")[0]?.field, "url");
});

test("Google Chat thread and message names must belong to the selected space", () => {
  for (const [type, field, suffix] of [["action.google-chat.reply", "threadName", "threads/thread-1"], ["action.google-chat.edit-message", "messageName", "messages/message-1"]] as const) {
    const valid = { space: "spaces/one", message: "Hello", [field]: `spaces/one/${suffix}` };
    assert.deepEqual(nodeConfigIssues(type, valid, "resolved"), []);
    assert.equal(nodeConfigIssues(type, { ...valid, [field]: `spaces/other/${suffix}` }, "resolved")[0]?.field, field);
    assert.deepEqual(nodeConfigIssues(type, { ...valid, space: "{{ steps.previous.output.space }}" }, "static"), []);
  }
  assert.equal(nodeConfigIssues("action.google-chat.webhook", { message: " " }, "resolved")[0]?.field, "message");
});

test("GitHub schemas validate repositories, numbers and the selected update field", () => {
  assert.deepEqual(nodeConfigIssues("action.github.get-issue", { repository: "owner/repo", issueNumber: "42" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.github.get-issue", { repository: "../repo", issueNumber: 42 }, "resolved")[0]?.field, "repository");
  assert.equal(nodeConfigIssues("action.github.get-issue", { repository: "owner/repo", issueNumber: 0 }, "resolved")[0]?.field, "issueNumber");
  assert.deepEqual(nodeConfigIssues("action.github.update-issue", { repository: "owner/repo", issueNumber: 2, field: "body", body: "" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.github.update-issue", { repository: "owner/repo", issueNumber: 2, field: "title", title: " " }, "resolved")[0]?.field, "title");
  assert.deepEqual(nodeConfigIssues("action.github.update-issue", { repository: "owner/repo", issueNumber: 2, field: "{{ steps.previous.output.field }}" }, "static"), []);
});

test("RSS and Reddit validate supported input without accessing a provider", () => {
  assert.deepEqual(nodeConfigIssues("action.rss.read", { url: "https://example.test/feed", limit: 20 }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.rss.read", { url: "https://user:secret@example.test/feed" }, "resolved")[0]?.field, "url");
  assert.deepEqual(nodeConfigIssues("action.reddit.list-posts", { subreddit: "r/technology", sort: "new", limit: 20 }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.reddit.list-posts", { subreddit: "../private" }, "resolved")[0]?.field, "subreddit");
});

test("SMTP configuration validates the message and addresses without exposing values", () => {
  const config = { to: "person@example.test", subject: "Hello", body: "First line\nSecond line", bodyFormat: "text" };
  assert.deepEqual(nodeConfigIssues("action.email", config, "resolved"), []);
  assert.equal(nodeConfigIssues("action.email", { ...config, to: "not-an-address" }, "resolved")[0]?.field, "to");
  assert.equal(nodeConfigIssues("action.email", { ...config, subject: "hello\nBcc: x" }, "resolved")[0]?.field, "subject");
});

test("Sentry and Vercel validate resources and pagination before provider requests", () => {
  assert.deepEqual(nodeConfigIssues("action.sentry.list-issues", { organization: "team", project: "service", cursor: "123:0:1" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.sentry.list-issues", { organization: "team", project: "service", cursor: "invalid" }, "resolved")[0]?.field, "cursor");
  assert.deepEqual(nodeConfigIssues("action.sentry.get-issue", { organization: "team", project: "service", issueId: "42" }, "resolved"), []);
  assert.deepEqual(nodeConfigIssues("action.vercel.list-deployments", { team: "personal", project: "prj_123", cursor: "0" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.vercel.public-deployment-lookup", { deploymentId: "../bad" }, "resolved")[0]?.field, "deploymentId");
});

test("Google Drive file and folder actions validate their selected resources", () => {
  assert.deepEqual(nodeConfigIssues("action.google-drive.get-file", { fileId: "file_123" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.google-drive.get-file", { fileId: "../invalid" }, "resolved")[0]?.field, "fileId");
  assert.deepEqual(nodeConfigIssues("action.google-drive.create-folder", { name: "Reports", parentId: "" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.google-drive.create-folder", { name: " " }, "resolved")[0]?.field, "name");
});

test("Drive and Sheets require only fields used by the selected operation", () => {
  assert.deepEqual(nodeConfigIssues("action.google-drive", { operation: "list" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.google-drive", { operation: "downloadText" }, "resolved")[0]?.field, "fileId");
  const sheets = { spreadsheetId: "sheet", range: "Sheet1!A1" };
  assert.deepEqual(nodeConfigIssues("action.google-sheets", { ...sheets, operation: "read" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.google-sheets", { ...sheets, operation: "append" }, "resolved")[0]?.field, "values");
  assert.deepEqual(nodeConfigIssues("action.google-sheets", { ...sheets, operation: "append", values: [["sample"]] }, "resolved"), []);
});

test("Telegram validates message targets and operation-specific fields", () => {
  assert.deepEqual(nodeConfigIssues("action.telegram.message", { text: "Hello", chatId: "123", destinationType: "dm" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.telegram.message", { text: "Hello", chatId: "123", destinationType: "group" }, "resolved")[0]?.field, "chatId");
  assert.deepEqual(nodeConfigIssues("action.telegram.reply", { text: "Hello", chatId: "-100123", destinationType: "supergroup", messageId: "42", messageThreadId: "5" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.telegram.edit-message", { text: "Hello", chatId: "123", messageId: "42", messageThreadId: "5" }, "resolved")[0]?.field, "messageThreadId");
});

test("Trello validates card operations and conditional pagination", () => {
  const boardId = "a".repeat(24), listId = "b".repeat(24), cardId = "c".repeat(24);
  assert.deepEqual(nodeConfigIssues("action.trello.move-card", { boardId, listId, cardId }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.trello.move-card", { boardId, listId: "bad", cardId }, "resolved")[0]?.field, "listId");
  assert.equal(nodeConfigIssues("action.trello.find-cards", { boardId, query: "report", searchPagination: "pages" }, "resolved")[0]?.field, "page");
  assert.deepEqual(nodeConfigIssues("action.trello.find-cards", { boardId, query: "report", searchPagination: "first" }, "resolved"), []);
});

test("Notion validates resources and conditional property filters", () => {
  const pageId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(nodeConfigIssues("action.notion.retrieve-page", { pageId }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.notion.create-page", { parentPageId: pageId, title: " " }, "resolved")[0]?.field, "title");
  assert.equal(nodeConfigIssues("action.notion.query-data-source", { dataSourceId: pageId, filterMode: "checkbox", filterProperty: "done", filterValue: "maybe" }, "resolved")[0]?.field, "filterValue");
});

test("Gmail actions check recipients and IDs before any provider request", () => {
  const message = { to: "owner@example.test", subject: "Report", text: "Hello" };
  assert.deepEqual(nodeConfigIssues("action.gmail.send", message, "resolved"), []);
  assert.equal(nodeConfigIssues("action.gmail.send", { ...message, to: "invalid" }, "resolved")[0]?.field, "to");
  assert.equal(nodeConfigIssues("action.gmail.reply", { ...message, messageId: "../invalid" }, "resolved")[0]?.field, "messageId");
  assert.deepEqual(nodeConfigIssues("action.gmail.modify-label", { messageId: "abc", labelId: "INBOX", labelAction: "add" }, "resolved"), []);
});

test("Calendar configuration validates time ranges and continuation context", () => {
  const valid = { calendarId: "primary", summary: "Meeting", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z" };
  assert.deepEqual(nodeConfigIssues("action.google-calendar.create-event", valid, "resolved"), []);
  assert.equal(nodeConfigIssues("action.google-calendar.create-event", { ...valid, end: "2030-01-01T08:00:00Z" }, "resolved")[0]?.field, "end");
  assert.equal(nodeConfigIssues("action.google-calendar.list-events", { pageToken: "next" }, "resolved")[0]?.field, "pageToken");
  assert.deepEqual(nodeConfigIssues("action.google-calendar.list-events", { pageToken: "next", timeMin: valid.start }, "resolved"), []);
});

test("relational schemas validate identifiers, selection limits and pagination prerequisites", () => {
  assert.deepEqual(nodeConfigIssues("action.postgres.select", { schema: "public", table: "items", limit: 20 }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.postgres.select", { schema: "public", table: "items", offset: 1 }, "resolved")[0]?.field, "offset");
  assert.equal(nodeConfigIssues("action.supabase.select", { table: "items", offset: 1 }, "resolved")[0]?.field, "offset");
  assert.equal(nodeConfigIssues("action.supabase.insert-row", { table: "items", fields: [] }, "resolved")[0]?.field, "fields");
  assert.deepEqual(nodeConfigIssues("action.postgres.select", { schema: "public", table: "items", columns: ["{{ steps.previous.output.column }}"] }, "static"), []);
  assert.equal(nodeConfigIssues("action.postgres.select", { schema: "public", table: "items", columns: [undefined] }, "resolved")[0]?.field, "columns");
});

test("Riot configuration requires only inputs for the chosen game operation", () => {
  assert.deepEqual(nodeConfigIssues("action.riot-lol", { operation: "accountByRiotId", gameName: "Player", tagLine: "VN" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.riot-lol", { operation: "match", matchId: "../bad" }, "resolved")[0]?.field, "matchId");
  assert.deepEqual(nodeConfigIssues("action.riot-tft", { operation: "status" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.riot-tft", { operation: "matchIds", puuid: "player", count: 101 }, "resolved")[0]?.field, "count");
});

test("Discord webhook validates messages, embeds and allowed mentions", () => {
  assert.deepEqual(nodeConfigIssues("action.discord.webhook", { content: "Hello", allowedMentions: "{\"parse\":[]}" }, "resolved"), []);
  assert.deepEqual(nodeConfigIssues("action.discord.webhook", { content: "", embeds: "[{\"title\":\"Report\"}]" }, "resolved"), []);
  assert.deepEqual(nodeConfigIssues("action.discord.webhook", { embeds: "[{\"title\":\"Report\"}]" }, "resolved"), []);
  assert.equal(nodeConfigIssues("action.discord.webhook", { content: "Hello", allowedMentions: "{\"parse\":[\"invalid\"]}" }, "resolved")[0]?.field, "allowedMentions");
});

test("trigger and condition schemas retain defaults and validate supported filters", () => {
  assert.deepEqual(nodeConfigIssues("trigger.manual", {}, "resolved"), []);
  assert.equal(nodeConfigIssues("trigger.cron", { expression: "" }, "resolved")[0]?.field, "expression");
  assert.deepEqual(nodeConfigIssues("trigger.gmail", { mailbox: "inbox", pollMinutes: "5" }, "resolved"), []);
  assert.equal(nodeConfigIssues("trigger.telegram.update", { event: "message", chatMode: "allowlist", allowedChatIds: "" }, "resolved")[0]?.field, "allowedChatIds");
  assert.deepEqual(nodeConfigIssues("condition.if", {}, "resolved"), []);
  assert.equal(nodeConfigIssues("condition.switch", { cases: [{ value: "same" }, { value: "same" }] }, "resolved")[0]?.field, "cases");
});
