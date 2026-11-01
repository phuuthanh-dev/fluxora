import { isExecutableWorkflowNodeType, type WorkflowEdge, type WorkflowEdgeKind, type WorkflowGraph, type WorkflowNode } from "@workflow/contracts";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
import { liveCredentialRequirements } from "./live-readiness";
import { executionRetentionPolicy } from "./retention-policy";
import { executeSmtpEmail } from "./smtp-email";
import { executeGeminiText } from "./gemini-text";
import { executeOpenAIText } from "./openai-text";
import { executeMongoFind, executeMongoInsert } from "./mongodb-find";
import { executeNotionSearch } from "./notion-search";
import { executePostgresSelect } from "./postgres-read";
import { executeGmailRead } from "./gmail-read";
import { executeGoogleChatOAuth } from "./google-chat-oauth";

type RunMode = "mock" | "live";
export type ExecutionTriageFilter = "ALL" | "ATTENTION" | "IN_PROGRESS" | "FAILED" | "SUCCEEDED";
type NodeResult = { status: "succeeded" | "failed" | "waiting"; output: Record<string, unknown>; route?: WorkflowEdgeKind; error?: NodeFailure };
const executionLeaseMs = 5 * 60 * 1000;

import { NodeFailure, nodeFailureFromExecutionError, nodeFailureFromOutboundPolicy } from "./node-failure";
import { defaultNotificationDispatcher, readTelegramDestinationType, validateTelegramDestination, validateDiscordWebhookUrl, sanitizeTelegramFailure } from "../notifications";

export { NodeFailure, nodeFailureFromOutboundPolicy, validateDiscordWebhookUrl, sanitizeTelegramFailure };

@Injectable()
export class ExecutionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialService) private readonly credentials: CredentialService, @Inject(ExecutionEventsService) private readonly events: ExecutionEventsService) {}

  async createManualExecution(workflowId: string, userId: string, mock: boolean, triggerData: unknown = {}, debugNodeId?: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { draftVersion: true, publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    const version = mock ? workflow.draftVersion ?? workflow.publishedVersion : workflow.publishedVersion;
    if (!version) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish the workflow before starting a live execution." });
    if (debugNodeId) {
      const debugNode = parseWorkflowGraph(version.graph).nodes.find((node) => node.id === debugNodeId);
      if (!debugNode) throw new BadRequestException({ code: "NODE_NOT_FOUND", message: "The selected node does not exist in this workflow." });
      if (debugNode.type === "approval.request") throw new BadRequestException({ code: "NODE_DEBUG_UNSUPPORTED", message: "Approval nodes must be tested as part of the full workflow." });
    }
    if (!mock) await this.assertLiveReady(workflow.workspaceId, parseWorkflowGraph(version.graph));
    const execution = await this.prisma.execution.create({
      data: { workflowVersionId: version.id, mode: mock ? "MOCK" : "LIVE", triggerData: redactValue(triggerData) as Prisma.InputJsonValue },
    });
    await this.prisma.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: debugNodeId ? "execution.node_debug_started" : "execution.manual_started", targetType: "execution", targetId: execution.id, metadata: { mode: mock ? "mock" : "live", ...(debugNodeId ? { nodeId: debugNodeId } : {}) } } });
    return execution;
  }

  async createScheduledExecution(workflowVersionId: string, triggerData: Record<string, unknown>, idempotencyKey?: string) {
    const version = await this.prisma.workflowVersion.findUnique({ where: { id: workflowVersionId }, include: { workflow: true } });
    if (!version) throw new NotFoundException({ code: "WORKFLOW_VERSION_NOT_FOUND", message: "Workflow version was not found." });
    await this.assertLiveReady(version.workflow.workspaceId, parseWorkflowGraph(version.graph));
    if (idempotencyKey) {
      const existing = await this.prisma.execution.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
    }
    try {
      return await this.prisma.execution.create({
        data: { workflowVersionId, mode: "LIVE", triggerData: redactValue(triggerData) as Prisma.InputJsonValue, ...(idempotencyKey ? { idempotencyKey } : {}) },
      });
    } catch (reason) {
      if (idempotencyKey && isUniqueConstraintError(reason)) {
        const existing = await this.prisma.execution.findUnique({ where: { idempotencyKey } });
        if (existing) return existing;
      }
      throw reason;
    }
  }

  async getLiveReadiness(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    if (!workflow.publishedVersion) throw new BadRequestException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish the workflow before checking live readiness." });
    return this.evaluateLiveReadiness(workflow.workspaceId, parseWorkflowGraph(workflow.publishedVersion.graph));
  }

  async get(executionId: string, userId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, workflowVersion: { workflow: { workspace: { members: { some: { userId, role: "OWNER" } } } } } },
      include: { workflowVersion: { include: { workflow: true } }, nodeExecutions: { orderBy: { startedAt: "asc" } } },
    });
    if (!execution) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    const graph = parseWorkflowGraph(execution.workflowVersion.graph);
    const graphOrder = new Map(graph.nodes.map((node, index) => [node.id, index]));
    const nodeType = new Map(graph.nodes.map((node) => [node.id, node.type]));
    const orderedNodes = [...execution.nodeExecutions].sort((left, right) => {
      const leftTime = left.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || (graphOrder.get(left.nodeId) ?? Number.MAX_SAFE_INTEGER) - (graphOrder.get(right.nodeId) ?? Number.MAX_SAFE_INTEGER);
    });
    return {
      id: execution.id,
      status: execution.status,
      mode: execution.mode.toLowerCase(),
      workflowId: execution.workflowVersion.workflowId,
      workflowVersion: execution.workflowVersion.version,
      graph: execution.workflowVersion.graph,
      triggerData: execution.triggerData,
      error: execution.errorCode ? { code: execution.errorCode, message: execution.errorMessage, retryable: execution.errorRetryable ?? isRetryableFailure({ code: execution.errorCode }) } : null,
      createdAt: execution.createdAt,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      durationMs: execution.startedAt && execution.completedAt ? execution.completedAt.getTime() - execution.startedAt.getTime() : null,
      recoveryCount: execution.recoveryCount,
      nodeExecutions: orderedNodes.map((node) => ({
        nodeId: node.nodeId,
        nodeType: nodeType.get(node.nodeId) ?? "unknown",
        status: node.status,
        attempt: node.attempt,
        input: node.input,
        output: node.output,
        error: node.errorCode ? { code: node.errorCode, message: node.errorMessage, retryable: node.errorRetryable ?? isRetryableFailure({ code: node.errorCode }) } : null,
        startedAt: node.startedAt,
        completedAt: node.completedAt,
        durationMs: node.startedAt && node.completedAt ? node.completedAt.getTime() - node.startedAt.getTime() : null,
        failureHandling: node.status === NodeExecutionStatus.FAILED ? failureHandling(graph, node.nodeId) : null,
        skipReason: node.status === NodeExecutionStatus.SKIPPED ? skippedReason(execution.status) : null,
      })),
    };
  }

  async getDiagnostic(executionId: string, userId: string) {
    const execution = await this.get(executionId, userId);
    return {
      schemaVersion: "fluxora.execution-diagnostic.v1" as const,
      execution: {
        id: execution.id,
        workflowId: execution.workflowId,
        workflowVersion: execution.workflowVersion,
        status: execution.status,
        mode: execution.mode,
        createdAt: execution.createdAt,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        durationMs: execution.durationMs,
        recoveryCount: execution.recoveryCount,
        error: sanitizeDiagnosticError(execution.error),
      },
      nodes: execution.nodeExecutions.map((node) => ({
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        status: node.status,
        attempt: node.attempt,
        startedAt: node.startedAt,
        completedAt: node.completedAt,
        durationMs: node.durationMs,
        error: sanitizeDiagnosticError(node.error),
        failureHandling: node.failureHandling,
        skipReason: node.skipReason,
      })),
    };
  }

  async retry(executionId: string, userId: string) {
    const source = await this.prisma.execution.findFirst({
      where: { id: executionId, workflowVersion: { workflow: { workspace: { members: { some: { userId, role: "OWNER" } } } } } },
      include: { workflowVersion: { include: { workflow: true } } },
    });
    if (!source) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    if (source.status !== ExecutionStatus.FAILED) throw new BadRequestException({ code: "EXECUTION_NOT_RETRYABLE", message: "Only failed executions can be retried." });
    if (source.mode === "LIVE") await this.assertLiveReady(source.workflowVersion.workflow.workspaceId, parseWorkflowGraph(source.workflowVersion.graph));
    const execution = await this.prisma.execution.create({
      data: {
        workflowVersionId: source.workflowVersionId,
        mode: source.mode,
        triggerData: source.triggerData ?? Prisma.JsonNull,
      },
    });
    await this.prisma.auditLog.create({ data: { workspaceId: source.workflowVersion.workflow.workspaceId, actorId: userId, action: "execution.retried", targetType: "execution", targetId: execution.id, metadata: { sourceExecutionId: source.id, mode: source.mode.toLowerCase(), workflowVersion: source.workflowVersion.version } } });
    return execution;
  }

  async listForWorkspace(workspaceId: string, userId: string, limit = 20, cursor?: string, filter: ExecutionTriageFilter = "ALL") {
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!membership || membership.role !== "OWNER") throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace was not found." });
    const take = Math.min(Math.max(limit, 1), 50);
    const statuses: Record<Exclude<ExecutionTriageFilter, "ALL">, ExecutionStatus[]> = {
      ATTENTION: [ExecutionStatus.FAILED, ExecutionStatus.WAITING_APPROVAL],
      IN_PROGRESS: [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING],
      FAILED: [ExecutionStatus.FAILED],
      SUCCEEDED: [ExecutionStatus.SUCCEEDED],
    };
    const executions = await this.prisma.execution.findMany({
      where: { workflowVersion: { workflow: { workspaceId } }, ...(filter === "ALL" ? {} : { status: { in: statuses[filter] } }) },
      include: { workflowVersion: { include: { workflow: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = executions.slice(0, take);
    return {
      executions: page.map((execution) => ({
      id: execution.id,
      workflowId: execution.workflowVersion.workflowId,
      workflowName: execution.workflowVersion.workflow.name,
      workflowVersion: execution.workflowVersion.version,
      status: execution.status,
      mode: execution.mode.toLowerCase(),
      createdAt: execution.createdAt,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      error: execution.errorCode ? { code: execution.errorCode, message: execution.errorMessage } : null,
      })),
      nextCursor: executions.length > take ? page.at(-1)?.id ?? null : null,
    };
  }

  async activityForWorkspace(workspaceId: string, userId: string) {
    await this.requireExecutionWorkspaceOwner(workspaceId, userId);
    const asOf = new Date();
    const since = new Date(asOf.getTime() - 24 * 60 * 60 * 1000);
    const groups = await this.prisma.execution.groupBy({
      by: ["status"],
      where: { workflowVersion: { workflow: { workspaceId } }, createdAt: { gte: since, lte: asOf } },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(Object.values(ExecutionStatus).map((status) => [status, 0])) as Record<ExecutionStatus, number>;
    for (const group of groups) counts[group.status] = group._count._all;
    return { asOf, since, counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
  }

  async retentionForWorkspace(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!membership || membership.role !== "OWNER") throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace was not found." });
    return { ...executionRetentionPolicy(), enabled: process.env.EXECUTION_MAINTENANCE_ENABLED !== "false", countScope: "system" as const };
  }

  async savedViews(workspaceId: string, userId: string) {
    await this.requireExecutionWorkspaceOwner(workspaceId, userId);
    return this.prisma.executionSavedView.findMany({ where: { workspaceId, userId }, select: { id: true, name: true, filter: true }, orderBy: { createdAt: "asc" }, take: 50 });
  }

  async createSavedView(workspaceId: string, userId: string, name: string, filter: ExecutionTriageFilter) {
    await this.requireExecutionWorkspaceOwner(workspaceId, userId);
    if (await this.prisma.executionSavedView.count({ where: { workspaceId, userId } }) >= 50) throw new BadRequestException({ code: "VIEW_LIMIT_REACHED", message: "You can save up to 50 views per workspace." });
    try {
      return await this.prisma.executionSavedView.create({ data: { workspaceId, userId, name, filter }, select: { id: true, name: true, filter: true } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ConflictException({ code: "VIEW_NAME_CONFLICT", message: "A saved view with this name already exists." });
      throw error;
    }
  }

  async deleteSavedView(workspaceId: string, userId: string, viewId: string) {
    await this.requireExecutionWorkspaceOwner(workspaceId, userId);
    const deleted = await this.prisma.executionSavedView.deleteMany({ where: { id: viewId, workspaceId, userId } });
    if (!deleted.count) throw new NotFoundException({ code: "VIEW_NOT_FOUND", message: "Saved view was not found." });
    return { deleted: true };
  }

  private async requireExecutionWorkspaceOwner(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!membership || membership.role !== "OWNER") throw new NotFoundException({ code: "WORKSPACE_NOT_FOUND", message: "Workspace was not found." });
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

  async run(executionId: string, mode: RunMode, startNodeIds?: string[], debugNodeId?: string) {
    const execution = await this.prisma.execution.findUnique({ include: { workflowVersion: { include: { workflow: true } }, nodeExecutions: true }, where: { id: executionId } });
    if (!execution) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    if (execution.status !== ExecutionStatus.QUEUED) return execution;
    const graph = parseWorkflowGraph(execution.workflowVersion.graph);
    const now = new Date();
    const claimed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: ExecutionStatus.QUEUED },
      data: { status: ExecutionStatus.RUNNING, startedAt: execution.startedAt ?? now, completedAt: null, errorCode: null, errorMessage: null, errorRetryable: null, leaseExpiresAt: leaseExpiry(now) },
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
    const pending = debugNodeId
      ? graph.nodes.filter((node) => node.id === debugNodeId)
      : (startNodeIds ? graph.nodes.filter((node) => startNodeIds.includes(node.id)) : graph.nodes.filter((node) => node.type.startsWith("trigger.")));
    const visited = new Set(execution.nodeExecutions.filter((node) => node.status !== NodeExecutionStatus.PENDING && node.status !== NodeExecutionStatus.SKIPPED).map((node) => node.nodeId));

    while (pending.length) {
      if (await this.isCancelled(executionId)) return execution;
      await this.renewLease(executionId);
      const node = pending.shift();
      if (!node || visited.has(node.id)) continue;
      visited.add(node.id);
      const result = await this.runNode(executionId, execution.workflowVersion.workflow.workspaceId, node, context, mode);
      if (debugNodeId) {
        await this.markUnvisitedSkipped(executionId, graph, visited);
        const completedAt = new Date();
        if (result.status === "failed") {
          const failed = await this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.FAILED, completedAt, leaseExpiresAt: null, errorCode: result.error?.code ?? "NODE_FAILED", errorMessage: result.error?.message ?? "Workflow node failed.", errorRetryable: result.error?.retryable ?? false } });
          this.events.publish(executionId, "execution.failed");
          return failed;
        }
        const succeeded = await this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.SUCCEEDED, completedAt, leaseExpiresAt: null } });
        this.events.publish(executionId, "execution.succeeded");
        return succeeded;
      }
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
          const failed = await this.prisma.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.FAILED, completedAt: new Date(), leaseExpiresAt: null, errorCode: result.error?.code ?? "NODE_FAILED", errorMessage: result.error?.message ?? "Workflow node failed.", errorRetryable: result.error?.retryable ?? false } });
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
        this.prisma.nodeExecution.update({ where: { id: waitingNode.id }, data: { status: NodeExecutionStatus.FAILED, errorCode: "APPROVAL_REJECTED", errorMessage: "Approval was rejected.", errorRetryable: false, completedAt: resolvedAt } }),
        this.prisma.execution.update({ where: { id: approval.executionId }, data: { status: ExecutionStatus.FAILED, completedAt: resolvedAt, leaseExpiresAt: null, errorCode: "APPROVAL_REJECTED", errorMessage: "Approval was rejected.", errorRetryable: false } }),
      ]);
      this.events.publish(approval.executionId, "execution.failed");
      return { executionId: approval.executionId, resumed: false, startNodeIds: [], mode: approval.execution.mode === "MOCK" ? "mock" as const : "live" as const };
    }
    const graph = parseWorkflowGraph(approval.execution.workflowVersion.graph);
    const nextNodeIds = graph.edges.filter((edge) => edge.source === waitingNode.nodeId && edge.kind === "success").map((edge) => edge.target);
    await this.prisma.$transaction([
      this.prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: ApprovalRequestStatus.APPROVED, resolvedAt } }),
      this.prisma.nodeExecution.update({ where: { id: waitingNode.id }, data: { status: NodeExecutionStatus.SUCCEEDED, completedAt: resolvedAt } }),
      this.prisma.execution.update({ where: { id: approval.executionId }, data: { status: ExecutionStatus.QUEUED, completedAt: null, leaseExpiresAt: null, errorCode: null, errorMessage: null, errorRetryable: null } }),
    ]);
    this.events.publish(approval.executionId, "execution.queued");
    return { executionId: approval.executionId, resumed: nextNodeIds.length > 0, startNodeIds: nextNodeIds, mode: approval.execution.mode === "MOCK" ? "mock" as const : "live" as const };
  }

  async failFromMaintenance(executionId: string, code: string, message: string, expiredBefore = new Date()) {
    const completedAt = new Date();
    const failed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: ExecutionStatus.RUNNING, leaseExpiresAt: { lte: expiredBefore } },
      data: { status: ExecutionStatus.FAILED, completedAt, leaseExpiresAt: null, errorCode: code, errorMessage: message, errorRetryable: false, recoveryCount: { increment: 1 } },
    });
    if (!failed.count) return false;
    await this.prisma.$transaction([
      this.prisma.nodeExecution.updateMany({ where: { executionId, status: NodeExecutionStatus.RUNNING }, data: { status: NodeExecutionStatus.FAILED, completedAt, errorCode: code, errorMessage: message, errorRetryable: false } }),
      this.prisma.nodeExecution.updateMany({ where: { executionId, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt } }),
    ]);
    this.events.publish(executionId, "execution.failed");
    return true;
  }

  async failFromWorker(executionId: string) {
    const completedAt = new Date();
    const failed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: { in: [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING] } },
      data: { status: ExecutionStatus.FAILED, completedAt, leaseExpiresAt: null, errorCode: "WORKER_EXECUTION_ERROR", errorMessage: "Execution worker stopped unexpectedly.", errorRetryable: false },
    });
    if (!failed.count) return;
    await this.prisma.nodeExecution.updateMany({ where: { executionId, status: { in: [NodeExecutionStatus.PENDING, NodeExecutionStatus.RUNNING] } }, data: { status: NodeExecutionStatus.FAILED, completedAt, errorCode: "WORKER_EXECUTION_ERROR", errorMessage: "Execution worker stopped unexpectedly.", errorRetryable: false } });
    this.events.publish(executionId, "execution.failed");
  }

  private async runNode(executionId: string, workspaceId: string, node: WorkflowNode, context: Record<string, unknown>, mode: RunMode): Promise<NodeResult> {
    const rawConfig = node.config as Record<string, unknown>;
    const retries = readRetries(rawConfig);
    let attempt = 0;
    while (attempt < retries) {
      attempt += 1;
      const startedAt = new Date();
      await this.prisma.nodeExecution.update({
        where: { executionId_nodeId: { executionId, nodeId: node.id } },
        data: { status: NodeExecutionStatus.RUNNING, attempt, input: redactValue({ config: rawConfig, trigger: context.trigger }) as Prisma.InputJsonValue, startedAt, completedAt: null, errorCode: null, errorMessage: null, errorRetryable: null },
      });
      try {
        const config = resolveExpressions(rawConfig, context) as Record<string, unknown>;
        const input = { config, trigger: context.trigger };
        await this.prisma.nodeExecution.update({
          where: { executionId_nodeId: { executionId, nodeId: node.id } },
          data: { input: redactValue(input) as Prisma.InputJsonValue },
        });
        const result = await executeNode(node, config, context, mode, workspaceId, this.credentials);
        await this.prisma.nodeExecution.update({
          where: { executionId_nodeId: { executionId, nodeId: node.id } },
          data: { status: result.status === "waiting" ? NodeExecutionStatus.WAITING : NodeExecutionStatus.SUCCEEDED, output: redactValue(result.output) as Prisma.InputJsonValue, completedAt: new Date() },
        });
        this.events.publish(executionId, "node.updated");
        return result;
      } catch (reason) {
        const failure = nodeFailureFromExecutionError(reason);
        const retryable = failure.retryable || isRetryableFailure(failure);
        await this.prisma.nodeExecution.update({
          where: { executionId_nodeId: { executionId, nodeId: node.id } },
          data: { status: NodeExecutionStatus.FAILED, errorCode: failure.code, errorMessage: failure.message, errorRetryable: retryable, completedAt: new Date() },
        });
        this.events.publish(executionId, "node.updated");
        if (!retryable || attempt >= retries) return { status: "failed", output: {}, error: failure };
        await delay(retryDelayMs(attempt));
      }
    }
    return { status: "failed", output: {}, error: new NodeFailure("RETRY_EXHAUSTED", "Retry attempts were exhausted.", false) };
  }

  async notifyApproval(workspaceId: string, approvalId: string, output: Record<string, unknown>, mode: RunMode): Promise<string> {
    const credentialId = typeof output.notificationCredentialId === "string" ? output.notificationCredentialId : "";
    if (!credentialId) return "not_configured";
    if (mode === "mock") return "mock_not_sent";
    try {
      const link = `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/editor?approval=${encodeURIComponent(approvalId)}`;
      const rawMessage = String(output.message ?? "Approval requested");
      const message = `${rawMessage}\n\nReview: ${link}`;
      const isHttp = output.notificationProvider === "http_webhook";
      const provider = isHttp ? CredentialProvider.HTTP : CredentialProvider.GOOGLE_CHAT_WEBHOOK;
      const credential = await this.credentials.readForExecution(credentialId, workspaceId, provider);
      const delivery = await defaultNotificationDispatcher.dispatch(
        {
          provider: isHttp ? "http_webhook" : "google_chat",
          message: isHttp ? rawMessage : message,
          content: isHttp ? rawMessage : message,
          approvalUrl: link,
        },
        credential,
        mode,
      );
      return delivery.delivered ? "sent" : "failed";
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

  private async assertLiveReady(workspaceId: string, graph: WorkflowGraph) {
    const readiness = await this.evaluateLiveReadiness(workspaceId, graph);
    if (readiness.ready) return;
    throw new BadRequestException({
      code: "LIVE_CREDENTIAL_REQUIRED",
      message: "Select valid credentials for every live integration node before going live.",
      details: readiness.requirements.filter((requirement) => !requirement.ready).map((requirement) => ({ nodeId: requirement.nodeId, provider: requirement.provider })),
    });
  }

  private async evaluateLiveReadiness(workspaceId: string, graph: WorkflowGraph) {
    const requirements = liveCredentialRequirements(graph);
    const selectedIds = requirements.flatMap((requirement) => requirement.credentialId ? [requirement.credentialId] : []);
    const credentials = selectedIds.length
      ? await this.prisma.credential.findMany({ where: { id: { in: selectedIds }, workspaceId }, select: { id: true, provider: true } })
      : [];
    const providerById = new Map(credentials.map((credential) => [credential.id, credential.provider]));
    const checked = requirements.map((requirement) => {
      if (!requirement.credentialId) return { ...requirement, ready: false, reason: "MISSING_CREDENTIAL" as const };
      const provider = providerById.get(requirement.credentialId);
      if (!provider) return { ...requirement, ready: false, reason: "CREDENTIAL_NOT_FOUND" as const };
      if (provider !== requirement.provider) return { ...requirement, ready: false, reason: "CREDENTIAL_PROVIDER_MISMATCH" as const };
      return { ...requirement, ready: true, reason: null };
    });
    return { ready: checked.every((requirement) => requirement.ready), requirements: checked };
  }
}

function isUniqueConstraintError(reason: unknown) {
  return Boolean(reason && typeof reason === "object" && "code" in reason && (reason as { code?: unknown }).code === "P2002");
}

function failureHandling(graph: WorkflowGraph, nodeId: string) {
  const targets = graph.edges.filter((edge) => edge.source === nodeId && edge.kind === "error").map((edge) => edge.target);
  return targets.length
    ? { kind: "error_branch" as const, targetNodeIds: targets }
    : { kind: "execution_failed" as const, targetNodeIds: [] };
}

function skippedReason(status: ExecutionStatus) {
  if (status === ExecutionStatus.CANCELLED) return "execution_cancelled" as const;
  if (status === ExecutionStatus.WAITING_APPROVAL) return "waiting_for_approval" as const;
  if (status === ExecutionStatus.FAILED) return "not_reached_after_failure" as const;
  return "branch_not_selected" as const;
}

function sanitizeDiagnosticError(error: { code: string; message: string | null; retryable: boolean } | null) {
  if (!error) return null;
  const message = (error.message ?? "Execution failed.")
    .replace(/https?:\/\/[^\s"']+/gi, "[REDACTED_URL]")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]");
  return { code: error.code, message, retryable: error.retryable };
}

function leaseExpiry(now: Date) {
  return new Date(now.getTime() + executionLeaseMs);
}

async function executeNode(node: WorkflowNode, config: Record<string, unknown>, context: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  if (!isExecutableWorkflowNodeType(node.type)) throw new NodeFailure("NODE_UNAVAILABLE", `${node.type} is not available in this MVP execution engine.`, false);
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
    return executeGoogleChatWebhook(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.google-chat.oauth") {
    return executeGoogleChatOAuth(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.discord.webhook") {
    return executeDiscordWebhook(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.telegram.message") {
    return executeTelegramMessage(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.email") {
    return executeSmtpEmail(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.mongodb") {
    return executeMongoFind(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.mongodb.insert") {
    return executeMongoInsert(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.notion.search-pages") {
    return executeNotionSearch(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.postgres.select") {
    return executePostgresSelect(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.gmail.read") {
    return executeGmailRead(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.gemini") {
    return executeGeminiText(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.openai") {
    return executeOpenAIText(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.github") {
    return executeGitHubCreateIssue(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.github.add-label") {
    return executeGitHubAddLabel(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.github.add-comment") {
    return executeGitHubAddComment(config, mode, workspaceId, credentials);
  }
  if (node.type === "action.github.merge-pull-request") {
    return executeGitHubMergePullRequest(config, mode, workspaceId, credentials);
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

export async function executeGoogleChatWebhook(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const message = typeof config.message === "string" ? config.message : "";
  if (mode === "live") {
    if (!message.trim()) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Google Chat message is required.", false);
    }
    const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GOOGLE_CHAT_WEBHOOK);
    const output = await defaultNotificationDispatcher.dispatch({
      provider: "google_chat",
      message,
      content: message,
    }, credential, mode);
    return { status: "succeeded", output, route: "success" };
  }
  const output = await defaultNotificationDispatcher.dispatch({
    provider: "google_chat",
    message,
    content: message,
  }, undefined, mode);
  return { status: "succeeded", output, route: "success" };
}

export async function executeDiscordWebhook(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const content = typeof config.content === "string" ? config.content : (typeof config.message === "string" ? config.message : "");
  const username = typeof config.username === "string" && config.username.trim() ? config.username.trim() : undefined;
  const avatarUrl = typeof config.avatarUrl === "string" && config.avatarUrl.trim() ? config.avatarUrl.trim() : undefined;
  const embeds = config.embeds;
  const allowedMentions = config.allowedMentions;

  if (mode === "live") {
    if (!content.trim() && (!embeds || (Array.isArray(embeds) && embeds.length === 0))) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Discord message content is required.", false);
    }
    const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.DISCORD_WEBHOOK);
    const output = await defaultNotificationDispatcher.dispatch({
      provider: "discord",
      content,
      username,
      avatarUrl,
      embeds,
      allowedMentions,
    }, credential, mode);
    return { status: "succeeded", output, route: "success" };
  }

  const output = await defaultNotificationDispatcher.dispatch({
    provider: "discord",
    content,
    username,
    avatarUrl,
    embeds,
    allowedMentions,
  }, undefined, mode);
  return { status: "succeeded", output, route: "success" };
}

export async function executeTelegramMessage(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const text = typeof config.text === "string" ? config.text : (typeof config.message === "string" ? config.message : "");
  const parseMode = typeof config.parseMode === "string" && config.parseMode.trim() ? config.parseMode.trim() : undefined;
  const configChatId = typeof config.chatId === "string" && config.chatId.trim() ? config.chatId.trim() : (typeof config.chatId === "number" ? String(config.chatId) : undefined);
  const destinationType = readTelegramDestinationType(config.destinationType);
  const messageThreadId = typeof config.messageThreadId === "string" && config.messageThreadId.trim()
    ? config.messageThreadId.trim()
    : (typeof config.messageThreadId === "number" ? String(config.messageThreadId) : undefined);

  if (mode === "live") {
    if (!text.trim()) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Telegram message text is required.", false);
    }
    const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.TELEGRAM_BOT);
    validateTelegramDestination(destinationType, configChatId, messageThreadId);
    const output = await defaultNotificationDispatcher.dispatch({
      provider: "telegram",
      text,
      chatId: configChatId,
      destination: configChatId,
      parseMode,
      messageThreadId,
    }, credential, mode);
    return { status: "succeeded", output, route: "success" };
  }

  const output = await defaultNotificationDispatcher.dispatch({
    provider: "telegram",
    text,
    chatId: configChatId,
    destination: configChatId,
    parseMode,
    messageThreadId,
  }, undefined, mode);
  return { status: "succeeded", output, route: "success" };
}

export async function executeGitHubCreateIssue(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const repository = readGitHubRepository(config.repository);
  const title = typeof config.title === "string" ? config.title.trim() : "";
  const body = typeof config.body === "string" ? config.body : "";
  const labels = readGitHubLabels(config.labels);
  const idempotencyKey = readGitHubIdempotencyKey(config.idempotencyKey);
  if (!title) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue title is required.", false);

  if (mode === "mock") {
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "create_issue",
        repository,
        issueNumber: 1,
        url: `https://github.com/${repository}/issues/1`,
        labels,
        deduplicated: false,
        mode: "mock",
      },
      route: "success",
    };
  }

  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing token.", false);

  const [owner, repo] = readGitHubRepositoryParts(repository);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Fluxora",
  };
  try {
    const marker = idempotencyKey ? githubIdempotencyMarker(idempotencyKey) : undefined;
    if (marker) {
      const existing = await findGitHubIssueByMarker(owner, repo, marker, headers);
      if (existing) {
        return {
          status: "succeeded",
          output: {
            delivered: true,
            provider: "github",
            operation: "create_issue",
            repository,
            issueNumber: existing.number,
            url: existing.url,
            labels,
            deduplicated: true,
            mode: "live",
            sentAt: new Date().toISOString(),
          },
          route: "success",
        };
      }
    }
    const issueBody = marker ? appendGitHubIdempotencyMarker(body, marker) : body;
    const response = await fetchSafeOutbound(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ title, body: issueBody, ...(labels.length ? { labels } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as { number?: unknown; html_url?: unknown };
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new NodeFailure("HTTP_ERROR", `GitHub returned ${response.status}.`, retryable, response.status);
    }
    if (typeof payload.number !== "number" || typeof payload.html_url !== "string") {
      throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "GitHub returned an invalid issue response.", false);
    }
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "create_issue",
        repository,
        issueNumber: payload.number,
        url: payload.html_url,
        labels,
        deduplicated: false,
        mode: "live",
        sentAt: new Date().toISOString(),
      },
      route: "success",
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    if (reason instanceof OutboundRequestPolicyError) throw nodeFailureFromOutboundPolicy(reason);
    const timeout = reason instanceof Error && reason.name === "TimeoutError";
    throw new NodeFailure(timeout ? "TIMEOUT" : "NETWORK_ERROR", timeout ? "GitHub request timed out." : "GitHub request failed.", true);
  }
}

export async function executeGitHubAddLabel(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const repository = readGitHubRepository(config.repository);
  const issueNumber = readGitHubIssueNumber(config.issueNumber);
  const label = readGitHubLabel(config.label);
  if (!label) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue label is required.", false);

  if (mode === "mock") {
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "add_label",
        repository,
        issueNumber,
        addedLabel: label,
        labels: [label],
        mode: "mock",
      },
      route: "success",
    };
  }

  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing token.", false);
  const [owner, repo] = readGitHubRepositoryParts(repository);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`;
  try {
    const response = await fetchSafeOutbound(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Fluxora",
      },
      body: JSON.stringify({ labels: [label] }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new NodeFailure("HTTP_ERROR", `GitHub returned ${response.status}.`, retryable, response.status);
    }
    if (!Array.isArray(payload) || !payload.every((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string")) {
      throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "GitHub returned an invalid labels response.", false);
    }
    const labels = payload.map((item) => (item as { name: string }).name);
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "add_label",
        repository,
        issueNumber,
        addedLabel: label,
        labels,
        mode: "live",
        sentAt: new Date().toISOString(),
      },
      route: "success",
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    if (reason instanceof OutboundRequestPolicyError) throw nodeFailureFromOutboundPolicy(reason);
    const timeout = reason instanceof Error && reason.name === "TimeoutError";
    throw new NodeFailure(timeout ? "TIMEOUT" : "NETWORK_ERROR", timeout ? "GitHub request timed out." : "GitHub request failed.", true);
  }
}

export async function executeGitHubAddComment(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const repository = readGitHubRepository(config.repository);
  const issueNumber = readGitHubIssueNumber(config.issueNumber);
  const body = readGitHubCommentBody(config.body);

  if (mode === "mock") {
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "add_comment",
        repository,
        issueNumber,
        commentId: 1,
        url: `https://github.com/${repository}/issues/${issueNumber}#issuecomment-1`,
        body,
        mode: "mock",
      },
      route: "success",
    };
  }

  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing token.", false);
  const [owner, repo] = readGitHubRepositoryParts(repository);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`;
  try {
    const response = await fetchSafeOutbound(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Fluxora",
      },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as { id?: unknown; html_url?: unknown; body?: unknown };
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new NodeFailure("HTTP_ERROR", `GitHub returned ${response.status}.`, retryable, response.status);
    }
    if (typeof payload.id !== "number" || !Number.isSafeInteger(payload.id) || typeof payload.html_url !== "string") {
      throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "GitHub returned an invalid comment response.", false);
    }
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "add_comment",
        repository,
        issueNumber,
        commentId: payload.id,
        url: payload.html_url,
        body: typeof payload.body === "string" ? payload.body : body,
        mode: "live",
        sentAt: new Date().toISOString(),
      },
      route: "success",
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    if (reason instanceof OutboundRequestPolicyError) throw nodeFailureFromOutboundPolicy(reason);
    const timeout = reason instanceof Error && reason.name === "TimeoutError";
    throw new NodeFailure(timeout ? "TIMEOUT" : "NETWORK_ERROR", timeout ? "GitHub request timed out." : "GitHub request failed.", true);
  }
}

export async function executeGitHubMergePullRequest(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const repository = readGitHubRepository(config.repository);
  const pullRequestNumber = readGitHubIssueNumber(config.pullRequestNumber);
  const mergeMethod = readGitHubMergeMethod(config.mergeMethod);

  if (mode === "mock") {
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "merge_pull_request",
        repository,
        pullRequestNumber,
        merged: true,
        sha: "mock-merge-sha",
        message: "Pull Request successfully merged",
        mergeMethod,
        url: `https://github.com/${repository}/pull/${pullRequestNumber}`,
        mode: "mock",
      },
      route: "success",
    };
  }

  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing token.", false);
  const [owner, repo] = readGitHubRepositoryParts(repository);
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullRequestNumber}/merge`;
  try {
    const response = await fetchSafeOutbound(url, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Fluxora",
      },
      body: JSON.stringify({ merge_method: mergeMethod }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({})) as { merged?: unknown; sha?: unknown; message?: unknown };
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new NodeFailure("HTTP_ERROR", `GitHub returned ${response.status}.`, retryable, response.status);
    }
    if (typeof payload.merged !== "boolean" || typeof payload.sha !== "string" || typeof payload.message !== "string") {
      throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "GitHub returned an invalid merge response.", false);
    }
    return {
      status: "succeeded",
      output: {
        delivered: true,
        provider: "github",
        operation: "merge_pull_request",
        repository,
        pullRequestNumber,
        merged: payload.merged,
        sha: payload.sha,
        message: payload.message,
        mergeMethod,
        url: `https://github.com/${repository}/pull/${pullRequestNumber}`,
        mode: "live",
        sentAt: new Date().toISOString(),
      },
      route: "success",
    };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    if (reason instanceof OutboundRequestPolicyError) throw nodeFailureFromOutboundPolicy(reason);
    const timeout = reason instanceof Error && reason.name === "TimeoutError";
    throw new NodeFailure(timeout ? "TIMEOUT" : "NETWORK_ERROR", timeout ? "GitHub request timed out." : "GitHub request failed.", true);
  }
}

function readGitHubRepository(value: unknown) {
  const repository = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new NodeFailure("INVALID_CONFIGURATION", "GitHub repository must use the owner/repository format.", false);
  }
  return repository;
}

function readGitHubRepositoryParts(repository: string): [string, string] {
  const parts = repository.split("/");
  return [parts[0]!, parts[1]!];
}

function readGitHubLabels(value: unknown) {
  if (value === undefined || value === null || value === "") return [] as string[];
  if (typeof value !== "string") throw new NodeFailure("INVALID_CONFIGURATION", "GitHub labels must be comma-separated text.", false);
  return value.split(",").map((label) => label.trim()).filter(Boolean).slice(0, 20);
}

function readGitHubIssueNumber(value: unknown) {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d*$/.test(text)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue number must be a positive integer.", false);
  const issueNumber = Number(text);
  if (!Number.isSafeInteger(issueNumber)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue number is too large.", false);
  return issueNumber;
}

function readGitHubLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const label = value.trim();
  if (label.length > 50 || /[\u0000-\u001f\u007f]/.test(label)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub issue label must be printable text up to 50 characters.", false);
  return label;
}

function readGitHubCommentBody(value: unknown) {
  if (typeof value !== "string") throw new NodeFailure("INVALID_CONFIGURATION", "GitHub comment body is required.", false);
  if (!value.trim()) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub comment body is required.", false);
  if (value.length > 65_536 || /\u0000/.test(value)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub comment body must be printable text up to 65,536 characters.", false);
  return value;
}

function readGitHubMergeMethod(value: unknown) {
  const mergeMethod = typeof value === "string" && value.trim() ? value.trim() : "merge";
  if (!(mergeMethod === "merge" || mergeMethod === "squash" || mergeMethod === "rebase")) {
    throw new NodeFailure("INVALID_CONFIGURATION", "GitHub merge method must be merge, squash, or rebase.", false);
  }
  return mergeMethod;
}

function readGitHubIdempotencyKey(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new NodeFailure("INVALID_CONFIGURATION", "GitHub idempotency key must be visible ASCII text.", false);
  const key = value.trim();
  if (!/^[\x21-\x7e]{1,160}$/.test(key)) throw new NodeFailure("INVALID_CONFIGURATION", "GitHub idempotency key must be visible ASCII text up to 160 characters.", false);
  return key;
}

function githubIdempotencyMarker(key: string) {
  const digest = createHash("sha256").update(key).digest("hex");
  return `<!-- fluxora:github:create-issue:${digest} -->`;
}

function appendGitHubIdempotencyMarker(body: string, marker: string) {
  return body.includes(marker) ? body : `${body}${body ? "\n\n" : ""}${marker}`;
}

async function findGitHubIssueByMarker(owner: string, repo: string, marker: string, headers: Record<string, string>) {
  const query = encodeURIComponent(`repo:${owner}/${repo} ${marker}`);
  const url = `https://api.github.com/search/issues?q=${query}&per_page=10`;
  const response = await fetchSafeOutbound(url, { method: "GET", headers, signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(() => ({})) as { items?: unknown };
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new NodeFailure("HTTP_ERROR", `GitHub returned ${response.status}.`, retryable, response.status);
  }
  if (!Array.isArray(payload.items)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "GitHub returned an invalid search response.", false);
  const match = payload.items.find((item): item is { number: number; html_url: string; body: string } => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return typeof record.number === "number"
      && typeof record.html_url === "string"
      && typeof record.body === "string"
      && record.body.includes(marker);
  });
  return match ? { number: match.number, url: match.html_url } : null;
}
