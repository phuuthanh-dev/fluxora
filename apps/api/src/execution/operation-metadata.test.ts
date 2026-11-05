import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { executableWorkflowNodeTypes, getSharedNodeConfigurationFields, workflowNodeTypes } from "@workflow/contracts";
import { getOperationMetadata } from "@workflow/contracts/dist/operation-metadata";
import { executeGoogleCalendar, listCalendarEvents } from "./google-calendar";
import { executeNotionSearch } from "./notion-search";
import { executeNode } from "./execution.service";
import { NodeFailure } from "./node-failure";
import { getConnectorExecutor, registeredConnectorNodeTypes } from "./connector-executors";

test("each executable node has a registry executor, dispatcher branch or shared trigger branch", () => {
  const source = ts.createSourceFile("execution.service.ts", readFileSync(join(__dirname, "execution.service.ts"), "utf8"), ts.ScriptTarget.Latest, true);
  const dispatch = source.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === "executeNode");
  assert.ok(dispatch?.body);
  const branches = new Set<string>();
  let sharedTriggers = false;
  const isNodeType = (node: ts.Node) => ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "node" && node.name.text === "type";
  const visit = (node: ts.Node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      if (isNodeType(node.left) && ts.isStringLiteral(node.right)) branches.add(node.right.text);
      if (isNodeType(node.right) && ts.isStringLiteral(node.left)) branches.add(node.left.text);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "startsWith" && isNodeType(node.expression.expression) && node.arguments.length === 1) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument) && argument.text === "trigger.") sharedTriggers = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(dispatch.body);
  assert.equal(sharedTriggers, true);
  for (const type of registeredConnectorNodeTypes) {
    assert.ok(executableWorkflowNodeTypes.includes(type), type);
    assert.equal(branches.has(type), false, `${type} has duplicate handlers`);
    assert.equal(getOperationMetadata(type)?.availability, "executable", type);
  }
  for (const type of executableWorkflowNodeTypes.filter((candidate) => candidate.startsWith("action."))) assert.ok(getConnectorExecutor(type), `${type} is missing from the action registry`);
  for (const type of executableWorkflowNodeTypes) assert.ok(type.startsWith("trigger.") ? sharedTriggers : branches.has(type) || getConnectorExecutor(type), `missing executor: ${type}`);
  for (const type of ["__proto__", "toString", "action.facebook-meta", "action.imaginary"]) assert.equal(getConnectorExecutor(type), undefined);
});

test("catalog executable nodes reach a mock handler without reading credentials", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("Mock execution attempted to read a credential"); } }) as never;
  for (const type of workflowNodeTypes) {
    const node = { id: "test", type, position: { x: 0, y: 0 }, config: {} };
    try {
      const result = await executeNode(node, {}, {}, "mock", "synthetic-workspace", credentials, "synthetic-execution");
      assert.ok(executableWorkflowNodeTypes.includes(type as typeof executableWorkflowNodeTypes[number]), `${type} is planned but executed`);
      assert.ok(result.status === "succeeded" || result.status === "waiting", `${type} returned an unexpected status`);
    } catch (error) {
      assert.ok(error instanceof NodeFailure, `${type} raised an unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      if (executableWorkflowNodeTypes.includes(type as typeof executableWorkflowNodeTypes[number])) assert.notEqual(error.code, "NODE_UNAVAILABLE", `${type} is declared executable but has no mock handler`);
      else assert.equal(error.code, "NODE_UNAVAILABLE", `${type} is planned but did not fail closed`);
    }
  }
});

test("trigger metadata describes the common output wrapper without assuming a provider payload", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("Trigger dispatch must not read credentials"); } }) as never;
  const payload = { source: "synthetic", data: { id: 1 } };
  for (const type of executableWorkflowNodeTypes.filter((candidate) => candidate.startsWith("trigger."))) {
    const node = { id: "trigger", type, position: { x: 0, y: 0 }, config: {} };
    const metadata = getOperationMetadata(type);
    assert.ok(metadata && "knownFields" in metadata.output, type);
    assert.deepEqual(metadata.output.knownFields, ["received"], type);
    for (const mode of ["mock", "live"] as const) {
      const result = await executeNode(node, {}, { trigger: payload }, mode, "workspace", credentials, "execution");
      assert.deepEqual(result.output, { received: payload }, `${type} ${mode}`);
    }
  }
});

test("approval and Drive metadata only describe common output fields", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("Mock must not read credentials"); } }) as never;
  for (const [type, configs] of [
    ["approval.request", [{}]],
    ["action.google-drive", [{ operation: "list" }, { operation: "search" }, { operation: "uploadText" }, { operation: "downloadText" }]],
  ] as const) {
    const metadata = getOperationMetadata(type);
    assert.ok(metadata && "knownFields" in metadata.output, type);
    for (const config of configs) {
      const node = { id: "node", type, position: { x: 0, y: 0 }, config };
      const result = await executeNode(node, config, {}, "mock", "workspace", credentials, "execution");
      for (const field of metadata.output.knownFields) assert.ok(Object.hasOwn(result.output, field), `${type} is missing ${field}`);
    }
  }
});

test("notification receipt metadata matches successful mock output", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("Mock must not read credentials"); } }) as never;
  for (const type of ["action.google-chat.webhook", "action.discord.webhook", "action.telegram.message", "action.telegram.reply", "action.telegram.edit-message"] as const) {
    const config = { message: "Example", content: "Example", text: "Example", chatId: "12345", messageId: "1" };
    const node = { id: "send", type, position: { x: 0, y: 0 }, config };
    const result = await executeNode(node, config, {}, "mock", "workspace", credentials, "execution");
    const metadata = getOperationMetadata(type);
    assert.ok(metadata && "knownFields" in metadata.output, type);
    for (const field of metadata.output.knownFields) assert.ok(Object.hasOwn(result.output, field), `${type} is missing ${field}`);
    assert.equal(result.output.mode, "mock", type);
  }
});

test("configured mock outputs contain the fields advertised by operation metadata", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("Mock must not read credentials"); } }) as never;
  const cases = [
    ["action.google-drive.get-file", { fileId: "synthetic-file" }],
    ["action.google-drive.create-folder", { name: "Example folder" }],
    ["action.mongodb", { database: "example", collection: "items" }],
    ["action.mongodb.insert", { database: "example", collection: "items", document: { name: "sample" } }],
    ["action.postgres.select", { schema: "public", table: "items" }],
    ["action.supabase.select", { table: "items" }],
    ["action.rss.read", { url: "https://example.test/feed.xml" }],
    ["action.http-request", { url: "https://example.test/", method: "GET" }],
    ["action.email", { to: "recipient@example.test", subject: "Example", body: "Example" }],
    ["action.notion.retrieve-page", { pageId: "01234567-89ab-cdef-0123-456789abcdef" }],
    ["action.trello.create-card", { boardId: "aaaaaaaaaaaaaaaaaaaaaaaa", listId: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Example" }],
    ["action.trello.get-card", { cardId: "cccccccccccccccccccccccc" }],
    ["action.trello.update-card", { cardId: "cccccccccccccccccccccccc", title: "Example" }],
    ["action.trello.move-card", { cardId: "cccccccccccccccccccccccc", boardId: "aaaaaaaaaaaaaaaaaaaaaaaa", listId: "bbbbbbbbbbbbbbbbbbbbbbbb" }],
    ["action.trello.archive-card", { cardId: "cccccccccccccccccccccccc" }],
    ["action.sentry.get-issue", { organization: "example", project: "project", issueId: "123" }],
    ["action.vercel.public-deployment-lookup", { deploymentId: "dpl_example" }],
    ["action.reddit.list-posts", { subreddit: "example" }],
    ["action.github", { repository: "example/project", title: "Example issue" }],
    ["action.github.add-label", { repository: "example/project", issueNumber: 1, label: "example" }],
    ["action.github.add-comment", { repository: "example/project", issueNumber: 1, body: "Example" }],
    ["action.github.merge-pull-request", { repository: "example/project", pullRequestNumber: 1 }],
    ["action.github.list-issues", { repository: "example/project" }],
    ["action.github.get-issue", { repository: "example/project", issueNumber: 1 }],
    ["action.github.update-issue", { repository: "example/project", issueNumber: 1, field: "title", title: "Updated" }],
    ["action.github.list-pull-requests", { repository: "example/project" }],
    ["action.github.get-pull-request", { repository: "example/project", pullRequestNumber: 1 }],
    ["action.gmail.get-message", { messageId: "message-1" }],
    ["action.gmail.read", { mailbox: "inbox" }],
    ["action.gmail.read.v2", { mailbox: "inbox" }],
    ["action.gmail.send", { to: "a@example.test", subject: "Example", text: "Hello" }],
    ["action.gmail.reply", { to: "a@example.test", messageId: "message-1", text: "Hello" }],
    ["action.gmail.create-draft", { to: "a@example.test", subject: "Example", text: "Hello" }],
    ["action.gmail.update-draft", { to: "a@example.test", draftId: "draft-1", subject: "Example", text: "Hello" }],
    ["action.gmail.modify-label", { messageId: "message-1", labelId: "Label_1", labelAction: "add" }],
    ["action.notion.query-data-source", { dataSourceId: "01234567-89ab-cdef-0123-456789abcdef" }],
    ["action.notion.search-pages", { query: "Example" }],
    ["action.notion.list-children", { blockId: "01234567-89ab-cdef-0123-456789abcdef" }],
    ["action.notion.retrieve-property", { pageId: "01234567-89ab-cdef-0123-456789abcdef", propertyId: "title" }],
    ["action.notion.create-page", { parentPageId: "01234567-89ab-cdef-0123-456789abcdef", title: "Example" }],
    ["action.notion.update-title", { pageId: "01234567-89ab-cdef-0123-456789abcdef", title: "Example" }],
    ["action.google-calendar.create-event", { calendarId: "primary", summary: "Example", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z" }],
    ["action.google-calendar.get-event", { calendarId: "primary", eventId: "event-1" }],
    ["action.google-calendar.update-event", { calendarId: "primary", eventId: "event-1", summary: "Updated" }],
    ["action.google-calendar.delete-event", { calendarId: "primary", eventId: "event-1" }],
    ["action.google-calendar.availability", { calendarId: "primary", start: "2030-01-01T09:00:00Z", end: "2030-01-01T10:00:00Z" }],
    ["action.steam", { operation: "profile" }],
    ["action.steam.account-snapshot", {}],
    ["action.google-sheets", { operation: "read", range: "Sheet1!A1:B2" }],
    ["action.google-sheets.v2", { operation: "read", range: "Sheet1!A1:B2" }],
    ["action.sentry.list-issues", { organization: "example", project: "project" }],
    ["action.vercel.list-deployments", { team: "personal", project: "prj_example" }],
    ["action.supabase.insert-row", { table: "items", fields: [{ column: "name", type: "text", value: "Sample" }] }],
    ["action.riot-lol", { operation: "accountByRiotId", platform: "vn2", gameName: "Test Player", tagLine: "VN2" }],
    ["action.riot-tft", { operation: "accountByRiotId", platform: "vn2", gameName: "Test Player", tagLine: "VN2" }],
  ] as const;
  for (const [type, config] of cases) {
    const node = { id: "example", type, position: { x: 0, y: 0 }, config };
    const result = await executeNode(node, config, {}, "mock", "workspace", credentials, "execution");
    const metadata = getOperationMetadata(type);
    assert.ok(metadata && "knownFields" in metadata.output, type);
    for (const field of metadata.output.knownFields) assert.ok(Object.hasOwn(result.output, field), `${type} is missing ${field}`);
  }
});

test("numeric inspector defaults match relational reads and Trello search requires an explicit page", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("Mock must not read credentials"); } }) as never;
  for (const [type, config] of [
    ["action.postgres.select.v2", { schema: "public", table: "items" }],
    ["action.supabase.select.v2", { table: "items" }],
  ] as const) {
    const field = getSharedNodeConfigurationFields(type)?.find((candidate) => candidate.kind === "number" && candidate.key === "limit");
    assert.ok(field && field.kind === "number" && field.fallbackValue !== undefined, type);
    const result = await executeNode({ id: "node", type, position: { x: 0, y: 0 }, config }, config, {}, "mock", "workspace", credentials, "execution");
    assert.equal((result.output.page as { limit: number }).limit, field.fallbackValue, type);
  }
  const type = "action.trello.find-cards" as const;
  const page = getSharedNodeConfigurationFields(type)?.find((candidate) => candidate.kind === "number" && candidate.key === "page");
  assert.ok(page && page.kind === "number");
  assert.equal(page.fallbackValue, undefined);
  const config = { boardId: "aaaaaaaaaaaaaaaaaaaaaaaa", query: "sample", searchPagination: "pages" };
  await assert.rejects(executeNode({ id: "node", type, position: { x: 0, y: 0 }, config }, config, {}, "mock", "workspace", credentials, "execution"), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
});

test("calendar metadata describes the actual synthetic continuation and stable start time", async () => {
  const metadata = getOperationMetadata("action.google-calendar.list-events");
  assert.ok(metadata && metadata.pagination.kind === "continuation");
  const pagination = metadata.pagination;
  const first = await listCalendarEvents("synthetic-token", "primary", 2, async () => Response.json({ items: [], nextPageToken: "synthetic-next" }), new Date("2030-01-01T00:00:00Z"));
  const result = first as Record<string, unknown>;
  assert.equal(result[pagination.next], "synthetic-next");
  assert.equal(result[pagination.hasMore!], true);
  const config = { [pagination.input]: result[pagination.next], [pagination.preserve![0]!]: result[pagination.preserve![0]!] };
  const continued = await executeGoogleCalendar(config, "mock", "workspace", {} as never);
  assert.equal(continued.output.timeMin, result.timeMin);
  await assert.rejects(executeGoogleCalendar({ [pagination.input]: result[pagination.next] }, "mock", "workspace", {} as never));
  if ("knownFields" in metadata.output) for (const key of metadata.output.knownFields) assert.ok(key in continued.output, key);
});

test("Notion search exposes an input cursor and the advertised output fields", async () => {
  const metadata = getOperationMetadata("action.notion.search-pages.v2");
  assert.ok(metadata && metadata.pagination.kind === "continuation");
  assert.equal(metadata.pagination.input, "cursor");
  const result = await executeNotionSearch({}, "mock", "workspace", { readForExecution: () => { throw new Error("mock must not read credentials"); } } as never);
  assert.ok(metadata.pagination.next in result.output);
  assert.ok(metadata.pagination.hasMore! in result.output);
  if ("knownFields" in metadata.output) for (const key of metadata.output.knownFields) assert.ok(key in result.output, key);
});

test("relational offset metadata matches v2 outputs without claiming a next page", async () => {
  for (const [type, selection, preserve] of [
    ["action.postgres.select.v2", { schema: "public", orderBy: "id", orderDirection: "asc" }, ["credentialId", "schema", "table", "limit", "columns", "conditions", "orderBy", "orderDirection"]],
    ["action.supabase.select.v2", { order: [{ column: "id", direction: "asc" }] }, ["credentialId", "table", "limit", "columns", "filters", "order", "rejectUnsafeNumbers"]],
  ] as const) {
    const metadata = getOperationMetadata(type);
    assert.ok(metadata && metadata.pagination.kind === "offset");
    assert.deepEqual(metadata.pagination.preserve, preserve);
    const config = { table: "items", limit: 5, [metadata.pagination.input]: 5, ...selection };
    const node = { id: "read", type, position: { x: 0, y: 0 }, config };
    const result = await executeNode(node, config, {}, "mock", "workspace", {} as never, "execution");
    assert.deepEqual(result.output[metadata.pagination.page], { limit: 5, offset: 5, completeness: "unknown" });
    if ("knownFields" in metadata.output) for (const key of metadata.output.knownFields) assert.ok(key in result.output, key);
    assert.ok(!("hasMore" in result.output));
    assert.ok(!("nextOffset" in result.output));
    assert.equal(getOperationMetadata(type.replace(".v2", ""))?.pagination.kind, "unspecified");
  }
});

test("AI metadata describes outputs common to plain and structured mock runs", async () => {
  const schema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };
  for (const type of ["action.openai", "action.gemini"] as const) for (const structured of [false, true]) {
    const metadata = getOperationMetadata(type);
    assert.ok(metadata && "knownFields" in metadata.output);
    assert.deepEqual(metadata.output.knownFields, ["text", "model", "finishReason"]);
    const config = { model: "example", prompt: "Hello", ...(structured ? { outputSchema: schema } : {}) };
    const node = { id: "ai", type, position: { x: 0, y: 0 }, config };
    const result = await executeNode(node, config, {}, "mock", "workspace", {} as never, "execution");
    for (const field of metadata.output.knownFields) assert.ok(field in result.output, `${type} ${field}`);
    assert.equal("json" in result.output, structured);
    assert.ok(!("usage" in result.output));
  }
});

test("continuation metadata identifies the connection and query context that must stay consistent", () => {
  for (const [type, expected] of [
    ["action.notion.search-pages.v2", ["credentialId", "query", "pageSize", "collectPages"]],
    ["action.notion.list-children", ["credentialId", "blockId", "pageSize"]],
    ["action.notion.retrieve-property", ["credentialId", "pageId", "propertyId", "pageSize"]],
    ["action.trello.list-cards", ["credentialId", "boardId", "filter", "limit"]],
    ["action.github.list-issues", ["credentialId", "repository", "state", "pageSize"]],
    ["action.github.list-pull-requests", ["credentialId", "repository", "state", "pageSize"]],
    ["action.sentry.list-issues.v2", ["credentialId", "organization", "project", "status", "limit"]],
    ["action.vercel.list-deployments.v2", ["credentialId", "team", "project", "limit"]],
  ] as const) {
    const metadata = getOperationMetadata(type);
    assert.ok(metadata && metadata.pagination.kind === "continuation", type);
    assert.deepEqual(metadata.pagination.preserve, expected, type);
  }
});

test("Drive v2 advertises pagination only for list and search, matching the dispatcher", async () => {
  const metadata = getOperationMetadata("action.google-drive.v2");
  assert.ok(metadata && metadata.pagination.kind === "conditional");
  const pagination = metadata.pagination;
  assert.equal(pagination.selector, "operation");
  assert.equal(pagination.fallback, "list");
  assert.deepEqual(pagination.cases[0]?.values, ["list", "search"]);
  const continuation = pagination.cases[0]!.pagination;
  assert.equal(continuation.input, "pageToken");
  assert.ok(continuation.preserve?.includes("collectPages"));
  assert.equal(continuation.next, "nextPageToken");
  for (const operation of ["list", "search", "uploadText", "downloadText"]) {
    const config = { operation, pageToken: "synthetic-page" };
    const node = { id: "drive", type: "action.google-drive.v2" as const, position: { x: 0, y: 0 }, config };
    const result = await executeNode(node, config, {}, "mock", "workspace", {} as never, "execution");
    assert.equal(continuation.next in result.output, operation === "list" || operation === "search", operation);
  }
  const config = {};
  const node = { id: "drive", type: "action.google-drive.v2" as const, position: { x: 0, y: 0 }, config };
  const result = await executeNode(node, config, {}, "mock", "workspace", {} as never, "execution");
  assert.equal(result.output.operation, pagination.fallback);
  assert.ok(continuation.next in result.output);
  await assert.rejects(executeNode({ ...node, config: { operation: "unknown" } }, { operation: "unknown" }, {}, "mock", "workspace", {} as never, "execution"), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
  await assert.rejects(executeNode({ ...node, config: { operation: "list", collectPages: "yes" } }, { operation: "list", collectPages: "yes" }, {}, "mock", "workspace", {} as never, "execution"), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
  assert.equal(getOperationMetadata("action.google-drive")?.pagination.kind, "unspecified");
});
