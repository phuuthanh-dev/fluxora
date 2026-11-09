import type { RunMode, NodeResult } from "./node-executor-contract";
export { steamSnapshot } from "./steam-adapter";
export { mockDrive, executeGoogleDrive } from "./google-workspace-adapter";
export { executeGoogleChatWebhook, executeDiscordWebhook, executeTelegramMessage } from "./notification-adapters";
export { executeGitHubCreateIssue, executeGitHubAddLabel, executeGitHubAddComment, executeGitHubMergePullRequest } from "./github-write-adapter";
import { getConnectorExecutor } from "./connector-executors";
import { isExecutableWorkflowNodeType, nodeConfigIssues, type WorkflowEdge, type WorkflowGraph, type WorkflowNode } from "@workflow/contracts";
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalRequestStatus, CredentialProvider, ExecutionStatus, NodeExecutionStatus, Prisma } from "@prisma/client";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CredentialService } from "../credentials/credential.service";
import { lockGraphCredentials } from "../credentials/credential-references";
import { PrismaService } from "../database/prisma.service";
import { ExecutionEventsService } from "./execution-events.service";
import { resolveExpressions } from "./expression";
import { assertSupportedItemPath, isCollectionProducer, maximumOutputItems, outputItems, type WorkflowItem } from "./item-stream";
import { redactValue } from "./redaction";
import { isRetryableFailure, retryDelayMs } from "./retry-policy";
import { parseStoredWorkflowGraph, unavailableWorkflowNodes, workflowNodeDepths } from "../workflows/workflow-graph";
import { liveCredentialRequirements } from "./live-readiness";
import { executionRetentionPolicy } from "./retention-policy";

export type ExecutionTriageFilter = "ALL" | "ATTENTION" | "IN_PROGRESS" | "FAILED" | "SUCCEEDED";
const executionLeaseMs = 5 * 60 * 1000;

import { NodeFailure, nodeFailureFromExecutionError } from "./node-failure";
import { defaultNotificationDispatcher } from "../notifications";

export { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
export { validateDiscordWebhookUrl, sanitizeTelegramFailure } from "../notifications";

async function markApprovalExpired(transaction: Prisma.TransactionClient, executionId: string, nodeExecutionId: string, approvalId: string, resolvedAt: Date) {
  await transaction.execution.update({ where: { id: executionId }, data: { status: ExecutionStatus.FAILED, completedAt: resolvedAt, leaseExpiresAt: null, runToken: null, resumeToken: null, resumeNodeIds: Prisma.DbNull, resumeQueuedAt: null, errorCode: "APPROVAL_EXPIRED", errorMessage: "Approval request has expired.", errorRetryable: false } });
  await transaction.nodeExecution.update({ where: { id: nodeExecutionId }, data: { status: NodeExecutionStatus.FAILED, completedAt: resolvedAt, errorCode: "APPROVAL_EXPIRED", errorMessage: "Approval request has expired.", errorRetryable: false } });
  await transaction.approvalRequest.update({ where: { id: approvalId }, data: { status: ApprovalRequestStatus.EXPIRED, resolvedAt } });
}

async function finishInterruptedItems(transaction: Prisma.TransactionClient, executionId: string, completedAt: Date) {
  await transaction.nodeExecutionItem.updateMany({ where: { nodeExecution: { executionId }, status: NodeExecutionStatus.RUNNING }, data: { status: NodeExecutionStatus.FAILED, completedAt, errorCode: "ITEM_INTERRUPTED", errorMessage: "This item was interrupted; an external request may still have completed. Check the provider before retrying.", errorRetryable: false } });
  await transaction.nodeExecutionItem.updateMany({ where: { nodeExecution: { executionId }, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt } });
}

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
    if (!mock && !debugNodeId && parseStoredWorkflowGraph(version.graph).nodes.some((node) => node.type === "trigger.gmail")) throw new BadRequestException({ code: "GMAIL_TRIGGER_LIVE_ONLY", message: "Activate this workflow and wait for a new Gmail message. Use a test run for sample data." });
    if (!mock && !debugNodeId && parseStoredWorkflowGraph(version.graph).nodes.some((node) => node.type === "trigger.google-calendar.event")) throw new BadRequestException({ code: "CALENDAR_TRIGGER_LIVE_ONLY", message: "Activate this workflow and wait for a Calendar change. Use a test run for sample data." });
    if (debugNodeId) {
      const debugNode = parseStoredWorkflowGraph(version.graph).nodes.find((node) => node.id === debugNodeId);
      if (!debugNode) throw new BadRequestException({ code: "NODE_NOT_FOUND", message: "The selected node does not exist in this workflow." });
      if (debugNode.type === "approval.request") throw new BadRequestException({ code: "NODE_DEBUG_UNSUPPORTED", message: "Approval nodes must be tested as part of the full workflow." });
    }
    if (!mock) await this.assertLiveReady(workflow.workspaceId, parseStoredWorkflowGraph(version.graph));
    const data = { workflowVersionId: version.id, mode: mock ? "MOCK" : "LIVE", triggerData: redactValue(triggerData) as Prisma.InputJsonValue };
    const execution = mock ? await this.prisma.execution.create({ data }) : await this.prisma.$transaction(async (tx) => {
      await lockGraphCredentials(tx, workflow.workspaceId, version.graph);
      return tx.execution.create({ data });
    });
    await this.prisma.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: debugNodeId ? "execution.node_debug_started" : "execution.manual_started", targetType: "execution", targetId: execution.id, metadata: { mode: mock ? "mock" : "live", ...(debugNodeId ? { nodeId: debugNodeId } : {}) } } });
    return execution;
  }

  async createLegacyWebhookExecution(input: { workflowId: string; workflowVersionId: string; endpointId: string; path: string; secretHash: string | null; encryptedSigningSecret: string | null; credentialSnapshot?: { id: string; encryptedData: string }; payload: Record<string, unknown>; idempotencyKey?: string }) {
    const version = await this.prisma.workflowVersion.findUnique({ where: { id: input.workflowVersionId }, include: { workflow: true } });
    if (!version || version.workflowId !== input.workflowId) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    await this.assertLiveReady(version.workflow.workspaceId, parseStoredWorkflowGraph(version.graph));
    return this.prisma.$transaction(async (transaction) => {
      const workflows = await transaction.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${input.workflowId} FOR UPDATE`;
      if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== input.workflowVersionId) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
      const endpoints = await transaction.$queryRaw<Array<{ workflowId: string; workflowVersionId: string; path: string; secretHash: string | null; encryptedSigningSecret: string | null; isActive: boolean }>>`SELECT "workflowId", "workflowVersionId", path, "secretHash", "encryptedSigningSecret", "isActive" FROM "WebhookEndpoint" WHERE id = ${input.endpointId} FOR UPDATE`;
      const endpoint = endpoints[0];
      if (!endpoint?.isActive || endpoint.workflowId !== input.workflowId || endpoint.workflowVersionId !== input.workflowVersionId || endpoint.path !== input.path || endpoint.secretHash !== input.secretHash || endpoint.encryptedSigningSecret !== input.encryptedSigningSecret) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
      if (input.credentialSnapshot) {
        const rows = await transaction.$queryRaw<Array<{ encryptedData: string }>>`SELECT "encryptedData" FROM "Credential" WHERE id = ${input.credentialSnapshot.id} AND "workspaceId" = ${version.workflow.workspaceId} AND provider = 'GITHUB' FOR SHARE`;
        if (!rows[0] || rows[0].encryptedData !== input.credentialSnapshot.encryptedData) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
      }
      if (input.idempotencyKey) {
        const existing = await transaction.execution.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) return existing;
      }
      return transaction.execution.create({ data: { workflowVersionId: input.workflowVersionId, mode: "LIVE", triggerData: redactValue(input.payload) as Prisma.InputJsonValue, ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) } });
    });
  }

  /** A cron scan can hold an old version across deactivation or publication.
   * Serialize acceptance with those operations on the workflow row. */
  async createCronScheduledExecution(workflowVersionId: string, triggerData: Record<string, unknown>, idempotencyKey: string) {
    const version = await this.prisma.workflowVersion.findUnique({ where: { id: workflowVersionId }, include: { workflow: true } });
    if (!version) throw new NotFoundException({ code: "WORKFLOW_VERSION_NOT_FOUND", message: "Workflow version was not found." });
    await this.assertLiveReady(version.workflow.workspaceId, parseStoredWorkflowGraph(version.graph));
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${version.workflowId} FOR UPDATE`;
      if (!rows[0]?.isActive || rows[0].archivedAt || rows[0].publishedVersionId !== workflowVersionId) throw new ConflictException({ code: "WORKFLOW_CHANGED", message: "The workflow is no longer active at this version." });
      const existing = await transaction.execution.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
      return transaction.execution.create({ data: { workflowVersionId, mode: "LIVE", triggerData: redactValue(triggerData) as Prisma.InputJsonValue, idempotencyKey } });
    });
  }

  /** Persist a filtered Kuma delivery before queueing. The workflow lock
   * serializes duplicate delivery IDs and endpoint changes for this workflow. */
  async createKumaScheduledExecution(input: { workflowId: string; workflowVersionId: string; endpointId: string; path: string; secretHash: string; payload: Record<string, unknown>; deliveryKey?: string }) {
    return this.createGuardedWebhookExecution(input, "kuma");
  }

  async createTelegramScheduledExecution(input: { workflowId: string; workflowVersionId: string; endpointId: string; path: string; secretHash: string; payload: Record<string, unknown>; deliveryKey: string }) {
    return this.createGuardedWebhookExecution(input, "telegram");
  }

  async createVercelScheduledExecution(input: { workflowId: string; workflowVersionId: string; endpointId: string; path: string; secretHash: string; payload: Record<string, unknown>; deliveryKey: string }) {
    return this.createGuardedWebhookExecution(input, "vercel");
  }

  async createTrelloScheduledExecution(input: { workflowId: string; workflowVersionId: string; endpointId: string; path: string; secretHash: string; payload: Record<string, unknown>; deliveryKey: string }) {
    return this.createGuardedWebhookExecution(input, "trello");
  }

  async createSentryScheduledExecution(input: { workflowId: string; workflowVersionId: string; endpointId: string; path: string; secretHash: string; payload: Record<string, unknown>; deliveryKey: string }) {
    return this.createGuardedWebhookExecution(input, "sentry");
  }

  async createSlackScheduledExecution(input: { workflowId: string; workflowVersionId: string; endpointId: string; path: string; secretHash: string; payload: Record<string, unknown>; deliveryKey: string }) {
    return this.createGuardedWebhookExecution(input, "slack");
  }

  private async createGuardedWebhookExecution(input: { workflowId: string; workflowVersionId: string; endpointId: string; path: string; secretHash: string; payload: Record<string, unknown>; deliveryKey?: string }, provider: "kuma" | "telegram" | "vercel" | "trello" | "sentry" | "slack") {
    const version = await this.prisma.workflowVersion.findUnique({ where: { id: input.workflowVersionId }, include: { workflow: true } });
    if (!version || version.workflowId !== input.workflowId) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    await this.assertLiveReady(version.workflow.workspaceId, parseStoredWorkflowGraph(version.graph));
    const key = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64");
    if (key.length !== 32) throw new BadRequestException({ code: "ENCRYPTION_KEY_INVALID", message: "A valid encryption key is required for webhook delivery." });
    // Never store the incoming key or raw payload as a fingerprint. The
    // payload is already normalized to an explicit, stable field order.
    if (provider === "telegram" && (!input.deliveryKey || !/^\d{1,16}$/.test(input.deliveryKey))) throw new BadRequestException({ code: "TELEGRAM_UPDATE_INVALID", message: "Telegram update is invalid." });
    if (provider === "vercel" && (!input.deliveryKey || !/^[A-Za-z0-9_-]{1,160}$/.test(input.deliveryKey))) throw new BadRequestException({ code: "VERCEL_WEBHOOK_INVALID", message: "Vercel webhook data is invalid." });
    if (provider === "trello" && (!input.deliveryKey || !/^[a-f0-9]{24}$/.test(input.deliveryKey))) throw new BadRequestException({ code: "TRELLO_WEBHOOK_INVALID", message: "Trello webhook data is invalid." });
    if (provider === "sentry" && (!input.deliveryKey || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[1-9][0-9]{0,29}$/.test(input.deliveryKey))) throw new BadRequestException({ code: "SENTRY_WEBHOOK_INVALID", message: "Sentry webhook data is invalid." });
    if (provider === "slack" && (!input.deliveryKey || !/^[A-Za-z0-9_-]{3,160}$/.test(input.deliveryKey))) throw new BadRequestException({ code: "SLACK_EVENT_INVALID", message: "Slack event ID is invalid." });
    const identityParts = provider === "kuma" ? ["kuma-delivery-v2", input.endpointId, input.workflowVersionId, input.deliveryKey === undefined ? "generated" : "provided", input.deliveryKey ?? randomBytes(24).toString("hex")] : [`${provider}-delivery-v1`, input.endpointId, input.deliveryKey];
    const identity = createHmac("sha256", key).update(JSON.stringify(identityParts)).digest("hex");
    const idempotencyKey = `${provider === "kuma" ? "kuma-v2" : `${provider}-v1`}:${identity}`;
    const digest = createHmac("sha256", key).update(provider === "kuma" ? "kuma-payload-v2\0" : `${provider}-payload-v1\0`).update(JSON.stringify(input.payload)).digest("hex");
    return this.prisma.$transaction(async (transaction) => {
      const workflows = await transaction.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${input.workflowId} FOR UPDATE`;
      if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== input.workflowVersionId) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
      const endpoints = await transaction.$queryRaw<Array<{ workflowId: string; workflowVersionId: string; path: string; secretHash: string | null; isActive: boolean }>>`SELECT "workflowId", "workflowVersionId", "path", "secretHash", "isActive" FROM "WebhookEndpoint" WHERE id = ${input.endpointId} FOR UPDATE`;
      const endpoint = endpoints[0];
      if (!endpoint?.isActive || endpoint.workflowId !== input.workflowId || endpoint.workflowVersionId !== input.workflowVersionId || endpoint.path !== input.path || endpoint.secretHash !== input.secretHash) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
      const existing = await transaction.execution.findUnique({ where: { idempotencyKey } });
      if (existing) {
        const rows = await transaction.$queryRaw<Array<{ webhookPayloadDigest: string | null }>>`SELECT "webhookPayloadDigest" FROM "Execution" WHERE id = ${existing.id}`;
        const old = rows[0]?.webhookPayloadDigest;
        const same = typeof old === "string" && /^[a-f0-9]{64}$/.test(old) && timingSafeEqual(Buffer.from(old, "hex"), Buffer.from(digest, "hex"));
        if (!same) throw new ConflictException({ code: "WEBHOOK_DELIVERY_CONFLICT", message: "The delivery key was already used for different content." });
        return existing;
      }
      const execution = await transaction.execution.create({ data: { workflowVersionId: input.workflowVersionId, mode: "LIVE", triggerData: redactValue(input.payload) as Prisma.InputJsonValue, idempotencyKey } });
      await transaction.$executeRaw`UPDATE "Execution" SET "webhookPayloadDigest" = ${digest} WHERE id = ${execution.id}`;
      return execution;
    });
  }

  async createGmailScheduledExecution(workflowVersionId: string, workflowId: string, nodeId: string, messageId: string, leaseToken: string, triggerData: Record<string, unknown>, idempotencyKey: string) {
    const version = await this.prisma.workflowVersion.findUnique({ where: { id: workflowVersionId }, include: { workflow: true } });
    if (!version || version.workflowId !== workflowId) throw new NotFoundException({ code: "WORKFLOW_VERSION_NOT_FOUND", message: "Workflow version was not found." });
    await this.assertLiveReady(version.workflow.workspaceId, parseStoredWorkflowGraph(version.graph));
    return this.prisma.$transaction(async (transaction) => {
      const workflows = await transaction.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== workflowVersionId) return { execution: null, alreadyDispatched: false };
      const checkpoints = await transaction.$queryRaw<Array<{ leaseToken: string | null; leaseExpiresAt: Date | null; state: string }>>`SELECT "leaseToken", "leaseExpiresAt", "state" FROM "GmailTriggerCheckpoint" WHERE "workflowVersionId" = ${workflowVersionId} AND "nodeId" = ${nodeId} FOR UPDATE`;
      if (!checkpoints[0] || checkpoints[0].state !== "READY" || checkpoints[0].leaseToken !== leaseToken || !checkpoints[0].leaseExpiresAt || checkpoints[0].leaseExpiresAt <= new Date()) return { execution: null, alreadyDispatched: false };
      const rows = await transaction.$queryRaw<Array<{ executionId: string | null; dispatchedAt: Date | null }>>`SELECT "executionId", "dispatchedAt" FROM "GmailTriggerDelivery" WHERE "workflowVersionId" = ${workflowVersionId} AND "nodeId" = ${nodeId} AND "messageId" = ${messageId} FOR UPDATE`;
      const receipt = rows[0];
      if (!receipt) throw new ConflictException({ code: "GMAIL_DELIVERY_MISSING", message: "Gmail delivery state was not found." });
      if (receipt.dispatchedAt) return { execution: null, alreadyDispatched: true };
      if (receipt.executionId) {
        const existing = await transaction.execution.findUnique({ where: { id: receipt.executionId } });
        if (!existing) throw new NodeFailure("GMAIL_EXECUTION_MISSING", "A previous Gmail execution is unavailable. Review the trigger before resetting its checkpoint.", false);
        return { execution: existing, alreadyDispatched: false };
      }
      const execution = await transaction.execution.create({ data: { workflowVersionId, mode: "LIVE", triggerData: redactValue(triggerData) as Prisma.InputJsonValue, idempotencyKey } });
      await transaction.gmailTriggerDelivery.update({ where: { workflowVersionId_nodeId_messageId: { workflowVersionId, nodeId, messageId } }, data: { executionId: execution.id } });
      return { execution, alreadyDispatched: false };
    });
  }

  async getLiveReadiness(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    if (!workflow.publishedVersion) throw new BadRequestException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish the workflow before checking live readiness." });
    return this.evaluateLiveReadiness(workflow.workspaceId, parseStoredWorkflowGraph(workflow.publishedVersion.graph));
  }

  async get(executionId: string, userId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, workflowVersion: { workflow: { workspace: { members: { some: { userId, role: "OWNER" } } } } } },
      include: { workflowVersion: { include: { workflow: true } }, nodeExecutions: { orderBy: { startedAt: "asc" }, include: { items: { orderBy: { itemIndex: "asc" } } } } },
    });
    if (!execution) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    const graph = parseStoredWorkflowGraph(execution.workflowVersion.graph);
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
      failureAlertOutcome: execution.failureAlertOutcome,
      nodeExecutions: orderedNodes.map((node) => ({
        nodeId: node.nodeId,
        nodeType: nodeType.get(node.nodeId) ?? "unknown",
        status: node.status,
        attempt: node.attempt,
        input: node.input,
        output: node.output,
        items: (node.items ?? []).map((item) => ({
          index: item.itemIndex,
          parentNodeId: item.parentNodeId,
          parentItemIndex: item.parentItemIndex,
          status: item.status,
          attempt: item.attempt,
          input: item.input,
          output: item.output,
          error: item.errorCode ? { code: item.errorCode, message: item.errorMessage, retryable: item.errorRetryable ?? false } : null,
        })),
        error: node.errorCode ? { code: node.errorCode, message: node.errorMessage, retryable: node.errorRetryable ?? isRetryableFailure({ code: node.errorCode }) } : null,
        startedAt: node.startedAt,
        completedAt: node.completedAt,
        durationMs: node.startedAt && node.completedAt ? node.completedAt.getTime() - node.startedAt.getTime() : null,
        failureHandling: node.status === NodeExecutionStatus.FAILED ? failureHandling(graph, node.nodeId, execution.status, execution.nodeExecutions, (node.items ?? []).length > 0) : null,
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
    if (source.mode === "LIVE") await this.assertLiveReady(source.workflowVersion.workflow.workspaceId, parseStoredWorkflowGraph(source.workflowVersion.graph));
    const data = {
      workflowVersionId: source.workflowVersionId,
      mode: source.mode,
      triggerData: source.triggerData ?? Prisma.JsonNull,
      idempotencyRootId: source.idempotencyRootId ?? source.id,
    };
    const execution = source.mode !== "LIVE" ? await this.prisma.execution.create({ data }) : await this.prisma.$transaction(async (tx) => {
      await lockGraphCredentials(tx, source.workflowVersion.workflow.workspaceId, source.workflowVersion.graph);
      return tx.execution.create({ data });
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
    await this.prisma.$transaction(async (transaction) => {
      // Claim the current state inside the same transaction as the remaining
      // cancellation changes. A stale read must not overwrite a completed run.
      const claimed = await transaction.execution.updateMany({ where: { id: executionId, status: { in: [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING, ExecutionStatus.WAITING_APPROVAL] } }, data: { status: ExecutionStatus.CANCELLED, completedAt, leaseExpiresAt: null, runToken: null, resumeToken: null, resumeNodeIds: Prisma.DbNull, resumeQueuedAt: null } });
      if (!claimed.count) throw new BadRequestException({ code: "EXECUTION_NOT_CANCELLABLE", message: "Only queued, running, or waiting executions can be cancelled." });
      await finishInterruptedItems(transaction, executionId, completedAt);
      await transaction.nodeExecution.updateMany({ where: { executionId, status: { in: [NodeExecutionStatus.PENDING, NodeExecutionStatus.RUNNING, NodeExecutionStatus.WAITING] } }, data: { status: NodeExecutionStatus.SKIPPED, completedAt } });
      await transaction.approvalRequest.updateMany({ where: { executionId, status: ApprovalRequestStatus.PENDING }, data: { status: ApprovalRequestStatus.EXPIRED, resolvedAt: completedAt } });
      await transaction.auditLog.create({ data: { workspaceId: execution.workflowVersion.workflow.workspaceId, actorId: userId, action: "execution.cancelled", targetType: "execution", targetId: executionId } });
    });
    this.events.publish(executionId, "execution.cancelled");
    return this.get(executionId, userId);
  }

  async run(executionId: string, mode: RunMode, startNodeIds?: string[], debugNodeId?: string, initialOnly = false, resumeToken?: string) {
    const execution = await this.prisma.execution.findUnique({ include: { workflowVersion: { include: { workflow: true } }, nodeExecutions: true }, where: { id: executionId } });
    if (!execution) throw new NotFoundException({ code: "EXECUTION_NOT_FOUND", message: "Execution was not found." });
    if (execution.status !== ExecutionStatus.QUEUED) return execution;
    // Queue payloads are not authoritative. In particular, an incorrect live
    // job must never execute a run created as mock against real providers.
    // Ignore the mismatched job rather than failing a queued run which may
    // also have a legitimate job waiting to claim it.
    if ((mode !== "mock" && mode !== "live") || execution.mode !== (mode === "mock" ? "MOCK" : "LIVE")) return execution;
    // Only the exact persisted continuation can consume a resumed phase.
    // Legacy initial/continuation jobs may run only when no nonce is pending.
    if ((execution.resumeToken ?? null) !== (resumeToken ?? null) || (resumeToken && (initialOnly || debugNodeId))) return execution;
    // An initial job that arrived late cannot resume an approval or any
    // previously-started execution. The atomic claim below repeats this check.
    if (initialOnly && execution.startedAt !== null) return execution;
    const graph = parseStoredWorkflowGraph(execution.workflowVersion.graph);
    if (resumeToken) {
      const stored = execution.resumeNodeIds;
      if (!Array.isArray(stored) || !stored.length || stored.some((id) => typeof id !== "string" || !graph.nodes.some((node) => node.id === id)) || new Set(stored).size !== stored.length || mode !== (execution.mode === "MOCK" ? "mock" : "live")) throw new NodeFailure("APPROVAL_CONTINUATION_INVALID", "The approval continuation requires review.", false);
      startNodeIds = stored as string[];
    }
    const now = new Date();
    const runToken = randomBytes(24).toString("hex");
    const claimed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: ExecutionStatus.QUEUED, mode: execution.mode, resumeToken: resumeToken ?? null, ...(initialOnly ? { startedAt: null } : {}) },
      data: { status: ExecutionStatus.RUNNING, startedAt: execution.startedAt ?? now, completedAt: null, errorCode: null, errorMessage: null, errorRetryable: null, leaseExpiresAt: leaseExpiry(now), runToken, resumeToken: null, resumeNodeIds: Prisma.DbNull, resumeQueuedAt: null },
    });
    if (!claimed.count) return execution;
    const initialized = await this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ status: ExecutionStatus; runToken: string | null }>>`SELECT status, "runToken" FROM "Execution" WHERE id = ${executionId} FOR UPDATE`;
      if (rows[0]?.status !== ExecutionStatus.RUNNING || rows[0].runToken !== runToken) return false;
      for (const node of graph.nodes) await transaction.nodeExecution.upsert({
        where: { executionId_nodeId: { executionId, nodeId: node.id } },
        create: { executionId, nodeId: node.id, status: NodeExecutionStatus.PENDING },
        update: {},
      });
      return true;
    });
    if (!initialized) return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
    this.events.publish(executionId, "execution.running");

    // Existing queued/approval-continuation jobs can predate publish checks.
    // Fail live jobs before calling any node rather than running earlier writes.
    if (execution.mode === "LIVE" && unavailableWorkflowNodes(graph).length) {
      await this.markUnvisitedSkipped(executionId, runToken, graph, new Set());
      return this.finishRunning(executionId, runToken, { status: ExecutionStatus.FAILED, completedAt: new Date(), leaseExpiresAt: null, errorCode: "NODE_UNAVAILABLE", errorMessage: "This workflow contains unavailable nodes. Remove them and publish a new version.", errorRetryable: false }, "execution.failed");
    }

    // Reject unsupported collection paths before any node can make a write.
    // Item joins and approvals need their own execution semantics.
    {
      try {
        for (const candidate of graph.nodes) {
          const config = candidate.config as Record<string, unknown>;
          if ((!debugNodeId || candidate.id === debugNodeId) && candidate.type.startsWith("action.") && Object.hasOwn(config, "executeOnce") && typeof config.executeOnce !== "boolean") throw new NodeFailure("INVALID_CONFIGURATION", "Run once must be on or off.", false);
          if (!debugNodeId && isCollectionProducer(candidate, config)) assertSupportedItemPath(graph, candidate.id, true);
        }
      } catch (reason) {
        const failure = nodeFailureFromExecutionError(reason);
        await this.markUnvisitedSkipped(executionId, runToken, graph, new Set());
        return this.finishRunning(executionId, runToken, { status: ExecutionStatus.FAILED, completedAt: new Date(), leaseExpiresAt: null, errorCode: failure.code, errorMessage: failure.message, errorRetryable: false }, "execution.failed");
      }
    }

    const context: Record<string, unknown> = { trigger: execution.triggerData ?? {}, steps: {} };
    const outputs = context.steps as Record<string, unknown>;
    const restoredSteps = new Set<string>();
    for (const nodeExecution of execution.nodeExecutions) {
      if (nodeExecution.status === NodeExecutionStatus.SUCCEEDED && nodeExecution.output && typeof nodeExecution.output === "object" && !Array.isArray(nodeExecution.output)) {
        outputs[nodeExecution.nodeId] = { output: nodeExecution.output };
        restoredSteps.add(nodeExecution.nodeId);
      }
    }
    const pending = debugNodeId
      ? graph.nodes.filter((node) => node.id === debugNodeId)
      : (startNodeIds ? graph.nodes.filter((node) => startNodeIds.includes(node.id)) : graph.nodes.filter((node) => node.type.startsWith("trigger.")));
    const visited = new Set(execution.nodeExecutions.filter((node) => node.status !== NodeExecutionStatus.PENDING && node.status !== NodeExecutionStatus.SKIPPED).map((node) => node.nodeId));
    const depths = workflowNodeDepths(graph);
    const itemStreams = new Map<WorkflowEdge, WorkflowItem[]>();

    while (pending.length) {
      if (await this.isCancelled(executionId)) return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
      // Do not begin another node if cancellation or lease maintenance has
      // already ended this execution while the previous node was running.
      if (!await this.renewLease(executionId, runToken)) return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
      pending.sort((left, right) => depths.get(left.id)! - depths.get(right.id)!);
      const node = pending.shift();
      if (!node || visited.has(node.id)) continue;
      visited.add(node.id);
      const incoming = graph.edges.find((edge) => edge.target === node.id && itemStreams.has(edge));
      const inputItems = incoming ? itemStreams.get(incoming) : undefined;
      const routeItemErrors = node.type.startsWith("action.") && graph.edges.some((edge) => edge.source === node.id && edge.kind === "error");
      const itemRun = inputItems ? await this.runItemNode(executionId, execution.workflowVersion.workflow.workspaceId, node, context, inputItems, mode, execution.idempotencyRootId ?? execution.id, runToken, restoredSteps, routeItemErrors) : undefined;
      const result = itemRun?.result ?? await this.runNode(executionId, execution.workflowVersion.workflow.workspaceId, node, context, mode, execution.idempotencyRootId ?? execution.id, runToken, restoredSteps);
      if (result.status === "interrupted") return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
      if (debugNodeId) {
        await this.markUnvisitedSkipped(executionId, runToken, graph, visited);
        const completedAt = new Date();
        if (result.status === "failed") {
          return this.finishRunning(executionId, runToken, { status: ExecutionStatus.FAILED, completedAt, leaseExpiresAt: null, errorCode: result.error?.code ?? "NODE_FAILED", errorMessage: result.error?.message ?? "Workflow node failed.", errorRetryable: result.error?.retryable ?? false }, "execution.failed");
        }
        return this.finishRunning(executionId, runToken, { status: ExecutionStatus.SUCCEEDED, completedAt, leaseExpiresAt: null }, "execution.succeeded");
      }
      if (result.status === "waiting") {
        const pendingNodeIds = [...new Set(pending.filter((item) => !visited.has(item.id)).map((item) => item.id))];
        const approval = await this.prisma.$transaction(async (transaction) => {
          // Use the same execution-first lock order as cancel/resolve. The
          // request and WAITING state must become visible together, or not at all.
          const claimed = await transaction.execution.updateMany({ where: { id: executionId, status: ExecutionStatus.RUNNING, runToken }, data: { status: ExecutionStatus.WAITING_APPROVAL, leaseExpiresAt: null, runToken: null, resumeNodeIds: pendingNodeIds.length ? pendingNodeIds : Prisma.DbNull } });
          if (!claimed.count) return null;
          const created = await transaction.approvalRequest.create({ data: {
            executionId,
            tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
            expiresAt: new Date(Date.now() + approvalExpiryMs(result.output)),
          } });
          const waitingNode = await transaction.nodeExecution.updateMany({
            where: { executionId, nodeId: node.id, status: NodeExecutionStatus.WAITING },
            data: { output: redactValue({ ...result.output, approvalRequestId: created.id, notificationStatus: "pending" }) as Prisma.InputJsonValue },
          });
          if (!waitingNode.count) throw new Error("Approval node is no longer waiting");
          const remaining = graph.nodes.filter((item) => !visited.has(item.id)).map((item) => item.id);
          if (remaining.length) await transaction.nodeExecution.updateMany({ where: { executionId, nodeId: { in: remaining }, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt: new Date() } });
          return created;
        });
        if (!approval) return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
        this.events.publish(executionId, "execution.waiting_approval");
        // Notification is a best-effort side effect after commit. It cannot be
        // made atomic with cancellation or guaranteed exactly once.
        const notificationStatus = await this.notifyApproval(execution.workflowVersion.workflow.workspaceId, approval.id, result.output, mode);
        await this.prisma.nodeExecution.updateMany({
          where: { executionId, nodeId: node.id, status: NodeExecutionStatus.WAITING, execution: { status: ExecutionStatus.WAITING_APPROVAL }, output: { path: ["approvalRequestId"], equals: approval.id } },
          data: { output: redactValue({ ...result.output, approvalRequestId: approval.id, notificationStatus }) as Prisma.InputJsonValue },
        });
        return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
      }
      if (result.status === "failed") {
        // Item failures with an error edge are routed by runItemNode. A failed
        // item run here is a fatal limit/internal failure and must not continue.
        const errorTargets = itemRun ? [] : graph.edges.filter((edge) => edge.source === node.id && edge.kind === "error");
        if (!errorTargets.length) {
          await this.markUnvisitedSkipped(executionId, runToken, graph, visited);
          return this.finishRunning(executionId, runToken, { status: ExecutionStatus.FAILED, completedAt: new Date(), leaseExpiresAt: null, errorCode: result.error?.code ?? "NODE_FAILED", errorMessage: result.error?.message ?? "Workflow node failed.", errorRetryable: result.error?.retryable ?? false }, "execution.failed");
        }
        pending.push(...this.targets(graph, errorTargets));
        continue;
      }
      outputs[node.id] = { output: result.output };
      // Trigger outputs wrap persisted triggerData, so their values can have
      // already been redacted even though the trigger just ran in this phase.
      if (node.type.startsWith("trigger.")) restoredSteps.add(node.id);
      else restoredSteps.delete(node.id);
      let nextEdges = graph.edges.filter((edge) => edge.source === node.id && edgeMatchesResult(edge, result));
      const outputConfig = { ...node.config, ...(typeof result.output.operation === "string" ? { operation: result.output.operation } : {}) };
      if (itemRun || isCollectionProducer(node, outputConfig)) {
        try {
          assertSupportedItemPath(graph, node.id, !itemRun);
          const items = itemRun?.items ?? outputItems(node, outputConfig, result.output).map((item, itemIndex) => ({ ...item, pairedItem: { nodeId: node.id, itemIndex } }));
          if (!items.length) continue;
          if (itemRun?.routedItems) {
            nextEdges = graph.edges.filter((edge) => edge.source === node.id && itemRun.routedItems!.some((entry) => edgeMatchesResult(edge, entry.result)));
            for (const edge of nextEdges) itemStreams.set(edge, itemRun.routedItems.filter((entry) => edgeMatchesResult(edge, entry.result)).map((entry) => entry.item));
          } else {
            for (const edge of nextEdges) itemStreams.set(edge, items);
          }
        } catch (reason) {
          const failure = nodeFailureFromExecutionError(reason);
          const updated = await this.updateNodeWhileRunning(executionId, runToken, node.id, { status: NodeExecutionStatus.FAILED, output: Prisma.DbNull, errorCode: failure.code, errorMessage: failure.message, errorRetryable: false, completedAt: new Date() });
          if (!updated) return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
          this.events.publish(executionId, "node.updated");
          // A malformed or over-limit list failed at the source, before any
          // downstream item was processed. Honor its existing error branch.
          const sourceOutputFailure = !itemRun && ["INVALID_PROVIDER_RESPONSE", "ITEM_LIMIT_EXCEEDED", "ITEM_SIZE_EXCEEDED"].includes(failure.code);
          const errorTargets = sourceOutputFailure ? graph.edges.filter((edge) => edge.source === node.id && edge.kind === "error") : [];
          if (errorTargets.length) {
            delete outputs[node.id];
            pending.push(...this.targets(graph, errorTargets));
            continue;
          }
          await this.markUnvisitedSkipped(executionId, runToken, graph, visited);
          return this.finishRunning(executionId, runToken, { status: ExecutionStatus.FAILED, completedAt: new Date(), leaseExpiresAt: null, errorCode: failure.code, errorMessage: failure.message, errorRetryable: false }, "execution.failed");
        }
      }
      pending.push(...this.targets(graph, nextEdges));
    }

    if (await this.isCancelled(executionId)) return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
    await this.markUnvisitedSkipped(executionId, runToken, graph, visited);
    return this.finishRunning(executionId, runToken, { status: ExecutionStatus.SUCCEEDED, completedAt: new Date(), leaseExpiresAt: null }, "execution.succeeded");
  }

  private async finishRunning(executionId: string, runToken: string, data: Prisma.ExecutionUpdateManyMutationInput, event: "execution.failed" | "execution.succeeded") {
    // A cancellation or lease expiry can win while a provider request is in
    // flight. Never replace that terminal state or publish a false completion.
    const updated = await this.prisma.execution.updateMany({ where: { id: executionId, status: ExecutionStatus.RUNNING, runToken }, data: { ...data, runToken: null } });
    if (updated.count) {
      this.events.publish(executionId, event);
      if (event === "execution.failed") await this.sendFailureAlert(executionId);
    }
    return this.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
  }

  /** Best-effort and at-most-once: claim before sending so an uncertain write
   * is never automatically repeated. A crash after claiming may lose an alert. */
  private async sendFailureAlert(executionId: string) {
    try {
      const execution = await this.prisma.execution.findUnique({ where: { id: executionId }, include: { workflowVersion: { include: { workflow: true } }, nodeExecutions: { where: { status: NodeExecutionStatus.FAILED }, orderBy: { completedAt: "desc" }, take: 1 } } });
      const workflow = execution?.workflowVersion?.workflow;
      if (!execution || execution.mode !== "LIVE" || !workflow?.failureAlertCredentialId || !["google_chat", "telegram"].includes(workflow.failureAlertProvider ?? "")) return;
      const claimed = await this.prisma.execution.updateMany({ where: { id: executionId, status: ExecutionStatus.FAILED, mode: "LIVE", failureAlertClaimedAt: null, workflowVersion: { workflow: { failureAlertProvider: workflow.failureAlertProvider, failureAlertCredentialId: workflow.failureAlertCredentialId, failureAlertChatId: workflow.failureAlertChatId } } }, data: { failureAlertClaimedAt: new Date(), failureAlertOutcome: "UNCONFIRMED" } });
      if (!claimed.count) return;
      const provider = workflow.failureAlertProvider === "google_chat" ? CredentialProvider.GOOGLE_CHAT_WEBHOOK : CredentialProvider.TELEGRAM_BOT;
      const credential = await this.credentials.readForExecution(workflow.failureAlertCredentialId, workflow.workspaceId, provider);
      const code = execution.errorCode && /^[A-Z0-9_]{1,80}$/.test(execution.errorCode) ? execution.errorCode : "WORKFLOW_FAILED";
      const nodeId = execution.nodeExecutions[0]?.nodeId;
      const node = nodeId && /^[A-Za-z0-9_-]{1,100}$/.test(nodeId) ? `\nNode: ${nodeId}` : "";
      const link = new URL(`/editor?workflow=${encodeURIComponent(workflow.id)}&execution=${encodeURIComponent(execution.id)}`, process.env.WEB_ORIGIN ?? "http://localhost:3000").href;
      const message = `Workflow failed: ${workflow.name.slice(0, 120)}\nTime: ${(execution.completedAt ?? new Date()).toISOString()}${node}\nError: ${code}\nInspect: ${link}`;
      const receipt = await defaultNotificationDispatcher.dispatch(workflow.failureAlertProvider === "google_chat" ? { provider: "google_chat", message } : { provider: "telegram", text: message, chatId: workflow.failureAlertChatId ?? undefined }, credential, "live");
      if (receipt.delivered) await this.prisma.execution.updateMany({ where: { id: executionId, failureAlertOutcome: "UNCONFIRMED" }, data: { failureAlertOutcome: "SENT" } });
    } catch {
      // Never log raw provider or credential data, and never fail the execution again.
      console.warn("Workflow failure alert could not be delivered.");
    }
  }

  async resolveApproval(approvalId: string, userId: string, decision: "approved" | "rejected") {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id: approvalId, execution: { workflowVersion: { workflow: { workspace: { members: { some: { userId, role: "OWNER" } } } } } } },
      include: { execution: { include: { workflowVersion: true } } },
    });
    if (!approval) throw new NotFoundException({ code: "APPROVAL_NOT_FOUND", message: "Approval request was not found." });
    if (approval.status !== ApprovalRequestStatus.PENDING) throw new NotFoundException({ code: "APPROVAL_NOT_PENDING", message: "Approval request has already been resolved." });
    const waitingNode = await this.prisma.nodeExecution.findFirst({ where: { executionId: approval.executionId, status: NodeExecutionStatus.WAITING, output: { path: ["approvalRequestId"], equals: approval.id } } });
    if (!waitingNode) throw new NotFoundException({ code: "APPROVAL_NODE_NOT_FOUND", message: "Execution is not waiting on an approval node." });
    const graph = parseStoredWorkflowGraph(approval.execution.workflowVersion.graph);
    const pendingNodeIds = approval.execution.resumeNodeIds;
    if (decision === "approved" && pendingNodeIds != null && (!Array.isArray(pendingNodeIds) || pendingNodeIds.some((id) => typeof id !== "string" || !graph.nodes.some((node) => node.id === id)))) {
      throw new ConflictException({ code: "APPROVAL_CONTINUATION_INVALID", message: "The approval continuation requires review." });
    }
    const pendingIds = Array.isArray(pendingNodeIds) ? pendingNodeIds as string[] : [];
    const nextNodeIds = decision === "approved" ? [...new Set([...pendingIds, ...graph.edges.filter((edge) => edge.source === waitingNode.nodeId && edge.kind === "success").map((edge) => edge.target)])] : [];
    const finalStatus = decision === "rejected" ? ExecutionStatus.FAILED : nextNodeIds.length ? ExecutionStatus.QUEUED : ExecutionStatus.SUCCEEDED;
    const resumeToken = finalStatus === ExecutionStatus.QUEUED ? randomBytes(24).toString("hex") : undefined;
    const expired = await this.prisma.$transaction(async (transaction) => {
      // Lock in the same order as cancellation before sampling the database
      // clock. A decision that waits past the deadline must not be accepted
      // using a timestamp captured before the lock wait.
      const executions = await transaction.$queryRaw<Array<{ status: ExecutionStatus }>>`SELECT status FROM "Execution" WHERE id = ${approval.executionId} FOR UPDATE`;
      if (executions[0]?.status !== ExecutionStatus.WAITING_APPROVAL) throw new ConflictException({ code: "APPROVAL_NOT_WAITING", message: "The execution is no longer waiting for this approval." });
      const nodes = await transaction.$queryRaw<Array<{ status: NodeExecutionStatus; output: Prisma.JsonValue }>>`SELECT status, output FROM "NodeExecution" WHERE id = ${waitingNode.id} AND "executionId" = ${approval.executionId} FOR UPDATE`;
      const output = nodes[0]?.output;
      if (nodes[0]?.status !== NodeExecutionStatus.WAITING || !output || typeof output !== "object" || Array.isArray(output) || output.approvalRequestId !== approval.id) throw new ConflictException({ code: "APPROVAL_NOT_WAITING", message: "The execution is no longer waiting for this approval." });
      const approvals = await transaction.$queryRaw<Array<{ status: ApprovalRequestStatus; expiresAt: Date }>>`SELECT status, "expiresAt" FROM "ApprovalRequest" WHERE id = ${approval.id} AND "executionId" = ${approval.executionId} FOR UPDATE`;
      const clock = await transaction.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const resolvedAt = clock[0]?.now;
      const lockedApproval = approvals[0];
      if (!resolvedAt || !lockedApproval || lockedApproval.status !== ApprovalRequestStatus.PENDING) throw new ConflictException({ code: "APPROVAL_NOT_PENDING", message: "Approval has expired or was already resolved." });
      if (lockedApproval.expiresAt <= resolvedAt) {
        // Commit expiry and terminal execution state together; throwing inside
        // the transaction would leave an expired approval waiting forever.
        await markApprovalExpired(transaction, approval.executionId, waitingNode.id, approval.id, resolvedAt);
        return true;
      }
      const claimed = await transaction.execution.updateMany({ where: { id: approval.executionId, status: ExecutionStatus.WAITING_APPROVAL }, data: { status: finalStatus, completedAt: finalStatus === ExecutionStatus.QUEUED ? null : resolvedAt, leaseExpiresAt: null, errorCode: decision === "rejected" ? "APPROVAL_REJECTED" : null, errorMessage: decision === "rejected" ? "Approval was rejected." : null, errorRetryable: decision === "rejected" ? false : null, resumeToken: resumeToken ?? null, resumeNodeIds: resumeToken ? nextNodeIds : Prisma.DbNull, resumeQueuedAt: resumeToken ? resolvedAt : null } });
      if (!claimed.count) throw new ConflictException({ code: "APPROVAL_NOT_WAITING", message: "The execution is no longer waiting for this approval." });
      const node = await transaction.nodeExecution.updateMany({ where: { id: waitingNode.id, executionId: approval.executionId, status: NodeExecutionStatus.WAITING }, data: { status: decision === "rejected" ? NodeExecutionStatus.FAILED : NodeExecutionStatus.SUCCEEDED, completedAt: resolvedAt, ...(decision === "rejected" ? { errorCode: "APPROVAL_REJECTED", errorMessage: "Approval was rejected.", errorRetryable: false } : {}) } });
      if (!node.count) throw new ConflictException({ code: "APPROVAL_NOT_WAITING", message: "The execution is no longer waiting for this approval." });
      const resolved = await transaction.approvalRequest.updateMany({ where: { id: approval.id, executionId: approval.executionId, status: ApprovalRequestStatus.PENDING, expiresAt: { gt: resolvedAt } }, data: { status: decision === "rejected" ? ApprovalRequestStatus.REJECTED : ApprovalRequestStatus.APPROVED, resolvedAt } });
      if (!resolved.count) throw new ConflictException({ code: "APPROVAL_NOT_PENDING", message: "Approval has expired or was already resolved." });
      return false;
    });
    if (expired) {
      this.events.publish(approval.executionId, "execution.failed");
      await this.sendFailureAlert(approval.executionId);
      throw new NotFoundException({ code: "APPROVAL_EXPIRED", message: "Approval request has expired." });
    }
    this.events.publish(approval.executionId, finalStatus === ExecutionStatus.FAILED ? "execution.failed" : finalStatus === ExecutionStatus.SUCCEEDED ? "execution.succeeded" : "execution.queued");
    if (finalStatus === ExecutionStatus.FAILED) await this.sendFailureAlert(approval.executionId);
    return { executionId: approval.executionId, resumed: nextNodeIds.length > 0, startNodeIds: nextNodeIds, mode: approval.execution.mode === "MOCK" ? "mock" as const : "live" as const, ...(resumeToken ? { resumeToken } : {}) };
  }

  async failFromMaintenance(executionId: string, code: string, message: string, expiredBefore = new Date()) {
    const completedAt = new Date();
    const failed = await this.prisma.$transaction(async (transaction) => {
      // Lock and update the execution first, matching the order used by node
      // completion and cancellation. A failed node update rolls back the
      // execution transition so a later maintenance scan can retry it.
      const claimed = await transaction.execution.updateMany({
        where: { id: executionId, status: ExecutionStatus.RUNNING, leaseExpiresAt: { lte: expiredBefore } },
        data: { status: ExecutionStatus.FAILED, completedAt, leaseExpiresAt: null, runToken: null, errorCode: code, errorMessage: message, errorRetryable: false, recoveryCount: { increment: 1 } },
      });
      if (!claimed.count) return false;
      await finishInterruptedItems(transaction, executionId, completedAt);
      await transaction.nodeExecution.updateMany({ where: { executionId, status: NodeExecutionStatus.RUNNING }, data: { status: NodeExecutionStatus.FAILED, completedAt, errorCode: code, errorMessage: message, errorRetryable: false } });
      await transaction.nodeExecution.updateMany({ where: { executionId, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt } });
      return true;
    });
    if (!failed) return false;
    this.events.publish(executionId, "execution.failed");
    await this.sendFailureAlert(executionId);
    return true;
  }

  /** Expire a waiting approval without racing an owner's decision or cancellation. */
  async expireApprovalFromMaintenance(approvalId: string, executionId: string) {
    const expired = await this.prisma.$transaction(async (transaction) => {
      const executions = await transaction.$queryRaw<Array<{ status: ExecutionStatus }>>`SELECT status FROM "Execution" WHERE id = ${executionId} FOR UPDATE`;
      if (executions[0]?.status !== ExecutionStatus.WAITING_APPROVAL) return false;
      // ApprovalRequest has no nodeId. Refuse to guess if old or inconsistent
      // data contains more than one waiting node or pending approval.
      const waiting = await transaction.nodeExecution.findMany({ where: { executionId, status: NodeExecutionStatus.WAITING }, select: { id: true }, take: 2 });
      const pending = await transaction.approvalRequest.findMany({ where: { executionId, status: ApprovalRequestStatus.PENDING }, select: { id: true }, take: 2 });
      if (waiting.length !== 1 || pending.length !== 1 || pending[0]?.id !== approvalId) return false;
      const nodes = await transaction.$queryRaw<Array<{ status: NodeExecutionStatus; output: Prisma.JsonValue }>>`SELECT status, output FROM "NodeExecution" WHERE id = ${waiting[0]!.id} AND "executionId" = ${executionId} FOR UPDATE`;
      if (nodes[0]?.status !== NodeExecutionStatus.WAITING) return false;
      const output = nodes[0].output;
      if (!output || typeof output !== "object" || Array.isArray(output) || output.approvalRequestId !== approvalId) return false;
      const approvals = await transaction.$queryRaw<Array<{ status: ApprovalRequestStatus; expiresAt: Date }>>`SELECT status, "expiresAt" FROM "ApprovalRequest" WHERE id = ${approvalId} AND "executionId" = ${executionId} FOR UPDATE`;
      const clock = await transaction.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      const resolvedAt = clock[0]?.now;
      if (!resolvedAt || approvals[0]?.status !== ApprovalRequestStatus.PENDING || approvals[0].expiresAt > resolvedAt) return false;
      await markApprovalExpired(transaction, executionId, waiting[0]!.id, approvalId, resolvedAt);
      return true;
    });
    if (expired) { this.events.publish(executionId, "execution.failed"); await this.sendFailureAlert(executionId); }
    return expired;
  }

  /** A late initial job must never fail a later approval continuation. */
  async failUnstartedFromWorker(executionId: string) {
    const completedAt = new Date();
    const failed = await this.prisma.execution.updateMany({
      where: { id: executionId, status: ExecutionStatus.QUEUED, startedAt: null },
      data: { status: ExecutionStatus.FAILED, completedAt, leaseExpiresAt: null, errorCode: "WORKER_EXECUTION_ERROR", errorMessage: "Execution worker stopped before starting.", errorRetryable: false },
    });
    if (failed.count) { this.events.publish(executionId, "execution.failed"); await this.sendFailureAlert(executionId); }
    // If the execution had already started, lease maintenance owns failure
    // handling; this job cannot prove it owns the current execution phase.
  }

  /** A stale continuation job cannot fail a later phase or another worker. */
  async failUnstartedResumeFromWorker(executionId: string, resumeToken: string) {
    const completedAt = new Date();
    const failed = await this.prisma.execution.updateMany({ where: { id: executionId, status: ExecutionStatus.QUEUED, resumeToken }, data: { status: ExecutionStatus.FAILED, completedAt, errorCode: "APPROVAL_CONTINUATION_INVALID", errorMessage: "The approval continuation could not start.", errorRetryable: false, resumeToken: null, resumeNodeIds: Prisma.DbNull, resumeQueuedAt: null } });
    if (failed.count) { this.events.publish(executionId, "execution.failed"); await this.sendFailureAlert(executionId); }
  }

  private async runItemNode(executionId: string, workspaceId: string, node: WorkflowNode, context: Record<string, unknown>, inputs: WorkflowItem[], mode: RunMode, idempotencyRootId: string, runToken: string, restoredSteps: ReadonlySet<string>, routeItemErrors = false): Promise<{ result: NodeResult; items: WorkflowItem[]; routedItems?: Array<{ item: WorkflowItem; result: NodeResult }> }> {
    const interrupted = () => ({ result: { status: "interrupted" as const, output: {} }, items: [] });
    const rawConfig = node.config as Record<string, unknown>;
    const selectedInputs = rawConfig.executeOnce === true ? inputs.slice(0, 1) : inputs;
    const nodeExecutionId = await this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ status: ExecutionStatus; runToken: string | null }>>`SELECT status, "runToken" FROM "Execution" WHERE id = ${executionId} FOR UPDATE`;
      if (rows[0]?.status !== ExecutionStatus.RUNNING || rows[0].runToken !== runToken) return null;
      const record = await transaction.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId, nodeId: node.id } }, select: { id: true } });
      await transaction.nodeExecution.update({ where: { id: record.id }, data: { status: NodeExecutionStatus.RUNNING, attempt: 1, input: redactValue({ items: selectedInputs.map((item) => item.json) }) as Prisma.InputJsonValue, startedAt: new Date(), completedAt: null } });
      await transaction.nodeExecutionItem.createMany({ data: selectedInputs.map((item, itemIndex) => ({ nodeExecutionId: record.id, itemIndex, parentNodeId: item.pairedItem?.nodeId ?? null, parentItemIndex: item.pairedItem?.itemIndex ?? null, input: redactValue({ item: item.json }) as Prisma.InputJsonValue })) });
      return record.id;
    });
    if (!nodeExecutionId) return interrupted();
    this.events.publish(executionId, "node.updated");
    const items: WorkflowItem[] = [];
    const errors: WorkflowItem[] = [];
    const conditional = node.type === "condition.if" || node.type === "condition.switch";
    const routedItems: Array<{ item: WorkflowItem; result: NodeResult }> = [];
    let firstHandledFailure: NodeFailure | undefined;
    let highestAttempt = 0;
    const retries = readRetries(rawConfig);
    for (let itemIndex = 0; itemIndex < selectedInputs.length; itemIndex++) {
      if (await this.isCancelled(executionId) || !await this.renewLease(executionId, runToken)) return interrupted();
      const current = selectedInputs[itemIndex]!;
      const itemContext = { ...context, $json: current.json };
      let completed = false;
      for (let attempt = 1; attempt <= retries; attempt++) {
        highestAttempt = Math.max(highestAttempt, attempt);
        if (!await this.updateItemWhileRunning(executionId, runToken, nodeExecutionId, itemIndex, { status: NodeExecutionStatus.RUNNING, attempt, startedAt: new Date(), completedAt: null, errorCode: null, errorMessage: null, errorRetryable: null })) return interrupted();
        try {
          const schemaValue = rawConfig.outputSchema;
          const literalSchema = (node.type === "action.openai" || node.type === "action.gemini") && schemaValue !== null && typeof schemaValue === "object" && !Array.isArray(schemaValue);
          const config = resolveExpressions(literalSchema ? { ...rawConfig, outputSchema: undefined } : rawConfig, itemContext, { restoredSteps, persistedTrigger: true }) as Record<string, unknown>;
          if (literalSchema) config.outputSchema = schemaValue;
          if (!await this.updateItemWhileRunning(executionId, runToken, nodeExecutionId, itemIndex, { input: redactValue({ item: current.json, config }) as Prisma.InputJsonValue })) return interrupted();
          // A retried workflow can read a changed list. Include both the item
          // and resolved configuration so a different row at the same index
          // cannot be mistaken for a previously executed Calendar write.
          const itemRootId = createHash("sha256").update(idempotencyRootId).update("\0").update(node.id).update("\0").update(String(itemIndex)).update("\0").update(JSON.stringify({ item: current.json, config })).digest("hex");
          const result = await executeNode(node, config, itemContext, mode, workspaceId, this.credentials, itemRootId);
          if (result.status !== "succeeded") throw new NodeFailure("ITEM_FLOW_UNSUPPORTED", "This node cannot wait or change execution state while processing items.", false);
          const next = conditional ? [{ json: current.json, pairedItem: { nodeId: node.id, itemIndex } }] : outputItems(node, config, result.output, { nodeId: node.id, itemIndex });
          if (items.length + errors.length + next.length > maximumOutputItems) throw new NodeFailure("ITEM_LIMIT_EXCEEDED", `A node can return at most ${maximumOutputItems} items.`, false);
          if (Buffer.byteLength(JSON.stringify([...items, ...errors, ...next]), "utf8") > 1_000_000) throw new NodeFailure("ITEM_SIZE_EXCEEDED", "Item output exceeds the 1 MB limit. An action may have completed; inspect the provider before retrying.", false);
          if (!await this.updateItemWhileRunning(executionId, runToken, nodeExecutionId, itemIndex, { status: NodeExecutionStatus.SUCCEEDED, output: redactValue(result.output) as Prisma.InputJsonValue, completedAt: new Date() })) return interrupted();
          items.push(...next);
          if (conditional || routeItemErrors) for (const item of next) routedItems.push({ item, result: conditional ? result : { ...result, route: "success" } });
          completed = true;
          this.events.publish(executionId, "node.updated");
          break;
        } catch (reason) {
          const failure = nodeFailureFromExecutionError(reason);
          const retryable = isRetryableFailure(failure);
          if (!await this.updateItemWhileRunning(executionId, runToken, nodeExecutionId, itemIndex, { status: NodeExecutionStatus.FAILED, errorCode: failure.code, errorMessage: failure.message, errorRetryable: retryable, completedAt: new Date() })) return interrupted();
          this.events.publish(executionId, "node.updated");
          if (!retryable || attempt >= retries) {
            let terminalFailure = failure;
            const clientError = reason instanceof HttpException && reason.getStatus() >= 400 && reason.getStatus() < 500;
            const routable = routeItemErrors && !conditional && (reason instanceof NodeFailure || clientError) && !["ITEM_LIMIT_EXCEEDED", "ITEM_SIZE_EXCEEDED", "ITEM_FLOW_UNSUPPORTED"].includes(failure.code);
            if (routable) {
              const uncertain = ["DELIVERY_UNCERTAIN", "WRITE_UNCERTAIN", "GMAIL_WRITE_UNCERTAIN", "SMTP_PARTIAL_REJECTION", "CALENDAR_UPDATE_OUTCOME_UNKNOWN", "CALENDAR_DELETE_OUTCOME_UNKNOWN"].includes(failure.code);
              const item: WorkflowItem = { json: { ...current.json, error: { code: uncertain ? "OUTCOME_UNKNOWN" : "ITEM_FAILED", message: uncertain ? "The provider may have applied this request. Check it before retrying." : "This item failed. See execution details.", retryable } }, pairedItem: { nodeId: node.id, itemIndex } };
              const tooMany = items.length + errors.length + 1 > maximumOutputItems;
              const withinLimit = !tooMany && Buffer.byteLength(JSON.stringify([...items, ...errors, item]), "utf8") <= 1_000_000;
              if (withinLimit) {
                if (!await this.updateItemWhileRunning(executionId, runToken, nodeExecutionId, itemIndex, { output: redactValue(item.json) as Prisma.InputJsonValue })) return interrupted();
                errors.push(item);
                routedItems.push({ item, result: { status: "succeeded", output: {}, route: "error" } });
                firstHandledFailure ??= failure;
                completed = true;
                break;
              }
              terminalFailure = new NodeFailure(tooMany ? "ITEM_LIMIT_EXCEEDED" : "ITEM_SIZE_EXCEEDED", "Item output exceeds its count or size limit. An action may have completed; inspect the provider before retrying.", false);
            }
            await this.skipPendingItems(executionId, runToken, nodeExecutionId);
            if (!await this.updateNodeWhileRunning(executionId, runToken, node.id, { status: NodeExecutionStatus.FAILED, attempt: highestAttempt, errorCode: terminalFailure.code, errorMessage: terminalFailure.message, errorRetryable: isRetryableFailure(terminalFailure), completedAt: new Date() })) return interrupted();
            return { result: { status: "failed", output: {}, error: terminalFailure }, items: [] };
          }
          await delay(retryDelayMs(attempt, failure.retryAfterMs));
          if (!await this.renewLease(executionId, runToken)) return interrupted();
        }
      }
      if (!completed) return interrupted();
    }
    const output = { items: items.map((item) => item.json), count: items.length, ...(routeItemErrors ? { errorItems: errors.map((item) => item.json), errorCount: errors.length } : {}) };
    const nodeStatus = firstHandledFailure ? NodeExecutionStatus.FAILED : NodeExecutionStatus.SUCCEEDED;
    if (!await this.updateNodeWhileRunning(executionId, runToken, node.id, { status: nodeStatus, attempt: highestAttempt, output: redactValue(output) as Prisma.InputJsonValue, ...(firstHandledFailure ? { errorCode: firstHandledFailure.code, errorMessage: firstHandledFailure.message, errorRetryable: isRetryableFailure(firstHandledFailure) } : {}), completedAt: new Date() })) return interrupted();
    this.events.publish(executionId, "node.updated");
    return { result: { status: "succeeded", output, route: "success" }, items: [...items, ...errors], ...(conditional || routeItemErrors ? { routedItems } : {}) };
  }

  private async updateItemWhileRunning(executionId: string, runToken: string, nodeExecutionId: string, itemIndex: number, data: Prisma.NodeExecutionItemUpdateInput) {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ status: ExecutionStatus; runToken: string | null }>>`SELECT status, "runToken" FROM "Execution" WHERE id = ${executionId} FOR UPDATE`;
      if (rows[0]?.status !== ExecutionStatus.RUNNING || rows[0].runToken !== runToken) return false;
      await transaction.nodeExecutionItem.update({ where: { nodeExecutionId_itemIndex: { nodeExecutionId, itemIndex } }, data });
      return true;
    });
  }

  private async skipPendingItems(executionId: string, runToken: string, nodeExecutionId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ status: ExecutionStatus; runToken: string | null }>>`SELECT status, "runToken" FROM "Execution" WHERE id = ${executionId} FOR UPDATE`;
      if (rows[0]?.status !== ExecutionStatus.RUNNING || rows[0].runToken !== runToken) return false;
      await transaction.nodeExecutionItem.updateMany({ where: { nodeExecutionId, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt: new Date() } });
      return true;
    });
  }

  private async runNode(executionId: string, workspaceId: string, node: WorkflowNode, context: Record<string, unknown>, mode: RunMode, idempotencyRootId: string, runToken: string, restoredSteps: ReadonlySet<string>): Promise<NodeResult> {
    const rawConfig = node.config as Record<string, unknown>;
    const retries = readRetries(rawConfig);
    let attempt = 0;
    while (attempt < retries) {
      attempt += 1;
      const startedAt = new Date();
      const started = await this.updateNodeWhileRunning(executionId, runToken, node.id, { status: NodeExecutionStatus.RUNNING, attempt, input: redactValue({ config: rawConfig, trigger: context.trigger }) as Prisma.InputJsonValue, startedAt, completedAt: null, errorCode: null, errorMessage: null, errorRetryable: null });
      if (!started) return { status: "interrupted", output: {} };
      this.events.publish(executionId, "node.updated");
      try {
        // Schema objects are literal contracts; template-like examples inside a
        // field description must not be interpreted as workflow expressions.
        // A whole-schema expression remains supported and fails closed if absent.
        const schemaValue = rawConfig.outputSchema;
        const literalSchema = (node.type === "action.openai" || node.type === "action.gemini") && schemaValue !== null && typeof schemaValue === "object" && !Array.isArray(schemaValue);
        const config = resolveExpressions(literalSchema ? { ...rawConfig, outputSchema: undefined } : rawConfig, context, { restoredSteps, persistedTrigger: true }) as Record<string, unknown>;
        if (literalSchema) config.outputSchema = schemaValue;
        const input = { config, trigger: context.trigger };
        if (!await this.updateNodeWhileRunning(executionId, runToken, node.id, { input: redactValue(input) as Prisma.InputJsonValue })) return { status: "interrupted", output: {} };
        const result = await executeNode(node, config, context, mode, workspaceId, this.credentials, idempotencyRootId);
        if (!await this.updateNodeWhileRunning(executionId, runToken, node.id, { status: result.status === "waiting" ? NodeExecutionStatus.WAITING : NodeExecutionStatus.SUCCEEDED, output: redactValue(result.output) as Prisma.InputJsonValue, completedAt: new Date() })) return { status: "interrupted", output: {} };
        this.events.publish(executionId, "node.updated");
        return result;
      } catch (reason) {
        const failure = nodeFailureFromExecutionError(reason);
        const retryable = isRetryableFailure(failure);
        if (!await this.updateNodeWhileRunning(executionId, runToken, node.id, { status: NodeExecutionStatus.FAILED, errorCode: failure.code, errorMessage: failure.message, errorRetryable: retryable, completedAt: new Date() })) return { status: "interrupted", output: {} };
        this.events.publish(executionId, "node.updated");
        if (!retryable || attempt >= retries) return { status: "failed", output: {}, error: failure };
        await delay(retryDelayMs(attempt, failure.retryAfterMs));
        // A retry is another provider call, not merely a continuation of the
        // first attempt. Stop if cancellation or lease maintenance won.
        if (!await this.renewLease(executionId, runToken)) return { status: "interrupted", output: {} };
      }
    }
    return { status: "failed", output: {}, error: new NodeFailure("RETRY_EXHAUSTED", "Retry attempts were exhausted.", false) };
  }

  private async updateNodeWhileRunning(executionId: string, runToken: string, nodeId: string, data: Prisma.NodeExecutionUpdateInput) {
    return this.prisma.$transaction(async (transaction) => {
      // Serialize with cancellation, lease expiry and approval resolution using
      // the same execution-first lock order. Do not keep a DB lock while
      // performing provider I/O.
      const rows = await transaction.$queryRaw<Array<{ status: ExecutionStatus; runToken: string | null }>>`SELECT status, "runToken" FROM "Execution" WHERE id = ${executionId} FOR UPDATE`;
      if (rows[0]?.status !== ExecutionStatus.RUNNING || rows[0].runToken !== runToken) return false;
      await transaction.nodeExecution.update({ where: { executionId_nodeId: { executionId, nodeId } }, data });
      return true;
    });
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

  private async markUnvisitedSkipped(executionId: string, runToken: string, graph: WorkflowGraph, visited: Set<string>) {
    const remaining = graph.nodes.filter((node) => !visited.has(node.id)).map((node) => node.id);
    if (!remaining.length) return;
    await this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ status: ExecutionStatus; runToken: string | null }>>`SELECT status, "runToken" FROM "Execution" WHERE id = ${executionId} FOR UPDATE`;
      if (rows[0]?.status !== ExecutionStatus.RUNNING || rows[0].runToken !== runToken) return;
      await transaction.nodeExecution.updateMany({ where: { executionId, nodeId: { in: remaining }, status: NodeExecutionStatus.PENDING }, data: { status: NodeExecutionStatus.SKIPPED, completedAt: new Date() } });
    });
  }

  private async isCancelled(executionId: string) {
    const execution = await this.prisma.execution.findUnique({ where: { id: executionId }, select: { status: true } });
    return execution?.status === ExecutionStatus.CANCELLED;
  }

  private async renewLease(executionId: string, runToken: string) {
    const renewed = await this.prisma.execution.updateMany({ where: { id: executionId, status: ExecutionStatus.RUNNING, runToken }, data: { leaseExpiresAt: leaseExpiry(new Date()) } });
    return renewed.count === 1;
  }

  private async assertLiveReady(workspaceId: string, graph: WorkflowGraph) {
    const readiness = await this.evaluateLiveReadiness(workspaceId, graph);
    if (readiness.ready) return;
    if (readiness.unavailableNodes.length) throw new BadRequestException({ code: "NODE_UNAVAILABLE", message: "Remove unavailable nodes and publish a new version before running live.", details: readiness.unavailableNodes });
    throw new BadRequestException({
      code: "LIVE_CREDENTIAL_REQUIRED",
      message: "Select valid credentials for every live integration node before going live.",
      details: readiness.requirements.filter((requirement) => !requirement.ready).map((requirement) => ({ nodeId: requirement.nodeId, provider: requirement.provider })),
    });
  }

  private async evaluateLiveReadiness(workspaceId: string, graph: WorkflowGraph) {
    const unavailableNodes = unavailableWorkflowNodes(graph);
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
    return { ready: unavailableNodes.length === 0 && checked.every((requirement) => requirement.ready), requirements: checked, unavailableNodes };
  }
}

function failureHandling(graph: WorkflowGraph, nodeId: string, status: ExecutionStatus, nodes: Array<{ nodeId: string; status: NodeExecutionStatus }>, hasItems: boolean) {
  const targets = graph.edges.filter((edge) => edge.source === nodeId && edge.kind === "error").map((edge) => edge.target);
  // A fatal item limit or infrastructure error stops the run even if an error
  // edge is connected. Do not claim it was routed when every target was skipped.
  if (hasItems && status === ExecutionStatus.FAILED && targets.length && targets.every((id) => nodes.some((node) => node.nodeId === id && node.status === NodeExecutionStatus.SKIPPED))) return { kind: "execution_failed" as const, targetNodeIds: [] };
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

function assertSupabaseWriteExpressions(node: WorkflowNode, context: Record<string, unknown>) {
  // A missing embedded value must not silently become an empty string in a
  // new write action. Existing node expression semantics remain unchanged.
  if (node.type === "action.supabase.insert-row") resolveExpressions(node.config.fields, context, { rejectMissing: true });
}

function assertGitHubSafetyExpressions(node: WorkflowNode, config: Record<string, unknown>, context: Record<string, unknown>) {
  // An expression-backed safety guard must not silently disappear when an
  // upstream value is missing, null, or interpolates to an empty string.
  const guardedFields = node.type === "action.github.merge-pull-request" ? ["expectedHeadSha", "mergeMethod"] : node.type === "action.github" ? ["idempotencyKey"] : [];
  if (guardedFields.some((key) => {
    const raw = node.config[key];
    if (typeof raw !== "string") return false;
    const expressions = [...raw.matchAll(/{{\s*([^{}]+?)\s*}}/g)];
    if (!expressions.length) return false;
    if (typeof config[key] !== "string" || !(config[key] as string).trim()) return true;
    return expressions.some(([expression]) => {
      const value = resolveExpressions(expression, context);
      return value === undefined || value === null || (typeof value === "string" && !value.trim());
    });
  })) {
    throw new NodeFailure("INVALID_CONFIGURATION", "A GitHub safety setting could not be resolved; review its expression before running.", false);
  }
}

export async function executeNode(node: WorkflowNode, config: Record<string, unknown>, context: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService, executionId: string): Promise<NodeResult> {
  if (!isExecutableWorkflowNodeType(node.type)) throw new NodeFailure("NODE_UNAVAILABLE", `${node.type} is not available in this MVP execution engine.`, false);
  // Execution can also be called outside the graph parser; reject unavailable nodes.
  const connectorExecutor = getConnectorExecutor(node.type);
  assertSupabaseWriteExpressions(node, context);
  assertGitHubSafetyExpressions(node, config, context);
  if (connectorExecutor) {
    if (Object.hasOwn(config, "executeOnce") && typeof config.executeOnce !== "boolean") throw new NodeFailure("INVALID_CONFIGURATION", "Run once must be on or off.", false);
    // This setting belongs to the runner, not the provider's configuration.
    const connectorConfig = { ...config };
    delete connectorConfig.executeOnce;
    return connectorExecutor({ config: connectorConfig, mode, workspaceId, credentials, executionId, nodeId: node.id });
  }
  const issue = nodeConfigIssues(node.type, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  if (node.type === "trigger.gmail" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "gmail", message: { id: "example-message", from: "sender@example.test", to: "owner@example.test", subject: "Example message", text: "Synthetic test message", labels: ["INBOX"] } } }, route: "success" };
  if (node.type === "trigger.google-calendar.event" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "google-calendar", event: config.event, item: { id: "example-event", summary: "Example meeting", start: "2026-11-10T10:00:00Z", end: "2026-11-10T11:00:00Z", status: "confirmed" } } }, route: "success" };
  if (node.type === "trigger.steam.game-news" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "steam", item: { id: "example-news", title: "Example game update", link: "https://store.steampowered.com/news/", publishedAt: "", summary: "Synthetic game news" } } }, route: "success" };
  if (node.type === "trigger.rss.new-item" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "rss", item: { id: "example-item", title: "Example item", link: "https://example.test/item", publishedAt: "", summary: "Synthetic feed item" } } }, route: "success" };
  if (node.type === "trigger.telegram.update" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "telegram", event: "message", updateId: 1, message: { chatId: "123456", messageId: 1, senderId: "123456", threadId: null, text: "Example message" } } }, route: "success" };
  if (node.type === "trigger.slack.event" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "slack", event: config.event, eventId: "EVEXAMPLE", teamId: "TEXAMPLE", channel: config.channel || "CEXAMPLE", user: "UEXAMPLE", text: "Example Slack event", timestamp: "1794213000.000001", threadTimestamp: null } }, route: "success" };
  if (node.type === "trigger.vercel.deployment" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "vercel", event: config.event || "deployment.created", eventId: "evt_example", projectId: "prj_example", deploymentId: "dpl_example", teamId: null } }, route: "success" };
  if (node.type === "trigger.trello.board-action" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "trello", event: config.action === "all" ? "createCard" : config.action, actionId: "5d5ea62fd76aa1136000000c", boardId: config.boardId || "4d5ea62fd76aa1136000000c", cardId: "6d5ea62fd76aa1136000000c", listId: null, cardName: "Sample card", text: null } }, route: "success" };
  if (node.type === "trigger.sentry.issue-created" && mode === "mock" && (!context.trigger || typeof context.trigger !== "object" || Object.keys(context.trigger).length === 0)) return { status: "succeeded", output: { received: { source: "sentry", event: "issue.created", installationId: config.installationId, project: config.project, issueId: "12345", title: "Example issue", level: "error" } }, route: "success" };
  if (node.type.startsWith("trigger.")) return { status: "succeeded", output: { received: context.trigger ?? {} }, route: "success" };
  if (node.type === "action.edit-fields") {
    const fields = config.fields as Array<{ name: string; type: "text" | "number" | "boolean"; value: string | number | boolean }>;
    const output = Object.fromEntries(fields.map((field) => [field.name, field.type === "number" ? Number(field.value) : field.type === "boolean" ? field.value === true || field.value === "true" : field.value]));
    return { status: "succeeded", output, route: "success" };
  }
  if (node.type === "condition.if") {
    const operator = readChoice(node, config, context, "operator", ["equals", "not_equals", "contains", "exists"], "equals");
    const matches = compare(config.left, operator, config.right);
    return { status: "succeeded", output: { matches }, route: matches ? "true" : "false" };
  }
  if (node.type === "condition.switch") {
    const value = switchCaseValue(config.value);
    const cases = Array.isArray(config.cases) ? config.cases : [];
    const matched = cases.find((item) => item && typeof item === "object" && switchCaseValue((item as Record<string, unknown>).value) === value) as Record<string, unknown> | undefined;
    return { status: "succeeded", output: { value, matched: matched ? switchCaseValue(matched.value) : null }, route: matched ? "case" : "default" };
  }
  if (node.type === "approval.request") {
    const notificationProvider = readChoice(node, config, context, "notificationProvider", ["google_chat", "http_webhook"], "google_chat");
    return { status: "waiting", output: { message: String(config.message ?? "Approval requested"), expiresInHours: typeof config.expiresInHours === "number" ? config.expiresInHours : 24, notificationProvider, notificationCredentialId: typeof config.notificationCredentialId === "string" ? config.notificationCredentialId : "" } };
  }

  throw new NodeFailure("NODE_UNAVAILABLE", `${node.type} is not available in this MVP execution engine.`, false);
}

function readChoice(node: WorkflowNode, config: Record<string, unknown>, context: Record<string, unknown>, key: string, choices: readonly string[], fallback: string) {
  const value = config[key];
  const raw = node.config[key];
  const isExpression = typeof raw === "string" && /{{\s*[^{}]+?\s*}}/.test(raw);
  if (value === undefined || value === null || value === "") {
    if (isExpression) throw new NodeFailure("INVALID_CONFIGURATION", `The ${key} expression did not resolve to a supported choice.`, false);
    return fallback;
  }
  if (isExpression) resolveExpressions(raw, context, { rejectMissing: true });
  if (typeof value !== "string" || !choices.includes(value)) throw new NodeFailure("INVALID_CONFIGURATION", `Choose a supported ${key}.`, false);
  return value;
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

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
