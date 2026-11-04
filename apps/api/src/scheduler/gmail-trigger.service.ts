import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ApprovalRequestStatus, CredentialProvider, ExecutionStatus, NodeExecutionStatus, WorkflowVersionStatus } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import type { WorkflowGraph } from "@workflow/contracts";
import { CredentialService } from "../credentials/credential.service";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";
import { getGmailHistoryBaseline, getGmailHistoryPage } from "../execution/gmail-history";
import { getGmailMessage } from "../execution/gmail-read";
import { NodeFailure } from "../execution/node-failure";
import { parseStoredWorkflowGraph } from "../workflows/workflow-graph";
import { BackgroundWork } from "../platform/background-work";

const leaseMs = 5 * 60_000;
export type GmailBaseline = { nodeId: string; historyId: string; mailboxHash: string };
type GmailCheckpointUpdate = { historyId: string; pageToken: string | null; nextPollAt: Date; lastErrorCode: null } | { state: "READY" | "ERROR"; lastErrorCode: string };

@Injectable()
export class GmailTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GmailTriggerService.name);
  private timer: NodeJS.Timeout | null = null;
  private recoveryCursor = "";
  private readonly background = new BackgroundWork();
  protected readonly provider = { getGmailHistoryBaseline, getGmailHistoryPage, getGmailMessage };
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CredentialService) private readonly credentials: CredentialService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
  ) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    const scan = () => this.background.start(() => this.tick(), () => this.logger.error("Gmail trigger scheduler failed."));
    scan();
    this.timer = setInterval(scan, 60_000);
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.background.drain(); }

  async baseline(workspaceId: string, graph: WorkflowGraph): Promise<GmailBaseline[]> {
    const nodes = graph.nodes.filter((node) => node.type === "trigger.gmail");
    const baselines: GmailBaseline[] = [];
    for (const node of nodes) {
      if ((typeof node.config.sender === "string" && node.config.sender.trim().length > 320) || (typeof node.config.subject === "string" && node.config.subject.trim().length > 500)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Gmail sender or subject filter is too long." });
      if (typeof node.config.labelId === "string" && node.config.labelId && !/^[A-Za-z0-9_-]{1,128}$/.test(node.config.labelId)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Select a valid Gmail label." });
      const credentialId = typeof node.config.credentialId === "string" ? node.config.credentialId : "";
      if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Gmail connection before activating.", false);
      const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GMAIL);
      let baseline: Awaited<ReturnType<typeof getGmailHistoryBaseline>>;
      try { baseline = await this.provider.getGmailHistoryBaseline(typeof credential.accessToken === "string" ? credential.accessToken : ""); }
      catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
      baselines.push({ nodeId: node.id, ...baseline });
    }
    return baselines;
  }

  async tick() {
    try {
      try { await this.recoverQueued(); } catch { this.logger.warn("Could not scan queued Gmail executions for recovery."); }
      const versions = await this.prisma.workflowVersion.findMany({ where: { status: WorkflowVersionStatus.PUBLISHED, publishedFor: { is: { isActive: true, archivedAt: null } } }, include: { workflow: true } });
      for (const version of versions) {
        try {
          const graph = parseStoredWorkflowGraph(version.graph);
          for (const node of graph.nodes.filter((item) => item.type === "trigger.gmail")) await this.poll(version.id, version.workflowId, version.workflow.workspaceId, node.id, node.config);
        } catch { this.logger.warn(`Gmail trigger scan failed for workflow ${version.workflowId}.`); }
      }
    } catch { this.logger.error("Gmail trigger scheduler could not complete its scan."); }
  }

  async recoverQueued(now = new Date()) {
    const queued = await this.prisma.execution.findMany({ where: { status: ExecutionStatus.QUEUED, resumeToken: null, mode: "LIVE", idempotencyKey: { startsWith: "gmail:" }, createdAt: { lt: new Date(now.getTime() - 2 * 60_000) }, ...(this.recoveryCursor ? { id: { gt: this.recoveryCursor } } : {}) }, select: { id: true, startedAt: true, workflowVersion: { select: { graph: true } }, nodeExecutions: { select: { nodeId: true, status: true, output: true } }, approvalRequests: { where: { status: ApprovalRequestStatus.APPROVED }, orderBy: { resolvedAt: "desc" }, take: 1, select: { id: true } } }, orderBy: { id: "asc" }, take: 100 });
    for (const execution of queued) {
      try {
        const approved = execution.approvalRequests[0];
        let startNodeIds: string[] | undefined;
        if (approved) {
          if (!execution.startedAt) throw new Error("Approval on an unstarted execution requires review.");
          const graph = parseStoredWorkflowGraph(execution.workflowVersion.graph);
          const approvedNode = execution.nodeExecutions.find((node) => node.status === NodeExecutionStatus.SUCCEEDED && node.output && typeof node.output === "object" && !Array.isArray(node.output) && node.output.approvalRequestId === approved.id && graph.nodes.some((candidate) => candidate.id === node.nodeId && candidate.type === "approval.request"));
          if (!approvedNode) throw new Error("Approval resume point cannot be determined.");
          startNodeIds = graph.edges.filter((edge) => edge.source === approvedNode.nodeId && edge.kind === "success").map((edge) => edge.target);
        } else if (execution.startedAt || execution.nodeExecutions.some((node) => node.status !== NodeExecutionStatus.PENDING)) {
          throw new Error("Execution resume point cannot be determined.");
        }
        await this.queue.ensureDispatched({ executionId: execution.id, mode: "live", ...(startNodeIds ? { startNodeIds } : { initialOnly: true }) });
      }
      catch { this.logger.warn(`Could not restore queued Gmail execution ${execution.id}.`); }
    }
    this.recoveryCursor = queued.length === 100 ? queued[queued.length - 1]!.id : "";
  }

  async poll(versionId: string, workflowId: string, workspaceId: string, nodeId: string, config: Record<string, unknown>) {
    const leaseToken = randomUUID(); const now = new Date();
    const key = { workflowVersionId_nodeId: { workflowVersionId: versionId, nodeId } };
    const claimed = await this.prisma.gmailTriggerCheckpoint.updateMany({ where: { workflowVersionId: versionId, nodeId, state: "READY", AND: [{ OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] }, { OR: [{ nextPollAt: null }, { nextPollAt: { lte: now } }] }] }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + leaseMs) } });
    if (!claimed.count) return;
    try {
      const checkpoint = await this.prisma.gmailTriggerCheckpoint.findUniqueOrThrow({ where: key });
      const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
      const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GMAIL);
      const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
      const profile = await this.provider.getGmailHistoryBaseline(token);
      if (profile.mailboxHash !== checkpoint.mailboxHash) throw new NodeFailure("GMAIL_MAILBOX_CHANGED", "The Gmail connection now points to a different mailbox. Review and reactivate the trigger.", false);
      const page = await this.provider.getGmailHistoryPage(token, checkpoint.historyId, checkpoint.pageToken ?? undefined);
      const maxMessages = ["10", "25", "50"].includes(String(config.maxMessages)) ? Number(config.maxMessages) : 10;
      let processed = 0; let pageIncomplete = false;
      for (const messageId of page.messageIds) {
        const active = await this.prisma.workflow.findFirst({ where: { id: workflowId, isActive: true, archivedAt: null, publishedVersionId: versionId }, select: { id: true } });
        if (!active) return;
        const lease = await this.prisma.gmailTriggerCheckpoint.updateMany({ where: { workflowVersionId: versionId, nodeId, state: "READY", leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { leaseExpiresAt: new Date(Date.now() + leaseMs) } });
        if (!lease.count) return;
        const delivery = await this.reserveDelivery(workflowId, versionId, nodeId, messageId, leaseToken);
        if (!delivery) return;
        if (delivery.dispatchedAt) continue;
        if (processed >= maxMessages) { pageIncomplete = true; break; }
        let message: Awaited<ReturnType<typeof getGmailMessage>>;
        try { message = await this.provider.getGmailMessage(token, messageId); }
        catch (error) { if (error instanceof NodeFailure && error.statusCode === 404) throw new NodeFailure("GMAIL_MESSAGE_MISSING", "A message in the saved history is no longer available. Review the trigger before resetting its checkpoint.", false); throw error; }
        const inboxOnly = config.mailbox !== "all";
        const sender = typeof config.sender === "string" ? config.sender.trim().toLowerCase() : "";
        const subject = typeof config.subject === "string" ? config.subject.trim().toLowerCase() : "";
        const labelId = typeof config.labelId === "string" ? config.labelId : "";
        if (sender.length > 320 || subject.length > 500 || (labelId && !/^[A-Za-z0-9_-]{1,128}$/.test(labelId))) throw new NodeFailure("INVALID_INPUT", "Gmail filters are invalid.", false);
        if ((inboxOnly && !message.labels.includes("INBOX")) || (labelId && !message.labels.includes(labelId)) || (sender && !message.from.toLowerCase().includes(sender)) || (subject && !message.subject.toLowerCase().includes(subject))) {
          // The provider read can outlive deactivation or a checkpoint reset.
          // Commit the filter decision only while the same workflow and lease
          // are still current, using the same lock order as lifecycle changes.
          if (!await this.recordFilteredDelivery(workflowId, versionId, nodeId, messageId, leaseToken)) return;
          processed++;
          continue;
        }
        const idempotencyKey = `gmail:${createHash("sha256").update(`${versionId}\0${nodeId}\0${messageId}`).digest("hex")}`;
        const result = await this.executions.createGmailScheduledExecution(versionId, workflowId, nodeId, messageId, leaseToken, { message, source: "gmail" }, idempotencyKey);
        if (result.alreadyDispatched) continue;
        if (!result.execution) return;
        const execution = result.execution;
        const stillActive = await this.prisma.workflow.findFirst({ where: { id: workflowId, isActive: true, archivedAt: null, publishedVersionId: versionId }, select: { id: true } });
        const stillOwned = await this.prisma.gmailTriggerCheckpoint.updateMany({ where: { workflowVersionId: versionId, nodeId, state: "READY", leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { leaseExpiresAt: new Date(Date.now() + leaseMs) } });
        if (!stillActive || !stillOwned.count) return;
        await this.queue.dispatch({ executionId: execution.id, mode: "live", startNodeIds: [nodeId], initialOnly: true });
        // A reset can mark this receipt skipped while queue dispatch is in
        // flight. Never overwrite that decision or acknowledge another
        // execution that happens to use the same receipt key.
        const acknowledged = await this.prisma.gmailTriggerDelivery.updateMany({ where: { workflowVersionId: versionId, nodeId, messageId, executionId: execution.id, dispatchedAt: null }, data: { dispatchedAt: new Date() } });
        if (!acknowledged.count) return;
        processed++;
      }
      const interval = ["1", "5", "15", "60"].includes(String(config.pollMinutes)) ? Number(config.pollMinutes) : 1;
      const moreWork = pageIncomplete || Boolean(page.nextPageToken);
      await this.recordCheckpoint(workflowId, versionId, nodeId, leaseToken, { historyId: moreWork ? checkpoint.historyId : page.historyId, pageToken: pageIncomplete ? checkpoint.pageToken : page.nextPageToken, nextPollAt: new Date(Date.now() + (moreWork ? 1 : interval) * 60_000), lastErrorCode: null });
    } catch (error) {
      const code = error instanceof NodeFailure ? error.code : "GMAIL_POLL_FAILED";
      const needsAttention = code === "GMAIL_HISTORY_EXPIRED" || code === "GMAIL_MAILBOX_CHANGED" || code === "GMAIL_EXECUTION_MISSING" || code === "GMAIL_MESSAGE_MISSING";
      await this.recordCheckpoint(workflowId, versionId, nodeId, leaseToken, { state: needsAttention ? "ERROR" : "READY", lastErrorCode: code });
      this.logger.warn(`Gmail trigger poll failed (${code}) for workflow ${workflowId}.`);
    } finally {
      await this.prisma.gmailTriggerCheckpoint.updateMany({ where: { workflowVersionId: versionId, nodeId, leaseToken }, data: { leaseToken: null, leaseExpiresAt: null } });
    }
  }

  private async reserveDelivery(workflowId: string, versionId: string, nodeId: string, messageId: string, leaseToken: string) {
    return this.prisma.$transaction(async (transaction) => {
      // Reset and deactivation also lock workflow before checkpoint. A poll
      // that lost either race must not create a receipt after the reset.
      const workflows = await transaction.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== versionId) return null;
      const checkpoints = await transaction.$queryRaw<Array<{ leaseToken: string | null; leaseExpiresAt: Date | null; state: string }>>`SELECT "leaseToken", "leaseExpiresAt", "state" FROM "GmailTriggerCheckpoint" WHERE "workflowVersionId" = ${versionId} AND "nodeId" = ${nodeId} FOR UPDATE`;
      const checkpoint = checkpoints[0];
      if (!checkpoint || checkpoint.state !== "READY" || checkpoint.leaseToken !== leaseToken || !checkpoint.leaseExpiresAt || checkpoint.leaseExpiresAt <= new Date()) return null;
      const where = { workflowVersionId_nodeId_messageId: { workflowVersionId: versionId, nodeId, messageId } };
      return transaction.gmailTriggerDelivery.upsert({ where, create: { workflowVersionId: versionId, nodeId, messageId }, update: {} });
    });
  }

  private async recordCheckpoint(workflowId: string, versionId: string, nodeId: string, leaseToken: string, data: GmailCheckpointUpdate) {
    await this.prisma.$transaction(async (transaction) => {
      // A provider response may arrive after deactivation or republishing.
      // Serialize in the same workflow -> checkpoint lock order as lifecycle
      // changes; never advance or poison an inactive version's checkpoint.
      const workflows = await transaction.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== versionId) return;
      await transaction.gmailTriggerCheckpoint.updateMany({ where: { workflowVersionId: versionId, nodeId, state: "READY", leaseToken, leaseExpiresAt: { gt: new Date() } }, data });
    });
  }

  private async recordFilteredDelivery(workflowId: string, versionId: string, nodeId: string, messageId: string, leaseToken: string) {
    return this.prisma.$transaction(async (transaction) => {
      const workflows = await transaction.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== versionId) return false;
      const checkpoints = await transaction.$queryRaw<Array<{ leaseToken: string | null; leaseExpiresAt: Date | null; state: string }>>`SELECT "leaseToken", "leaseExpiresAt", "state" FROM "GmailTriggerCheckpoint" WHERE "workflowVersionId" = ${versionId} AND "nodeId" = ${nodeId} FOR UPDATE`;
      const checkpoint = checkpoints[0];
      if (!checkpoint || checkpoint.state !== "READY" || checkpoint.leaseToken !== leaseToken || !checkpoint.leaseExpiresAt || checkpoint.leaseExpiresAt <= new Date()) return false;
      const updated = await transaction.gmailTriggerDelivery.updateMany({ where: { workflowVersionId: versionId, nodeId, messageId, dispatchedAt: null, executionId: null }, data: { dispatchedAt: new Date(), skipReason: "filter_not_matched" } });
      return updated.count === 1;
    });
  }
}
