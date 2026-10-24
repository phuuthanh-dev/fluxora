import type { WorkflowEdge, WorkflowEdgeKind, WorkflowGraph, WorkflowNode } from "@workflow/contracts";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalRequestStatus, CredentialProvider, ExecutionStatus, NodeExecutionStatus, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { CredentialService } from "../credentials/credential.service";
import { PrismaService } from "../database/prisma.service";
import { ExecutionEventsService } from "./execution-events.service";
import { applyHttpCredential, HttpCredentialError } from "./http-credential";
import { fetchSafeOutbound, OutboundRequestPolicyError } from "./outbound-url-policy";
import { resolveExpressions } from "./expression";
import { redactValue } from "./redaction";
import { isRetryableFailure, retryDelayMs } from "./retry-policy";
import { parseWorkflowGraph } from "../workflows/workflow-graph";

type RunMode = "mock" | "live";
type NodeResult = { status: "succeeded" | "failed" | "waiting"; output: Record<string, unknown>; route?: WorkflowEdgeKind; error?: NodeFailure };
const executionLeaseMs = 5 * 60 * 1000;

class NodeFailure extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean, readonly statusCode?: number) {
    super(message);
  }
}

@Injectable()
export class ExecutionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialService) private readonly credentials: CredentialService, @Inject(ExecutionEventsService) private readonly events: ExecutionEventsService) {}

  async createManualExecution(workflowId: string, userId: string, mock: boolean, triggerData: unknown = {}) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { draftVersion: true, publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    const version = mock ? workflow.draftVersion ?? workflow.publishedVersion : workflow.publishedVersion;
    if (!version) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish the workflow before starting a live execution." });
    const execution = await this.prisma.execution.create({
      data: { workflowVersionId: version.id, mode: mock ? "MOCK" : "LIVE", triggerData: redactValue(triggerData) as Prisma.InputJsonValue },
    });
    await this.prisma.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "execution.manual_started", targetType: "execution", targetId: execution.id, metadata: { mode: mock ? "mock" : "live" } } });
    return execution;
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
      error: execution.errorCode ? { code: execution.errorCode, message: execution.errorMessage } : null,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      recoveryCount: execution.recoveryCount,
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

  async getApproval(approvalId: string, userId: string) {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id: approvalId, execution: { workflowVersion: { workflow: { workspace: { members: { some: { userId, role: "OWNER" } } } } } } },
      include: { execution: { include: { workflowVersion: true } } },
    });
    if (!approval) throw new NotFoundException({ code: "APPROVAL_NOT_FOUND", message: "Approval request was not found." });
    return {
      id: approval.id,
      status: approval.status,
      expiresAt: approval.expiresAt,
      executionId: approval.executionId,
      workflowId: approval.execution.workflowVersion.workflowId,
    };
  }

  async cancel(executionId: string, userId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, workflowVersion: { workflow: { workspace: { members: { some: { userId, role: "OWNER" } } } } } },
      include: { workflowVersion: { include: { workflow: true } } },
    });
    if (!execution) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    if (new Set<ExecutionStatus>([ExecutionStatus.SUCCEEDED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED]).has(execution.status)) {
      throw new BadRequestException({ code: "EXECUTION_NOT_CANCELLABLE", message: "Only queued, running, or waiting executions can be cancelled." });
    }
    const completedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.CANCELLED, completedAt, leaseExpiresAt: null } }),
      this.prisma.nodeExecution.updateMany({ where: { executionId, status: { in: [NodeExecutionStatus.PENDING, NodeExecutionStatus.RUNNING, NodeExecutionStatus.WAITING] } }, data: { status: NodeExecutionStatus.SKIPPED, completedAt } }),
      this.prisma.approvalRequest.updateMany({ where: { executionId, status: ApprovalRequestStatus.PENDING }, data: { status: ApprovalRequestStatus.EXPIRED, resolvedAt: completedAt } }),
      this.prisma.auditLog.create({ data: { workspaceId: execution.workflowVersion.workflow.workspaceId, actorId: userId, action: "execution.cancelled", targetType: "execution", targetId: executionId } }),
    ]);
    this.events.publish(executionId, "execution.cancelled");
    return this.get(executionId, userId);
  }

  async run(executionId: string, mode: RunMode, startNodeIds?: string[]) {
    const execution = await this.prisma.execution.findUnique({ include: { workflowVersion: { include: { workflow: true } }, nodeExecutions: true }, where: { id: executionId } });
    if (!execution) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    if (execution.status !== ExecutionStatus.QUEUED) return execution;
    const graph = parseWorkflowGraph(execution.workflowVersion.graph);
    const now = new Date();
    const claimed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: ExecutionStatus.QUEUED },
      data: { status: ExecutionStatus.RUNNING, startedAt: execution.startedAt ?? now, completedAt: null, errorCode: null, errorMessage: null, leaseExpiresAt: leaseExpiry(now) },
    });
    if (!claimed.count) return execution;
    await this.prisma.$transaction([
      ...graph.nodes.map((node) => this.prisma.nodeExecution.upsert({
        where: { executionId_nodeId: { executionId, nodeId: node.id } },
        create: { executionId, nodeId: node.id, status: NodeExecutionStatus.PENDING },
        update: {},
      })),
    ]);
    this.events.publish(executionId, "execution.running");

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
      if (await this.isCancelled(executionId)) return execution;
      await this.renewLease(executionId);
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
        const notificationStatus = await this.notifyApproval(execution.workflowVersion.workflow.workspaceId, approval.id, result.output, mode);
        await this.prisma.nodeExecution.update({
          where: { executionId_nodeId: { executionId, nodeId: node.id } },
          data: { output: { ...result.output, approvalRequestId: approval.id, notificationStatus } as Prisma.InputJsonValue },
        });
        await this.markUnvisitedSkipped(executionId, graph, visited);
        const waiting = await this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.WAITING_APPROVAL, leaseExpiresAt: null } });
        this.events.publish(executionId, "execution.waiting_approval");
        return waiting;
      }
      if (result.status === "failed") {
        const errorTargets = graph.edges.filter((edge) => edge.source === node.id && edge.kind === "error");
        if (!errorTargets.length) {
          await this.markUnvisitedSkipped(executionId, graph, visited);
          const failed = await this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.FAILED, completedAt: new Date(), leaseExpiresAt: null, errorCode: result.error?.code ?? "NODE_FAILED", errorMessage: result.error?.message ?? "Workflow node failed." } });
          this.events.publish(executionId, "execution.failed");
          return failed;
        }
        pending.push(...this.targets(graph, errorTargets));
        continue;
      }
      outputs[node.id] = { output: result.output };
      const nextEdges = graph.edges.filter((edge) => edge.source === node.id && edgeMatchesResult(edge, result));
      pending.push(...this.targets(graph, nextEdges));
    }

    if (await this.isCancelled(executionId)) return execution;
    await this.markUnvisitedSkipped(executionId, graph, visited);
    const succeeded = await this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.SUCCEEDED, completedAt: new Date(), leaseExpiresAt: null } });
    this.events.publish(executionId, "execution.succeeded");
    return succeeded;
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
        this.prisma.execution.update({ where: { id: approval.executionId }, data: { status: ExecutionStatus.FAILED, completedAt: resolvedAt, leaseExpiresAt: null, errorCode: "APPROVAL_REJECTED", errorMessage: "Approval was rejected." } }),
      ]);
      this.events.publish(approval.executionId, "execution.failed");
      return { executionId: approval.executionId, resumed: false, startNodeIds: [], mode: approval.execution.mode === "MOCK" ? "mock" as const : "live" as const };
    }
    const graph = parseWorkflowGraph(approval.execution.workflowVersion.graph);
    const nextNodeIds = graph.edges.filter((edge) => edge.source === waitingNode.nodeId && edge.kind === "success").map((edge) => edge.target);
    await this.prisma.$transaction([
      this.prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: ApprovalRequestStatus.APPROVED, resolvedAt } }),
      this.prisma.nodeExecution.update({ where: { id: waitingNode.id }, data: { status: NodeExecutionStatus.SUCCEEDED, completedAt: resolvedAt } }),
      this.prisma.execution.update({ where: { id: approval.executionId }, data: { status: ExecutionStatus.QUEUED, completedAt: null, leaseExpiresAt: null, errorCode: null, errorMessage: null } }),
    ]);
    this.events.publish(approval.executionId, "execution.queued");
    return { executionId: approval.executionId, resumed: nextNodeIds.length > 0, startNodeIds: nextNodeIds, mode: approval.execution.mode === "MOCK" ? "mock" as const : "live" as const };
  }

  async failFromMaintenance(executionId: string, code: string, message: string, expiredBefore = new Date()) {
    const completedAt = new Date();
    const failed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: ExecutionStatus.RUNNING, leaseExpiresAt: { lte: expiredBefore } },
      data: { status: ExecutionStatus.FAILED, completedAt, leaseExpiresAt: null, errorCode: code, errorMessage: message, recoveryCount: { increment: 1 } },
    });
    if (!failed.count) return false;
    await this.prisma.$transaction([
      this.prisma.nodeExecution.updateMany({ where: { executionId, status: NodeExecutionStatus.RUNNING }, data: { status: NodeExecutionStatus.FAILED, completedAt, errorCode: code, errorMessage: message } }),
      this.prisma.nodeExecution.updateMany({ where: { executionId, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt } }),
    ]);
    this.events.publish(executionId, "execution.failed");
    return true;
  }

  async failFromWorker(executionId: string) {
    const completedAt = new Date();
    const failed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: { in: [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING] } },
      data: { status: ExecutionStatus.FAILED, completedAt, leaseExpiresAt: null, errorCode: "WORKER_EXECUTION_ERROR", errorMessage: "Execution worker stopped unexpectedly." },
    });
    if (!failed.count) return;
    await this.prisma.nodeExecution.updateMany({ where: { executionId, status: { in: [NodeExecutionStatus.PENDING, NodeExecutionStatus.RUNNING] } }, data: { status: NodeExecutionStatus.FAILED, completedAt, errorCode: "WORKER_EXECUTION_ERROR", errorMessage: "Execution worker stopped unexpectedly." } });
    this.events.publish(executionId, "execution.failed");
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
        this.events.publish(executionId, "node.updated");
        return result;
      } catch (reason) {
        const failure = reason instanceof NodeFailure ? reason : new NodeFailure("NODE_ERROR", "Node execution failed.", false);
        const retryable = failure.retryable || isRetryableFailure(failure);
        await this.prisma.nodeExecution.update({
          where: { executionId_nodeId: { executionId, nodeId: node.id } },
          data: { status: NodeExecutionStatus.FAILED, errorCode: failure.code, errorMessage: failure.message, completedAt: new Date() },
        });
        this.events.publish(executionId, "node.updated");
        if (!retryable || attempt >= retries) return { status: "failed", output: {}, error: failure };
        await delay(retryDelayMs(attempt));
      }
    }
    return { status: "failed", output: {}, error: new NodeFailure("RETRY_EXHAUSTED", "Retry attempts were exhausted.", false) };
  }

  private async notifyApproval(workspaceId: string, approvalId: string, output: Record<string, unknown>, mode: RunMode) {
    const credentialId = typeof output.notificationCredentialId === "string" ? output.notificationCredentialId : "";
    if (!credentialId) return "not_configured";
    if (mode === "mock") return "mock_not_sent";
    try {
      const link = `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/editor?approval=${encodeURIComponent(approvalId)}`;
      const message = `${String(output.message ?? "Approval requested")}\n\nReview: ${link}`;
      const provider = output.notificationProvider === "http_webhook" ? CredentialProvider.HTTP : CredentialProvider.GOOGLE_CHAT_WEBHOOK;
      const credential = await this.credentials.readForExecution(credentialId, workspaceId, provider);
      const webhookUrl = readCredentialValue(credential, "webhookUrl");
      const request = provider === CredentialProvider.HTTP
        ? applyHttpCredential(webhookUrl, { "Content-Type": "application/json" }, credential)
        : { url: webhookUrl, headers: { "Content-Type": "application/json" } };
      const body = provider === CredentialProvider.HTTP
        ? { type: "workflow.approval.requested", message: String(output.message ?? "Approval requested"), approvalUrl: link }
        : { text: message };
      const response = await fetchSafeOutbound(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      return response.ok ? "sent" : "failed";
    } catch {
      return "failed";
    }
  }

  private targets(graph: WorkflowGraph, edges: WorkflowEdge[]) {
    return edges.map((edge) => graph.nodes.find((node) => node.id === edge.target)).filter((node): node is WorkflowNode => node !== undefined);
  }

  private async markUnvisitedSkipped(executionId: string, graph: WorkflowGraph, visited: Set<string>) {
    const remaining = graph.nodes.filter((node) => !visited.has(node.id)).map((node) => node.id);
    if (!remaining.length) return;
    await this.prisma.nodeExecution.updateMany({ where: { executionId, nodeId: { in: remaining }, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt: new Date() } });
  }

  private async isCancelled(executionId: string) {
    const execution = await this.prisma.execution.findUnique({ where: { id: executionId }, select: { status: true } });
    return execution?.status === ExecutionStatus.CANCELLED;
  }

  private async renewLease(executionId: string) {
    await this.prisma.execution.updateMany({ where: { id: executionId, status: ExecutionStatus.RUNNING }, data: { leaseExpiresAt: leaseExpiry(new Date()) } });
  }
}

function leaseExpiry(now: Date) {
  return new Date(now.getTime() + executionLeaseMs);
}

async function executeNode(node: WorkflowNode, config: Record<string, unknown>, context: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  if (node.type.startsWith("trigger.")) return { status: "succeeded", output: { received: context.trigger ?? {} }, route: "success" };
  if (node.type === "condition.if") {
    const matches = compare(config.left, String(config.operator ?? "equals"), config.right);
    return { status: "succeeded", output: { matches }, route: matches ? "true" : "false" };
  }
  if (node.type === "condition.switch") {
    const value = switchCaseValue(config.value);
    const cases = Array.isArray(config.cases) ? config.cases : [];
    const matched = cases.find((item) => item && typeof item === "object" && switchCaseValue((item as Record<string, unknown>).value) === value) as Record<string, unknown> | undefined;
    return { status: "succeeded", output: { value, matched: matched ? switchCaseValue(matched.value) : null }, route: matched ? "case" : "default" };
  }
  if (node.type === "approval.request") return { status: "waiting", output: { message: String(config.message ?? "Approval requested"), expiresInHours: typeof config.expiresInHours === "number" ? config.expiresInHours : 24, notificationProvider: config.notificationProvider === "http_webhook" ? "http_webhook" : "google_chat", notificationCredentialId: typeof config.notificationCredentialId === "string" ? config.notificationCredentialId : "" } };
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
      let response: Response;
      try {
        response = await fetchSafeOutbound(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: String(config.message ?? "") }), signal: AbortSignal.timeout(15_000) });
      } catch (reason) {
        throw nodeFailureFromOutboundPolicy(reason);
      }
      if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Google Chat returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
      return { status: "succeeded", output: { delivered: true, mode: "live" }, route: "success" };
    }
    return { status: "succeeded", output: { delivered: true, mode: "mock", message: String(config.message ?? "Steam daily report") }, route: "success" };
  }
  if (node.type === "action.google-drive") {
    if (mode === "mock") return { status: "succeeded", output: mockDrive(config), route: "success" };
    const credential = await credentials.readGoogleForExecution(readCredentialId(config), workspaceId);
    return { status: "succeeded", output: await executeGoogleDrive(credential, config), route: "success" };
  }
  if (node.type === "action.google-sheets") {
    if (mode === "mock") return { status: "succeeded", output: mockSheets(config), route: "success" };
    const credential = await credentials.readGoogleForExecution(readCredentialId(config), workspaceId);
    return { status: "succeeded", output: await executeGoogleSheets(credential, config), route: "success" };
  }
  if (node.type === "action.http-request") {
    if (mode === "mock") return { status: "succeeded", output: { status: 200, body: { mocked: true, url: config.url ?? "", method: config.method ?? "GET" } }, route: "success" };
    const credential = typeof config.credentialId === "string" && config.credentialId ? await credentials.readForExecution(config.credentialId, workspaceId, CredentialProvider.HTTP) : undefined;
    return executeHttpRequest(config, credential);
  }
  throw new NodeFailure("NODE_UNAVAILABLE", `${node.type} is not available in this MVP execution engine.`, false);
}

async function executeHttpRequest(config: Record<string, unknown>, credential?: Record<string, unknown>): Promise<NodeResult> {
  let url = typeof config.url === "string" ? config.url : "";
  if (!/^https?:\/\//.test(url)) throw new NodeFailure("INVALID_CONFIGURATION", "HTTP request requires an http(s) URL.", false);
  const timeoutMs = typeof config.timeoutMs === "number" && config.timeoutMs > 0 ? Math.min(config.timeoutMs, 60_000) : 15_000;
  const method = typeof config.method === "string" ? config.method.toUpperCase() : "GET";
  const headers = readHttpHeaders(config.headers);
  if (credential) {
    try {
      const authenticated = applyHttpCredential(url, headers, credential);
      url = authenticated.url;
      Object.assign(headers, authenticated.headers);
    } catch (reason) {
      throw new NodeFailure("CREDENTIAL_INVALID", reason instanceof HttpCredentialError ? reason.message : "HTTP credential could not be used.", false);
    }
  }
  const body = method === "GET" || method === "HEAD" ? undefined : requestBody(config.body, headers);
  try {
    const response = await fetchSafeOutbound(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    const raw = await response.text();
    const responseBody: unknown = tryJson(raw);
    if (!response.ok) throw new NodeFailure("HTTP_ERROR", `HTTP request returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
    return { status: "succeeded", output: { status: response.status, body: responseBody }, route: "success" };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    if (reason instanceof OutboundRequestPolicyError) throw nodeFailureFromOutboundPolicy(reason);
    const timeout = reason instanceof Error && reason.name === "TimeoutError";
    throw new NodeFailure(timeout ? "TIMEOUT" : "NETWORK_ERROR", timeout ? "HTTP request timed out." : "HTTP request failed.", true);
  }
}

function nodeFailureFromOutboundPolicy(reason: unknown) {
  if (reason instanceof OutboundRequestPolicyError) return new NodeFailure(reason.code, reason.message, false);
  const timeout = reason instanceof Error && reason.name === "TimeoutError";
  return new NodeFailure(timeout ? "TIMEOUT" : "NETWORK_ERROR", timeout ? "Outbound request timed out." : "Outbound request failed.", true);
}

function readHttpHeaders(value: unknown) {
  if (value === undefined) return {} as Record<string, string>;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NodeFailure("INVALID_CONFIGURATION", "HTTP headers must be a JSON object.", false);
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") throw new NodeFailure("INVALID_CONFIGURATION", "HTTP header values must be strings.", false);
    headers[name] = headerValue;
  }
  return headers;
}

function requestBody(value: unknown, headers: Record<string, string>) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return value;
  if (!Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
  return JSON.stringify(value);
}

function compare(left: unknown, operator: string, right: unknown) {
  if (operator === "not_equals") return left !== right;
  if (operator === "contains") return String(left ?? "").includes(String(right ?? ""));
  if (operator === "exists") return left !== undefined && left !== null;
  return left === right;
}

function switchCaseValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
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
  const ownedGames = [{ appid: 620, name: "Portal 2", playtime_forever: 1240 }, { appid: 1145360, name: "Hades", playtime_forever: 680 }];
  return {
    profile: { steamId, personaname: "Mock Steam Player", profileurl: `https://steamcommunity.com/profiles/${steamId}`, communityvisibilitystate: 3 },
    currentGame: null,
    ownedGames,
    recentGames: [{ appid: 620, name: "Portal 2", playtime_2weeks: 180, playtime_forever: 1240 }],
    achievements: null,
    summary: { totalGames: 42, topGames: topSteamGames(ownedGames) },
  };
}

export async function steamSnapshot(credential: Record<string, unknown>, config: Record<string, unknown>) {
  const apiKey = readCredentialValue(credential, "apiKey");
  const steamId = typeof config.steamId === "string" && config.steamId ? config.steamId : readCredentialValue(credential, "steamId");
  const base = "https://api.steampowered.com";
  const params = new URLSearchParams({ key: apiKey, steamids: steamId });
  const profileResponse = await fetch(`${base}/ISteamUser/GetPlayerSummaries/v0002/?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!profileResponse.ok) throw new NodeFailure("HTTP_ERROR", `Steam profile request returned ${profileResponse.status}.`, profileResponse.status === 429 || profileResponse.status >= 500, profileResponse.status);
  const profileJson = await profileResponse.json() as { response?: { players?: unknown[] } };
  const profile = profileJson.response?.players?.[0];
  if (!profile || typeof profile !== "object") throw new NodeFailure("STEAM_PROFILE_NOT_FOUND", "Steam did not return a public profile for this Steam ID.", false);
  const ownedGames = config.includeOwnedGames === false ? [] : await steamResponse<{ response?: { game_count?: number; games?: SteamGame[] } }>(
    `${base}/IPlayerService/GetOwnedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: "1", include_played_free_games: "1" })}`,
    "owned games",
  ).then((body) => body.response?.games ?? []);
  const recentGames = config.includeRecentGames === false ? [] : await steamResponse<{ response?: { games?: SteamGame[] } }>(
    `${base}/IPlayerService/GetRecentlyPlayedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, format: "json" })}`,
    "recent games",
  ).then((body) => body.response?.games ?? []);
  const achievementAppId = typeof config.achievementAppId === "string" ? config.achievementAppId.trim() : "";
  const achievements = achievementAppId ? await steamAchievements(base, apiKey, steamId, achievementAppId) : null;
  const player = profile as Record<string, unknown>;
  const currentAppId = typeof player.gameid === "number" ? player.gameid : undefined;
  return {
    profile,
    currentGame: currentAppId ? { appId: currentAppId, name: typeof player.gameextrainfo === "string" ? player.gameextrainfo : "Unknown", serverIp: typeof player.gameserverip === "string" ? player.gameserverip : undefined } : null,
    ownedGames,
    recentGames,
    achievements,
    summary: { totalGames: ownedGames.length, topGames: topSteamGames(ownedGames) },
  };
}

type SteamGame = { appid?: number; name?: string; playtime_forever?: number; playtime_2weeks?: number; [key: string]: unknown };

async function steamResponse<T>(url: string, label: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Steam ${label} request returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  return response.json() as Promise<T>;
}

async function steamAchievements(base: string, apiKey: string, steamId: string, appId: string) {
  const response = await fetch(`${base}/ISteamUserStats/GetPlayerAchievements/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, appid: appId, l: "english" })}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return null;
  const body = await response.json() as { playerstats?: unknown };
  return body.playerstats ?? null;
}

function topSteamGames(games: SteamGame[]) {
  return [...games].sort((left, right) => (right.playtime_forever ?? 0) - (left.playtime_forever ?? 0)).slice(0, 5).map((game) => ({ appId: game.appid ?? null, name: game.name ?? "Unknown", playtimeMinutes: game.playtime_forever ?? 0 }));
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

function mockDrive(config: Record<string, unknown>) {
  const operation = readOperation(config, ["list", "search", "uploadText", "downloadText"], "list");
  if (operation === "downloadText") return { operation, file: { id: String(config.fileId ?? "mock-file-1"), name: "daily-report.txt", text: "Mock Drive report" } };
  if (operation === "uploadText") return { operation, file: { id: "mock-upload-1", name: String(config.name ?? "daily-report.txt"), mimeType: "text/plain" } };
  return { operation, files: [{ id: "mock-file-1", name: "Steam report", mimeType: "text/plain", modifiedTime: "2026-10-23T08:00:00.000Z" }] };
}

async function executeGoogleDrive(credential: Record<string, unknown>, config: Record<string, unknown>) {
  const accessToken = readCredentialValue(credential, "accessToken");
  const operation = readOperation(config, ["list", "search", "uploadText", "downloadText"], "list");
  if (operation === "downloadText") {
    const fileId = readConfigString(config, "fileId");
    const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, accessToken);
    return { operation, file: { id: fileId, text: await response.text() } };
  }
  if (operation === "uploadText") {
    const name = readConfigString(config, "name");
    const content = typeof config.text === "string" ? config.text : "";
    const boundary = `workflow-${randomBytes(8).toString("hex")}`;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: "text/plain" })}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
    const response = await googleFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType", accessToken, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    return { operation, file: await response.json() as unknown };
  }
  const query = operation === "search" && typeof config.query === "string" && config.query ? `&q=${encodeURIComponent(config.query)}` : "";
  const response = await googleFetch(`https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,modifiedTime,webViewLink)${query}`, accessToken);
  const body = await response.json() as { files?: unknown[] };
  return { operation, files: body.files ?? [] };
}

function mockSheets(config: Record<string, unknown>) {
  const operation = readOperation(config, ["read", "append", "update"], "read");
  const range = String(config.range ?? "Sheet1!A1");
  return operation === "read" ? { operation, range, values: [["Mock Steam Player", "42 games"]] } : { operation, range, updatedRows: 1, updatedCells: 2 };
}

async function executeGoogleSheets(credential: Record<string, unknown>, config: Record<string, unknown>) {
  const accessToken = readCredentialValue(credential, "accessToken");
  const spreadsheetId = readConfigString(config, "spreadsheetId");
  const range = readConfigString(config, "range");
  const operation = readOperation(config, ["read", "append", "update"], "read");
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  if (operation === "read") {
    const response = await googleFetch(base, accessToken);
    return { operation, ...(await response.json() as Record<string, unknown>) };
  }
  const values = normalizeValues(config.values);
  const response = operation === "append"
    ? await googleFetch(`${base}:append?valueInputOption=USER_ENTERED`, accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) })
    : await googleFetch(`${base}?valueInputOption=USER_ENTERED`, accessToken, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
  return { operation, ...(await response.json() as Record<string, unknown>) };
}

async function googleFetch(url: string, accessToken: string, init: RequestInit = {}) {
  try {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...init.headers }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new NodeFailure("GOOGLE_API_ERROR", `Google API returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
    return response;
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    throw new NodeFailure("NETWORK_ERROR", "Google API request failed.", true);
  }
}

function readOperation(config: Record<string, unknown>, values: string[], fallback: string) {
  return typeof config.operation === "string" && values.includes(config.operation) ? config.operation : fallback;
}

function readConfigString(config: Record<string, unknown>, key: string) {
  if (typeof config[key] !== "string" || !config[key]) throw new NodeFailure("INVALID_CONFIGURATION", `${key} is required.`, false);
  return config[key] as string;
}

function normalizeValues(value: unknown) {
  if (!Array.isArray(value) || !value.every((row) => Array.isArray(row))) throw new NodeFailure("INVALID_CONFIGURATION", "values must be a table (an array of rows).", false);
  return value;
}
