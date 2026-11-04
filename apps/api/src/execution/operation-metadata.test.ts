import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { executableWorkflowNodeTypes, workflowNodeTypes } from "@workflow/contracts";
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

test("continuation metadata identifies the connection and query context that must stay consistent", () => {
  for (const [type, expected] of [
    ["action.notion.search-pages.v2", ["credentialId", "query", "pageSize"]],
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
  assert.equal(getOperationMetadata("action.google-drive")?.pagination.kind, "unspecified");
});
