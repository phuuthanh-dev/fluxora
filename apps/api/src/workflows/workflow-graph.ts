import { nodeExecutionType, isExecutableWorkflowNodeType, isSupportedWorkflowNodeVersion, workflowEdgeKinds, workflowNodeOutputKinds, workflowNodeTypes, type WorkflowEdgeKind, type WorkflowGraph, type WorkflowNodeType } from "@workflow/contracts";
import { BadRequestException } from "@nestjs/common";
import { parseExpression } from "cron-parser";
import { readUptimeKumaFilter } from "../webhooks/uptime-kuma-filter";
import { rssTargets } from "../scheduler/rss-trigger-poller";
import { NodeFailure } from "../execution/node-failure";
import { parsePublicRssUrl } from "../execution/rss-public-transport";
import { telegramTriggerFilterFromConfig } from "../webhooks/telegram-trigger-protocol";
import { vercelTriggerFilterFromConfig } from "../webhooks/vercel-trigger-protocol";
import { readTrelloTriggerFilter } from "../webhooks/trello-trigger-protocol";
import { readSentryIssueCreatedFilter } from "../webhooks/sentry-trigger-protocol";

type StoredWorkflowNode = WorkflowGraph["nodes"][number];
type StoredWorkflowEdge = WorkflowGraph["edges"][number];

const nodeTypeSet = new Set<string>(workflowNodeTypes);
const edgeKindSet = new Set<string>(workflowEdgeKinds);

export function parseWorkflowGraph(value: unknown): WorkflowGraph {
  return parseGraph(value);
}

/** Stored and newly submitted graphs use the same supported formats. */
export function parseStoredWorkflowGraph(value: unknown): WorkflowGraph {
  return parseGraph(value);
}

function parseGraph(value: unknown): WorkflowGraph {
  const record = readRecord(value, "Workflow graph must be a JSON object.");
  const rawNodes = readArray(record.nodes, "Workflow graph needs a nodes array.");
  const rawEdges = readArray(record.edges, "Workflow graph needs an edges array.");
  const nodes = rawNodes.map(parseNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) invalid("Workflow node IDs must be unique.");
  const edges = rawEdges.map(parseEdge);

  for (const edge of edges) {
    const source = nodes.find((node) => node.id === edge.source);
    if (!source || !nodeIds.has(edge.target)) invalid(`Connection ${edge.id} refers to a missing node.`);
    if (!source || !workflowNodeOutputKinds(source.type).includes(edge.kind)) invalid(`Connection ${edge.id} uses an invalid ${edge.kind} branch.`);
  }

  if (containsCycle(nodes, edges)) invalid("Loops are not supported in the MVP workflow graph.");
  return { nodes, edges };
}

export function validatePublishableGraph(graph: WorkflowGraph) {
  const triggers = graph.nodes.filter((node) => node.type.startsWith("trigger."));
  if (triggers.length !== 1) invalid("A published workflow must have exactly one trigger.");
  if (!graph.nodes.length) invalid("A published workflow must contain at least one node.");
  assertExecutableGraph(graph);
  try { rssTargets("", "", graph); }
  catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
  for (const node of graph.nodes) {
    if (node.type === "trigger.cron") validateCronConfig(node.config);
    if (node.type === "condition.if") validateStaticChoice(node.config.operator, ["equals", "not_equals", "contains", "exists"], "Choose a supported If operator before publishing.");
    if (node.type === "approval.request") validateStaticChoice(node.config.notificationProvider, ["google_chat", "http_webhook"], "Choose a supported approval notification provider before publishing.");
    if (node.type === "trigger.telegram.update") telegramTriggerFilterFromConfig(node.config);
    if (node.type === "trigger.vercel.deployment") vercelTriggerFilterFromConfig(node.config);
    if (node.type === "trigger.trello.board-action") readTrelloTriggerFilter(node.config);
    if (node.type === "trigger.sentry.issue-created") readSentryIssueCreatedFilter(node.config);
    if (nodeExecutionType(node.type, node.nodeVersion) === "trigger.uptime-kuma.alert.v2") readUptimeKumaFilter(node.config);
    if (node.type !== "condition.switch") continue;
    const values = switchCaseValues(node.config);
    if (!values.length) invalid(`Switch node ${node.id} needs at least one non-empty case value.`);
    if (new Set(values).size !== values.length) invalid(`Switch node ${node.id} has duplicate case values.`);
    for (const edge of graph.edges.filter((edge) => edge.source === node.id && edge.kind === "case")) {
      if (!edge.caseValue || !values.includes(edge.caseValue)) invalid(`Switch case edge ${edge.id} must map to a configured case value.`);
    }
  }
}

/** Preserve legacy defaults and dynamic expressions; runtime resolves expressions later. */
function validateStaticChoice(value: unknown, choices: readonly string[], message: string) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value === "string" && (choices.includes(value) || /{{\s*[^{}]+?\s*}}/.test(value))) return;
  invalid(message);
}

/** Use the scheduler's parser and default timezone; drafts and saved versions remain readable. */
function validateCronConfig(config: Record<string, unknown>) {
  const expression = typeof config.expression === "string" ? config.expression : "";
  const timezone = typeof config.timezone === "string" ? config.timezone : "Asia/Ho_Chi_Minh";
  try {
    if (!expression.trim() || !timezone) throw new Error("Invalid schedule");
    parseExpression(expression, { tz: timezone }).prev();
  } catch {
    invalid("Enter a valid cron expression and timezone before publishing.");
  }
}

/** Drafts and historical versions remain readable, but an unavailable node
 * must not allow earlier live nodes to produce side effects before failing. */
export function unavailableWorkflowNodes(graph: WorkflowGraph) {
  return graph.nodes.filter((node) => !isExecutableWorkflowNodeType(node.type)).map(({ id, type }) => ({ nodeId: id, type }));
}

export function assertExecutableGraph(graph: WorkflowGraph) {
  const details = unavailableWorkflowNodes(graph);
  if (details.length) throw new BadRequestException({ code: "NODE_UNAVAILABLE", message: "Remove unavailable nodes before publishing or activating this workflow.", details });
}

function parseNode(value: unknown): StoredWorkflowNode {
  const record = readRecord(value, "Each workflow node must be an object.");
  const data = record.data === undefined ? undefined : readRecord(record.data, "Node data must be an object.");
  const type = readNodeType(data?.nodeType ?? record.type);
  const position = readRecord(record.position, "Node position is required.");
  const x = readNumber(position.x, "Node x position must be a number.");
  const y = readNumber(position.y, "Node y position must be a number.");
  const configSource = record.config ?? data?.config;
  const config = readRecord(configSource, "Node config must be an object.");
  // A draft may be incomplete, but identifiable secrets must not be saved in
  // a plaintext feed URL. This check is syntax-only and does not call DNS.
  if (type === "trigger.rss.new-item" && config.url !== undefined && config.url !== "") {
    try { parsePublicRssUrl(typeof config.url === "string" ? config.url.trim() : config.url); }
    catch { invalid("Use a public RSS URL without embedded credentials or secret query parameters."); }
  }
  // Mixed API/canvas imports must not silently pick one of two conflicting
  // versions: that could select a different node behavior than the author saw.
  if (record.nodeVersion !== undefined && data?.nodeVersion !== undefined && record.nodeVersion !== data.nodeVersion) invalid("Node version values do not match.");
  const nodeVersion = record.nodeVersion === undefined ? data?.nodeVersion : record.nodeVersion;
  if (nodeVersion !== undefined && !isSupportedWorkflowNodeVersion(nodeVersion)) invalid("Node version is not supported.");
  return { id: readString(record.id, "Node ID is required."), type, position: { x, y }, config, ...(nodeVersion === undefined ? {} : { nodeVersion }) };
}

function parseEdge(value: unknown): StoredWorkflowEdge {
  const record = readRecord(value, "Each workflow connection must be an object.");
  const kind = readString(record.kind, "Connection kind is required.");
  if (!edgeKindSet.has(kind)) invalid("Connection kind is not supported.");
  const caseValue = record.caseValue === undefined ? undefined : readString(record.caseValue, "Case value must be a string.");
  return {
    id: readString(record.id, "Connection ID is required."),
    source: readString(record.source, "Connection source is required."),
    target: readString(record.target, "Connection target is required."),
    kind: kind as WorkflowEdgeKind,
    ...(caseValue === undefined ? {} : { caseValue }),
  };
}

function containsCycle(nodes: StoredWorkflowNode[], edges: StoredWorkflowEdge[]) {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((node) => visit(node.id));
}

function switchCaseValues(config: Record<string, unknown>) {
  if (!Array.isArray(config.cases)) return [];
  return config.cases.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const value = (candidate as Record<string, unknown>).value;
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
  });
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  return value as Record<string, unknown>;
}

function readArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) invalid(message);
  return value;
}

function readString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) invalid(message);
  return value;
}

function readNumber(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(message);
  return value;
}

function readNodeType(value: unknown): WorkflowNodeType {
  const type = readString(value, "Node type is required.");
  if (!nodeTypeSet.has(type)) invalid("Node type is not supported.");
  return type as WorkflowNodeType;
}

function invalid(message: string): never {
  throw new BadRequestException({ code: "INVALID_WORKFLOW_GRAPH", message });
}
