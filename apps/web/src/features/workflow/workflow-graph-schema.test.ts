import assert from "node:assert/strict";
import test from "node:test";
import { executableWorkflowNodeTypes, isExecutableWorkflowNodeType } from "@workflow/contracts";
import { availableCatalogTypes, createNodeData, getNodeDefinition, initialEdges, initialNodes, nodeCatalog } from "./node-catalog";
import { parseWorkflowCanvasGraph } from "./workflow-graph-schema";
import { graphForApi, graphFromApi } from "./workflow-api";

test("accepts a valid exported workflow graph", () => {
  const graph = parseWorkflowCanvasGraph(structuredClone({ nodes: initialNodes, edges: initialEdges }));

  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(graph.edges.map((edge) => edge.kind), ["success", "success"]);
});

test("API round-trip preserves unversioned legacy nodes and versioned new nodes", () => {
  const legacy = { nodes: [{ id: "manual", type: "trigger.manual" as const, position: { x: 0, y: 0 }, config: {} }], edges: [] };
  assert.deepEqual(graphForApi(graphFromApi(legacy)), legacy);
  const versioned = { ...legacy, nodes: [{ ...legacy.nodes[0]!, nodeVersion: 1 }] };
  assert.deepEqual(graphForApi(graphFromApi(versioned)), versioned);
  assert.equal(createNodeData(getNodeDefinition("trigger.manual")!).nodeVersion, 1);
  assert.throws(() => graphFromApi({ ...legacy, nodes: [{ ...legacy.nodes[0]!, nodeVersion: 2 }] }), /Unsupported node version/);
});

test("advanced pagination help belongs to the Calendar field, not its key globally", () => {
  const calendar = getNodeDefinition("action.google-calendar.list-events");
  const pagination = calendar?.configurationFields?.find((field) => field.key === "pageToken");
  assert.ok(pagination && pagination.kind === "text");
  assert.equal(pagination.advanced?.summary, "Advanced pagination");
  assert.match(pagination.advanced?.help ?? "", /same calendar and limit/i);
  for (const definition of nodeCatalog.filter((node) => node.type !== calendar?.type)) {
    for (const field of definition.configurationFields ?? []) {
      if (field.key === "pageToken" && field.kind === "text") {
        assert.notEqual(field.advanced?.help, pagination.advanced?.help);
      }
    }
  }
});

test("rejects malformed graph data before it reaches the editor", () => {
  assert.throws(
    () => parseWorkflowCanvasGraph({ nodes: [{}], edges: [] }),
    /Invalid input/,
  );
});

test("rejects an edge whose branch does not match its source node", () => {
  const graph = structuredClone({ nodes: initialNodes, edges: initialEdges });
  const firstEdge = graph.edges[0];
  assert.ok(firstEdge);
  firstEdge.kind = "true";

  assert.throws(
    () => parseWorkflowCanvasGraph(graph),
    /invalid branch/,
  );
});

test("keeps schema-only connector nodes importable while marking them unavailable", () => {
  for (const type of ["action.facebook-meta", "action.instagram"]) {
    const definition = getNodeDefinition(type);
    assert.ok(definition);
    assert.equal(definition.available, false);
  }
  const email = getNodeDefinition("action.email");
  assert.ok(email);
  assert.equal(email.available, true);
  assert.deepEqual(email.defaultConfig, { credentialId: "", to: "", cc: "", bcc: "", subject: "", body: "", bodyFormat: "text", replyTo: "" });
  assert.deepEqual(email.configurationFields?.[0], { kind: "credential", key: "credentialId", label: "SMTP credential", providers: ["SMTP"] });
  const graph = parseWorkflowCanvasGraph({ nodes: [{ id: "email", type: "workflowNode" as const, position: { x: 0, y: 0 }, data: createNodeData(email) }], edges: [] });
  assert.equal(graph.nodes[0]?.data.config.subject, "");
  assert.ok(nodeCatalog.length > 10);
});

test("MongoDB and Google Chat OAuth use dedicated credentials and resource pickers", () => {
  for (const [type, provider] of [["action.mongodb", "MONGODB"], ["action.mongodb.insert", "MONGODB"], ["action.google-chat.oauth", "GOOGLE_CHAT_OAUTH"]] as const) {
    const definition = getNodeDefinition(type);
    assert.equal(definition?.available, true);
    assert.equal(isExecutableWorkflowNodeType(type), true);
    assert.equal(definition?.configurationFields?.some((field) => field.kind === "credential" && field.providers.includes(provider)), true);
    assert.equal(definition?.configurationFields?.some((field) => field.kind === "resource"), true);
  }
});

test("Gemini generation uses a dedicated credential and model picker", () => {
  const gemini = getNodeDefinition("action.gemini");
  assert.equal(gemini?.available, true);
  assert.equal(isExecutableWorkflowNodeType("action.gemini"), true);
  assert.deepEqual(gemini?.configurationFields?.[0], { kind: "credential", key: "credentialId", label: "Gemini credential", providers: ["GEMINI"] });
  assert.equal(gemini?.configurationFields?.find((field) => field.key === "model")?.kind, "resource");
});

test("OpenAI generation uses a dedicated credential and model picker", () => {
  const definition = getNodeDefinition("action.openai");
  assert.equal(definition?.available, true);
  assert.equal(isExecutableWorkflowNodeType("action.openai"), true);
  assert.deepEqual(definition?.configurationFields?.[0], { kind: "credential", key: "credentialId", label: "OpenAI credential", providers: ["OPENAI"] });
  assert.equal(definition?.configurationFields?.find((field) => field.key === "model")?.kind, "resource");
});

test("Notion page search has its own connection and search operation", () => {
  const notion = getNodeDefinition("action.notion.search-pages");
  assert.equal(notion?.available, true);
  assert.equal(notion?.operationKind, "search");
  assert.deepEqual(notion?.configurationFields?.[0], { kind: "credential", key: "credentialId", label: "Notion credential", providers: ["NOTION"] });
});

test("RSS read is executable without a credential", () => {
  const rss = getNodeDefinition("action.rss.read");
  assert.equal(rss?.available, true);
  assert.equal(isExecutableWorkflowNodeType("action.rss.read"), true);
  assert.equal(rss?.configurationFields?.some((field) => field.kind === "credential"), false);
  assert.equal(rss?.configurationFields?.some((field) => field.key === "url"), true);
});

test("Gmail read uses its own connection and guided mailbox filter", () => {
  const gmail = getNodeDefinition("action.gmail.read");
  assert.equal(gmail?.available, true);
  assert.deepEqual(gmail?.configurationFields?.[0], { kind: "credential", key: "credentialId", label: "Gmail credential", providers: ["GMAIL"] });
  assert.equal(gmail?.configurationFields?.find((field) => field.key === "mailbox")?.kind, "select");
});

test("GitHub Create Issue is executable with a separate connector credential", () => {
  const definition = getNodeDefinition("action.github");
  assert.ok(definition);
  assert.equal(definition.available, true);
  assert.deepEqual(definition.defaultConfig, { credentialId: "", repository: "", title: "", body: "", labels: "", idempotencyKey: "" });
  assert.deepEqual(definition.configurationFields?.[0], { kind: "credential", key: "credentialId", label: "GitHub credential", providers: ["GITHUB"] });
  assert.equal(definition.configurationFields?.find((field) => field.key === "repository")?.kind, "resource");
  const addLabel = getNodeDefinition("action.github.add-label");
  assert.ok(addLabel);
  assert.equal(addLabel.available, true);
  assert.deepEqual(addLabel.defaultConfig, { credentialId: "", repository: "", issueNumber: "", label: "" });
  const addComment = getNodeDefinition("action.github.add-comment");
  assert.ok(addComment);
  assert.equal(addComment.available, true);
  assert.deepEqual(addComment.defaultConfig, { credentialId: "", repository: "", issueNumber: "", body: "" });
  const mergePullRequest = getNodeDefinition("action.github.merge-pull-request");
  assert.ok(mergePullRequest);
  assert.equal(mergePullRequest.available, true);
  assert.deepEqual(mergePullRequest.defaultConfig, { credentialId: "", repository: "", pullRequestNumber: "", mergeMethod: "merge" });
  assert.equal(mergePullRequest.configurationFields?.find((field) => field.key === "mergeMethod")?.kind, "select");
  const githubTrigger = getNodeDefinition("trigger.github.issue-opened");
  assert.ok(githubTrigger);
  assert.equal(githubTrigger.available, true);
  assert.deepEqual(githubTrigger.defaultConfig, { path: "github-issue-opened", credentialId: "", event: "issues", action: "opened" });
  assert.equal(githubTrigger.configurationFields?.find((field) => field.key === "repository")?.kind, "resource");
  const githubPullRequestTrigger = getNodeDefinition("trigger.github.pull-request-opened");
  assert.ok(githubPullRequestTrigger);
  assert.equal(githubPullRequestTrigger.available, true);
  assert.deepEqual(githubPullRequestTrigger.defaultConfig, { path: "github-pull-request-opened", credentialId: "", event: "pull_request", action: "opened" });
  const githubPushTrigger = getNodeDefinition("trigger.github.push");
  assert.ok(githubPushTrigger);
  assert.equal(githubPushTrigger.available, true);
  assert.deepEqual(githubPushTrigger.defaultConfig, { path: "github-push", credentialId: "", event: "push", action: "" });
  const githubWorkflowRunTrigger = getNodeDefinition("trigger.github.workflow-run-completed");
  assert.ok(githubWorkflowRunTrigger);
  assert.equal(githubWorkflowRunTrigger.available, true);
  assert.deepEqual(githubWorkflowRunTrigger.defaultConfig, { path: "github-workflow-run-completed", credentialId: "", event: "workflow_run", action: "completed" });
});

test("HTTP configuration exposes runtime headers through a structured field", () => {
  const definition = getNodeDefinition("action.http-request");
  assert.ok(definition);
  const headers = definition.configurationFields?.find((field) => field.key === "headers");
  assert.deepEqual(headers, { kind: "key-value", key: "headers", label: "Headers (optional)", keyPlaceholder: "Header name", valuePlaceholder: "Header value" });
});

test("Google connector fields follow operation-specific runtime contracts", () => {
  const drive = getNodeDefinition("action.google-drive");
  assert.ok(drive);
  assert.deepEqual(drive.configurationFields?.find((field) => field.key === "name")?.visibleWhen, { key: "operation", equals: "uploadText" });
  assert.deepEqual(drive.configurationFields?.find((field) => field.key === "text")?.visibleWhen, { key: "operation", equals: "uploadText" });

  const sheetsV2 = getNodeDefinition("action.google-sheets.v2");
  assert.ok(sheetsV2);
  const inputOption = sheetsV2.configurationFields?.find((field) => field.key === "valueInputOption");
  assert.equal(inputOption?.kind, "select");
  assert.deepEqual(inputOption?.visibleWhen, { key: "operation", equals: ["append", "update"] });
  assert.equal(sheetsV2.defaultConfig.valueInputOption, "USER_ENTERED");

  const sheets = getNodeDefinition("action.google-sheets");
  assert.ok(sheets);
  assert.equal(sheets.configurationFields?.find((field) => field.key === "values")?.kind, "table");
  assert.deepEqual(sheets.configurationFields?.find((field) => field.key === "values")?.visibleWhen, { key: "operation", equals: ["append", "update"] });
});

test("Steam uses the shared configuration field contract for its simple controls", () => {
  const definition = getNodeDefinition("action.steam.account-snapshot");
  assert.ok(definition);
  assert.deepEqual(definition.configurationFields?.map((field) => field.key), [
    "credentialId",
    "steamId",
    "includeOwnedGames",
    "includeRecentGames",
    "achievementAppId",
  ]);
  assert.equal(definition.configurationFields?.find((field) => field.key === "includeOwnedGames")?.kind, "boolean");
  assert.equal(definition.configurationFields?.find((field) => field.key === "credentialId")?.kind, "credential");
});

test("executable node capabilities stay aligned with the UI catalog", () => {
  const sortTypes = (types: readonly string[]) => [...types].sort();
  assert.deepEqual(sortTypes(availableCatalogTypes()), sortTypes(executableWorkflowNodeTypes));
  assert.equal(nodeCatalog.filter((definition) => definition.available).length, executableWorkflowNodeTypes.length);
  assert.ok(nodeCatalog.filter((definition) => !definition.available).every((definition) => !isExecutableWorkflowNodeType(definition.type)));
});


test("relational v2 types round trip without changing historical types", () => {
  for (const type of ["action.postgres.select.v2", "action.supabase.select.v2"] as const) {
    const graph = { nodes: [{ id: "read", type, nodeVersion: 1, position: { x: 0, y: 0 }, config: { table: "items", columns: ["id"], custom: "retained" } }], edges: [] };
    assert.deepEqual(graphForApi(graphFromApi(graph)), graph);
    assert.equal(createNodeData(getNodeDefinition(type)!).nodeVersion, 1);
  }
});

test("Sheets input mode survives draft export and import", () => {
  const graph = { nodes: [{ id: "sheet", type: "action.google-sheets.v2" as const, nodeVersion: 1, position: { x: 0, y: 0 }, config: { operation: "append", valueInputOption: "RAW", values: [["=1+2"]] } }], edges: [] };
  assert.deepEqual(graphForApi(graphFromApi(graph)), graph);
});

test("library offers one current selection per provider while old graphs remain supported", async () => {
  const { operationsForApp, matchesNodeLibraryFilter, libraryNodeType } = await import("./node-catalog");
  assert.equal(libraryNodeType("action.google-sheets"), "action.google-sheets.v2");
  assert.deepEqual(operationsForApp("google-sheets").filter((node) => node.operationId === "read-write-rows").map((node) => node.type), ["action.google-sheets.v2"]);
  for (const provider of ["postgres", "supabase"] as const) {
    const oldType = `action.${provider}.select`;
    const currentType = `${oldType}.v2`;
    assert.equal(getNodeDefinition(oldType)?.available, true);
    assert.equal(matchesNodeLibraryFilter(getNodeDefinition(oldType)!, "all", provider), false);
    assert.deepEqual(operationsForApp(provider).filter((node) => node.operationId === "select-rows").map((node) => node.type), [currentType]);
    assert.equal(libraryNodeType(oldType), currentType);
  }
});
