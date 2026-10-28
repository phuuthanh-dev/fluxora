import assert from "node:assert/strict";
import test from "node:test";
import { executableWorkflowNodeTypes, isExecutableWorkflowNodeType } from "@workflow/contracts";
import { availableCatalogTypes, createNodeData, getNodeDefinition, initialEdges, initialNodes, nodeCatalog } from "./node-catalog";
import { parseWorkflowCanvasGraph } from "./workflow-graph-schema";

test("accepts a valid exported workflow graph", () => {
  const graph = parseWorkflowCanvasGraph(structuredClone({ nodes: initialNodes, edges: initialEdges }));

  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(graph.edges.map((edge) => edge.kind), ["success", "success"]);
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
  for (const type of ["action.google-chat.oauth", "action.openai", "action.gemini", "action.mongodb", "action.facebook-meta", "action.instagram"]) {
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

  const sheets = getNodeDefinition("action.google-sheets");
  assert.ok(sheets);
  assert.equal(sheets.configurationFields?.find((field) => field.key === "values")?.kind, "table");
});

test("executable node capabilities stay aligned with the UI catalog", () => {
  const sortTypes = (types: readonly string[]) => [...types].sort();
  assert.deepEqual(sortTypes(availableCatalogTypes()), sortTypes(executableWorkflowNodeTypes));
  assert.equal(nodeCatalog.filter((definition) => definition.available).length, executableWorkflowNodeTypes.length);
  assert.ok(nodeCatalog.filter((definition) => !definition.available).every((definition) => !isExecutableWorkflowNodeType(definition.type)));
});
