import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { executableWorkflowNodeTypes } from "@workflow/contracts";
import { getOperationMetadata } from "@workflow/contracts/dist/operation-metadata";
import { executeGoogleCalendar, listCalendarEvents } from "./google-calendar";
import { executeNotionSearch } from "./notion-search";

test("each executable node has a dispatcher branch or the shared trigger branch", () => {
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
  for (const type of executableWorkflowNodeTypes) assert.ok(type.startsWith("trigger.") ? sharedTriggers : branches.has(type), `missing dispatch branch: ${type}`);
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
