import type { WorkflowEdge, WorkflowEdgeKind, WorkflowGraph, WorkflowNode } from "@workflow/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalRequestStatus, CredentialProvider, ExecutionStatus, NodeExecutionStatus, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { CredentialService } from "../credentials/credential.service";
import { PrismaService } from "../database/prisma.service";
import { resolveExpressions } from "./expression";
import { redactValue } from "./redaction";
import { isRetryableFailure, retryDelayMs } from "./retry-policy";
import { parseWorkflowGraph } from "../workflows/workflow-graph";

type RunMode = "mock" | "live";
type NodeResult = { status: "succeeded" | "failed" | "waiting"; output: Record<string, unknown>; route?: WorkflowEdgeKind; error?: NodeFailure };

class NodeFailure extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean, readonly statusCode?: number) {
    super(message);
  }
}

@Injectable()
export class ExecutionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialService) private readonly credentials: CredentialService) {}

  async createManualExecution(workflowId: string, userId: string, mock: boolean, triggerData: unknown = {}) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { draftVersion: true, publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    const version = mock ? workflow.draftVersion ?? workflow.publishedVersion : workflow.publishedVersion;
    if (!version) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish the workflow before starting a live execution." });
    return this.prisma.execution.create({
      data: { workflowVersionId: version.id, mode: mock ? "MOCK" : "LIVE", triggerData: redactValue(triggerData) as Prisma.InputJsonValue },
    });
  }

  async createScheduledExecution(workflowVersionId: string, triggerData: Record<string, unknown>) {
    return this.prisma.execution.create({
      data: { workflowVersionId, mode: "LIVE", triggerData: redactValue(triggerData) as Prisma.InputJsonValue },
    });
  }

  async get(executionId: string, userId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, workflowVersion: { workflow: { workspace: { members: { some: { userId, role: "OWNER" } } } } } },
      include: { workflowVersion: { include: { workflow: true } }, nodeExecutions: { orderBy: { startedAt: "asc" } } },
    });
    if (!execution) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    return {
      id: execution.id,
      status: execution.status,
      mode: execution.mode.toLowerCase(),
      workflowId: execution.workflowVersion.workflowId,
      workflowVersion: execution.workflowVersion.version,
      triggerData: execution.triggerData,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      nodeExecutions: execution.nodeExecutions.map((node) => ({
        nodeId: node.nodeId,
        status: node.status,
        attempt: node.attempt,
        input: node.input,
        output: node.output,
        error: node.errorCode ? { code: node.errorCode, message: node.errorMessage, retryable: isRetryableFailure({ code: node.errorCode }) } : null,
        durationMs: node.startedAt && node.completedAt ? node.completedAt.getTime() - node.startedAt.getTime() : null,
      })),
    };
  }

  async run(executionId: string, mode: RunMode, startNodeIds?: string[]) {
    const execution = await this.prisma.execution.findUnique({ include: { workflowVersion: { include: { workflow: true } }, nodeExecutions: true }, where: { id: executionId } });
    if (!execution) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    const graph = parseWorkflowGraph(execution.workflowVersion.graph);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.RUNNING, startedAt: now } }),
      ...graph.nodes.map((node) => this.prisma.nodeExecution.upsert({
        where: { executionId_nodeId: { executionId, nodeId: node.id } },
        create: { executionId, nodeId: node.id, status: NodeExecutionStatus.PENDING },
        update: {},
      })),
    ]);

    const context: Record<string, unknown> = { trigger: execution.triggerData ?? {}, steps: {} };
    const outputs = context.steps as Record<string, unknown>;
    for (const nodeExecution of execution.nodeExecutions) {
      if (nodeExecution.status === NodeExecutionStatus.SUCCEEDED && nodeExecution.output && typeof nodeExecution.output === "object" && !Array.isArray(nodeExecution.output)) {
        outputs[nodeExecution.nodeId] = { output: nodeExecution.output };
      }
    }
    const pending = (startNodeIds ? graph.nodes.filter((node) => startNodeIds.includes(node.id)) : graph.nodes.filter((node) => node.type.startsWith("trigger.")));
    const visited = new Set(execution.nodeExecutions.filter((node) => node.status !== NodeExecutionStatus.PENDING && node.status !== NodeExecutionStatus.SKIPPED).map((node) => node.nodeId));

    while (pending.length) {
      const node = pending.shift();
      if (!node || visited.has(node.id)) continue;
      visited.add(node.id);
      const result = await this.runNode(executionId, execution.workflowVersion.workflow.workspaceId, node, context, mode);
      if (result.status === "waiting") {
        const approval = await this.prisma.approvalRequest.create({
          data: {
            executionId,
            tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
            expiresAt: new Date(Date.now() + approvalExpiryMs(result.output)),
          },
        });
        await this.prisma.nodeExecution.update({
          where: { executionId_nodeId: { executionId, nodeId: node.id } },
          data: { output: { ...result.output, approvalRequestId: approval.id } as Prisma.InputJsonValue },
        });
        await this.markUnvisitedSkipped(executionId, graph, visited);
        return this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.WAITING_APPROVAL } });
      }
      if (result.status === "failed") {
        const errorTargets = graph.edges.filter((edge) => edge.source === node.id && edge.kind === "error");
        if (!errorTargets.length) {
          await this.markUnvisitedSkipped(executionId, graph, visited);
          return this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.FAILED, completedAt: new Date() } });
        }
        pending.push(...this.targets(graph, errorTargets));
        continue;
      }
      outputs[node.id] = { output: result.output };
      const nextEdges = graph.edges.filter((edge) => edge.source === node.id && edgeMatchesResult(edge, result));
      pending.push(...this.targets(graph, nextEdges));
    }

    await this.markUnvisitedSkipped(executionId, graph, visited);
    return this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.SUCCEEDED, completedAt: new Date() } });
  }

  async resolveApproval(approvalId: string, userId: string, decision: "approved" | "rejected") {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id: approvalId, execution: { workflowVersion: { workflow: { workspace: { members: { some: { userId, role: "OWNER" } } } } } } },
      include: { execution: { include: { workflowVersion: true } } },
    });
    if (!approval) throw new NotFoundException({ code: "APPROVAL_NOT_FOUND", message: "Approval request was not found." });
    if (approval.status !== ApprovalRequestStatus.PENDING) throw new NotFoundException({ code: "APPROVAL_NOT_PENDING", message: "Approval request has already been resolved." });
    if (approval.expiresAt <= new Date()) {
      await this.prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: ApprovalRequestStatus.EXPIRED, resolvedAt: new Date() } });
      throw new NotFoundException({ code: "APPROVAL_EXPIRED", message: "Approval request has expired." });
    }
    const waitingNode = await this.prisma.nodeExecution.findFirst({ where: { executionId: approval.executionId, status: NodeExecutionStatus.WAITING } });
    if (!waitingNode) throw new NotFoundException({ code: "APPROVAL_NODE_NOT_FOUND", message: "Execution is not waiting on an approval node." });
    const resolvedAt = new Date();
    if (decision === "rejected") {
      await this.prisma.$transaction([
        this.prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: ApprovalRequestStatus.REJECTED, resolvedAt } }),
        this.prisma.nodeExecution.update({ where: { id: waitingNode.id }, data: { status: NodeExecutionStatus.FAILED, errorCode: "APPROVAL_REJECTED", errorMessage: "Approval was rejected.", completedAt: resolvedAt } }),
        this.prisma.execution.update({ where: { id: approval.executionId }, data: { status: ExecutionStatus.FAILED, completedAt: resolvedAt } }),
      ]);
      return { executionId: approval.executionId, resumed: false, startNodeIds: [], mode: approval.execution.mode === "MOCK" ? "mock" as const : "live" as const };
    }
    const graph = parseWorkflowGraph(approval.execution.workflowVersion.graph);
    const nextNodeIds = graph.edges.filter((edge) => edge.source === waitingNode.nodeId && edge.kind === "success").map((edge) => edge.target);
    await this.prisma.$transaction([
      this.prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: ApprovalRequestStatus.APPROVED, resolvedAt } }),
      this.prisma.nodeExecution.update({ where: { id: waitingNode.id }, data: { status: NodeExecutionStatus.SUCCEEDED, completedAt: resolvedAt } }),
      this.prisma.execution.update({ where: { id: approval.executionId }, data: { status: ExecutionStatus.QUEUED, completedAt: null } }),
    ]);
    return { executionId: approval.executionId, resumed: nextNodeIds.length > 0, startNodeIds: nextNodeIds, mode: approval.execution.mode === "MOCK" ? "mock" as const : "live" as const };
  }

  private async runNode(executionId: string, workspaceId: string, node: WorkflowNode, context: Record<string, unknown>, mode: RunMode): Promise<NodeResult> {
    const config = resolveExpressions(node.config, context) as Record<string, unknown>;
    const input = { config, trigger: context.trigger };
    const retries = readRetries(config);
    let attempt = 0;
    while (attempt < retries) {
      attempt += 1;
      const startedAt = new Date();
      await this.prisma.nodeExecution.update({
        where: { executionId_nodeId: { executionId, nodeId: node.id } },
        data: { status: NodeExecutionStatus.RUNNING, attempt, input: redactValue(input) as Prisma.InputJsonValue, startedAt, completedAt: null, errorCode: null, errorMessage: null },
      });
      try {
        const result = await executeNode(node, config, context, mode, workspaceId, this.credentials);
        await this.prisma.nodeExecution.update({
          where: { executionId_nodeId: { executionId, nodeId: node.id } },
          data: { status: result.status === "waiting" ? NodeExecutionStatus.WAITING : NodeExecutionStatus.SUCCEEDED, output: redactValue(result.output) as Prisma.InputJsonValue, completedAt: new Date() },
        });
        return result;
      } catch (reason) {
        const failure = reason instanceof NodeFailure ? reason : new NodeFailure("NODE_ERROR", "Node execution failed.", false);
        const retryable = failure.retryable || isRetryableFailure(failure);
        await this.prisma.nodeExecution.update({
          where: { executionId_nodeId: { executionId, nodeId: node.id } },
          data: { status: NodeExecutionStatus.FAILED, errorCode: failure.code, errorMessage: failure.message, completedAt: new Date() },
        });
        if (!retryable || attempt >= retries) return { status: "failed", output: {}, error: failure };
        await delay(retryDelayMs(attempt));
      }
    }
    return { status: "failed", output: {}, error: new NodeFailure("RETRY_EXHAUSTED", "Retry attempts were exhausted.", false) };
  }

  private targets(graph: WorkflowGraph, edges: WorkflowEdge[]) {
    return edges.map((edge) => graph.nodes.find((node) => node.id === edge.target)).filter((node): node is WorkflowNode => node !== undefined);
  }

  private async markUnvisitedSkipped(executionId: string, graph: WorkflowGraph, visited: Set<string>) {
    const remaining = graph.nodes.filter((node) => !visited.has(node.id)).map((node) => node.id);
    if (!remaining.length) return;
    await this.prisma.nodeExecution.updateMany({ where: { executionId, nodeId: { in: remaining }, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt: new Date() } });
  }
}

async function executeNode(node: WorkflowNode, config: Record<string, unknown>, context: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  if (node.type.startsWith("trigger.")) return { status: "succeeded", output: { received: context.trigger ?? {} }, route: "success" };
  if (node.type === "condition.if") {
    const matches = compare(config.left, String(config.operator ?? "equals"), config.right);
    return { status: "succeeded", output: { matches }, route: matches ? "true" : "false" };
  }
  if (node.type === "condition.switch") {
    const value = config.value;
    const cases = Array.isArray(config.cases) ? config.cases : [];
    const matched = cases.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).value === value) as Record<string, unknown> | undefined;
    return { status: "succeeded", output: { value, matched: matched?.value ?? null }, route: matched ? "case" : "default" };
  }
  if (node.type === "approval.request") return { status: "waiting", output: { message: String(config.message ?? "Approval requested"), expiresInHours: typeof config.expiresInHours === "number" ? config.expiresInHours : 24 } };
  if (node.type === "action.steam.account-snapshot") {
    if (mode === "live") {
      const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.STEAM);
      return { status: "succeeded", output: await steamSnapshot(credential, config), route: "success" };
    }
    return { status: "succeeded", output: mockSteamSnapshot(String(config.steamId ?? "76561198000000000")), route: "success" };
  }
  if (node.type === "action.google-chat.webhook") {
    if (mode === "live") {
      const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GOOGLE_CHAT_WEBHOOK);
      const webhookUrl = readCredentialValue(credential, "webhookUrl");
      const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: String(config.message ?? "") }), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Google Chat returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
      return { status: "succeeded", output: { delivered: true, mode: "live" }, route: "success" };
    }
    return { status: "succeeded", output: { delivered: true, mode: "mock", message: String(config.message ?? "Steam daily report") }, route: "success" };
  }
  if (node.type === "action.http-request") {
    if (mode === "mock") return { status: "succeeded", output: { status: 200, body: { mocked: true, url: config.url ?? "" } }, route: "success" };
    return executeHttpRequest(config);
  }
  throw new NodeFailure("NODE_UNAVAILABLE", `${node.type} is not available in this MVP execution engine.`, false);
}

async function executeHttpRequest(config: Record<string, unknown>): Promise<NodeResult> {
  const url = typeof config.url === "string" ? config.url : "";
  if (!/^https?:\/\//.test(url)) throw new NodeFailure("INVALID_CONFIGURATION", "HTTP request requires an http(s) URL.", false);
  const timeoutMs = typeof config.timeoutMs === "number" && config.timeoutMs > 0 ? Math.min(config.timeoutMs, 60_000) : 15_000;
  try {
    const response = await fetch(url, { method: typeof config.method === "string" ? config.method : "GET", signal: AbortSignal.timeout(timeoutMs) });
    const raw = await response.text();
    const body: unknown = tryJson(raw);
    if (!response.ok) throw new NodeFailure("HTTP_ERROR", `HTTP request returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
    return { status: "succeeded", output: { status: response.status, body }, route: "success" };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    const timeout = reason instanceof Error && reason.name === "TimeoutError";
    throw new NodeFailure(timeout ? "TIMEOUT" : "NETWORK_ERROR", timeout ? "HTTP request timed out." : "HTTP request failed.", true);
  }
}

function compare(left: unknown, operator: string, right: unknown) {
  if (operator === "not_equals") return left !== right;
  if (operator === "contains") return String(left ?? "").includes(String(right ?? ""));
  if (operator === "exists") return left !== undefined && left !== null;
  return left === right;
}

function edgeMatchesResult(edge: WorkflowEdge, result: NodeResult) {
  if (result.route === "case") return edge.kind === "case" && edge.caseValue === String(result.output.matched ?? "");
  return edge.kind === result.route;
}

function readRetries(config: Record<string, unknown>) {
  const configured = typeof config.retryAttempts === "number" ? config.retryAttempts : 1;
  return Math.max(1, Math.min(5, Math.floor(configured)));
}

function approvalExpiryMs(output: Record<string, unknown>) {
  const hours = typeof output.expiresInHours === "number" ? output.expiresInHours : 24;
  return Math.max(1, Math.min(168, hours)) * 60 * 60 * 1000;
}

function tryJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function mockSteamSnapshot(steamId: string) {
  return {
    profile: { steamId, personaname: "Mock Steam Player", profileurl: `https://steamcommunity.com/profiles/${steamId}`, communityvisibilitystate: 3 },
    currentGame: null,
    summary: { totalGames: 42, topGames: [{ name: "Portal 2", playtimeMinutes: 1240 }, { name: "Hades", playtimeMinutes: 680 }] },
  };
}

async function steamSnapshot(credential: Record<string, unknown>, config: Record<string, unknown>) {
  const apiKey = readCredentialValue(credential, "apiKey");
  const steamId = typeof config.steamId === "string" && config.steamId ? config.steamId : readCredentialValue(credential, "steamId");
  const base = "https://api.steampowered.com";
  const params = new URLSearchParams({ key: apiKey, steamids: steamId });
  const profileResponse = await fetch(`${base}/ISteamUser/GetPlayerSummaries/v0002/?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!profileResponse.ok) throw new NodeFailure("HTTP_ERROR", `Steam profile request returned ${profileResponse.status}.`, profileResponse.status === 429 || profileResponse.status >= 500, profileResponse.status);
  const profileJson = await profileResponse.json() as { response?: { players?: unknown[] } };
  const profile = profileJson.response?.players?.[0];
  if (!profile || typeof profile !== "object") throw new NodeFailure("STEAM_PROFILE_NOT_FOUND", "Steam did not return a public profile for this Steam ID.", false);
  const gamesUrl = `${base}/IPlayerService/GetOwnedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: "1", include_played_free_games: "1" })}`;
  const gamesResponse = await fetch(gamesUrl, { signal: AbortSignal.timeout(15_000) });
  if (!gamesResponse.ok) throw new NodeFailure("HTTP_ERROR", `Steam games request returned ${gamesResponse.status}.`, gamesResponse.status === 429 || gamesResponse.status >= 500, gamesResponse.status);
  const gamesJson = await gamesResponse.json() as { response?: { game_count?: number; games?: Array<{ name?: string; playtime_forever?: number }> } };
  const games = gamesJson.response?.games ?? [];
  const topGames = [...games].sort((left, right) => (right.playtime_forever ?? 0) - (left.playtime_forever ?? 0)).slice(0, 5).map((game) => ({ name: game.name ?? "Unknown", playtimeMinutes: game.playtime_forever ?? 0 }));
  return { profile, currentGame: null, summary: { totalGames: gamesJson.response?.game_count ?? games.length, topGames } };
}

function readCredentialId(config: Record<string, unknown>) {
  if (typeof config.credentialId !== "string" || !config.credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a credential for this node.", false);
  return config.credentialId;
}

function readCredentialValue(credential: Record<string, unknown>, key: string) {
  const value = credential[key];
  if (typeof value !== "string" || !value) throw new NodeFailure("CREDENTIAL_INVALID", `Credential is missing ${key}.`, false);
  return value;
}
