import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { CredentialProvider, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { graphCredentialIds } from "../credentials/credential-references";
import { jiraAccountHash } from "../credentials/jira-privacy-attribution";
import { jiraAccountId } from "../credentials/jira-oauth";

type Store = Prisma.TransactionClient;
const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
const conflict = (message: string) => new ConflictException({ code: "JIRA_PRIVACY_REVIEW_REQUIRED", message });
function requestId(id: unknown) { if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Choose a reporting record." }); return id; }
function reviewReference(value: unknown) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(value)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a review reference (3–80 letters, numbers, hyphens or underscores). Do not enter personal data." }); return value; }
function digest(value: unknown) {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32) throw new Error("Encryption key required");
  return createHmac("sha256", Buffer.from(key, "base64")).update("jira-privacy-preview\0").update(JSON.stringify(value)).digest("hex");
}

@Injectable()
export class JiraPrivacyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialVaultService) private readonly vault: CredentialVaultService) {}

  async list(cursor?: string) {
    if (cursor) requestId(cursor);
    const rows = await this.prisma.jiraPrivacyAccount.findMany({ take: 51, orderBy: { accountHash: "asc" }, ...(cursor ? { cursor: { accountHash: cursor }, skip: 1 } : {}), select: { accountHash: true, state: true, requiredAction: true, oldestDataAt: true, nextReportAt: true, lastReportedAt: true, lastAttemptAt: true, cycleDays: true, coverageReviewedAt: true, credentialIds: true, workspaceIds: true, lastErrorCode: true } });
    return { enabled: process.env.JIRA_PRIVACY_REPORTING_ENABLED === "true", records: rows.slice(0, 50).map(({ accountHash, credentialIds, workspaceIds, ...item }) => ({ id: accountHash, ...item, connectionCount: credentialIds.length, workspaceCount: workspaceIds.length })), nextCursor: rows.length > 50 ? rows[49]?.accountHash ?? null : null };
  }

  /** Explicit metadata backfill, never a side effect of a GET and never a purge. */
  async discover(actorId: string) {
    const rows = await this.prisma.credential.findMany({ where: { provider: CredentialProvider.JIRA }, take: 501, orderBy: { id: "asc" } });
    if (rows.length > 500) throw conflict("More than 500 Jira connections require an operator-led inventory; no partial inventory was saved.");
    let linked = 0, invalid = 0;
    for (const row of rows) {
      let accountId: unknown;
      try { accountId = this.vault.decrypt(row.encryptedData).accountId; } catch { invalid++; continue; }
      if (!jiraAccountId(accountId)) { invalid++; continue; }
      const accountHash = jiraAccountHash(accountId);
      await this.prisma.$transaction(async (tx) => {
        await tx.jiraPrivacyAccount.upsert({ where: { accountHash }, create: { accountHash, encryptedAccountId: this.vault.encrypt({ accountId }), oldestDataAt: row.createdAt, nextReportAt: new Date(), credentialIds: [row.id], workspaceIds: [row.workspaceId] }, update: {} });
        await tx.$queryRaw`SELECT "accountHash" FROM "JiraPrivacyAccount" WHERE "accountHash" = ${accountHash} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Credential" WHERE id = ${row.id} FOR UPDATE`;
        const current = await tx.credential.findFirst({ where: { id: row.id, workspaceId: row.workspaceId, provider: CredentialProvider.JIRA, encryptedData: row.encryptedData }, select: { id: true } });
        if (!current) throw conflict("A Jira connection changed during inventory. Run inventory again; the changed account was not linked.");
        await tx.jiraPrivacyAccount.updateMany({ where: { accountHash, NOT: { credentialIds: { has: row.id } } }, data: { credentialIds: { push: row.id } } });
        await tx.jiraPrivacyAccount.updateMany({ where: { accountHash, NOT: { workspaceIds: { has: row.workspaceId } } }, data: { workspaceIds: { push: row.workspaceId } } });
        await tx.jiraPrivacyAccount.updateMany({ where: { accountHash, oldestDataAt: { gt: row.createdAt } }, data: { oldestDataAt: row.createdAt } });
      });
      linked++;
    }
    await this.prisma.auditLog.create({ data: { actorId, action: "admin.jira_privacy_inventory", targetType: "jira_privacy", metadata: { linked, invalid } } });
    return { linked, invalid, legacyReviewRequired: true };
  }

  private async inventory(db: Store, id: string) {
    const record = await db.jiraPrivacyAccount.findUnique({ where: { accountHash: requestId(id) } });
    if (!record) throw new NotFoundException({ code: "JIRA_PRIVACY_NOT_FOUND", message: "Reporting record not found; it may already be resolved." });
    const connections = await db.credential.findMany({ where: { id: { in: record.credentialIds }, provider: CredentialProvider.JIRA }, orderBy: { id: "asc" }, select: { id: true, workspaceId: true, updatedAt: true } });
    const candidates = await db.workflow.findMany({ where: { workspaceId: { in: record.workspaceIds } }, take: 201, orderBy: { id: "asc" }, select: { id: true, name: true, isActive: true, versions: { select: { id: true, graph: true }, orderBy: { id: "asc" } } } });
    if (candidates.length > 200) throw conflict("This inventory exceeds 200 workflows. Review in bounded operator-led batches; nothing has been erased.");
    const workflows = candidates.filter((row) => row.versions.some((version) => graphCredentialIds(version.graph).some((key) => record.credentialIds.includes(key))));
    // All versions and all downstream payloads: copied values are not limited to the Jira node.
    const versionIds = workflows.flatMap((row) => row.versions.map((version) => version.id));
    const executions = await db.execution.findMany({ where: { workflowVersionId: { in: versionIds } }, take: 1001, orderBy: { id: "asc" }, select: { id: true, status: true, privacyErasedAt: true, createdAt: true } });
    if (executions.length > 1000) throw conflict("This inventory exceeds 1,000 executions. Use an operator-led batch; nothing has been erased.");
    const ids = executions.map((row) => row.id);
    const [nodes, items, registrations] = await Promise.all([
      db.nodeExecution.count({ where: { executionId: { in: ids } } }),
      db.nodeExecutionItem.count({ where: { nodeExecution: { executionId: { in: ids } } } }),
      db.providerWebhookRegistration.count({ where: { credentialId: { in: record.credentialIds } } }),
    ]);
    const blockers: string[] = [];
    if (record.state !== "ACTION_REQUIRED" || !["closed", "updated"].includes(record.requiredAction ?? "")) blockers.push("A confirmed closed/updated response is required.");
    if (!record.credentialIds.length || !record.workspaceIds.length) blockers.push("Attribution is missing. Discover current connections and investigate deleted legacy connections before resolving.");
    if (workflows.some((row) => row.isActive)) blockers.push("Deactivate the affected workflows before erasing data.");
    if (executions.some((row) => !terminal.has(row.status))) blockers.push("Wait for or cancel all queued, running and approval-waiting executions, then review again.");
    if (registrations) blockers.push("Remove related provider registrations through their normal lifecycle first.");
    return { record, connections, workflows, executions, nodes, items, blockers };
  }

  private fingerprint(plan: Awaited<ReturnType<JiraPrivacyService["inventory"]>>, actorId: string, expiresAt: number) {
    return digest({ actorId, expiresAt, record: plan.record, connections: plan.connections, workflows: plan.workflows, executions: plan.executions, nodes: plan.nodes, items: plan.items });
  }

  async preview(id: string, actorId: string) {
    const plan = await this.inventory(this.prisma, id), expiresAt = Date.now() + 15 * 60_000;
    return { id, action: plan.record.requiredAction, expiresAt, previewToken: `${expiresAt}.${this.fingerprint(plan, actorId, expiresAt)}`, legacyReviewRequired: !plan.record.coverageReviewedAt, blockers: plan.blockers, counts: { connections: plan.connections.length, workflows: plan.workflows.length, executions: plan.executions.filter((row) => !row.privacyErasedAt).length, nodes: plan.nodes, items: plan.items }, workflows: plan.workflows.map(({ id: workflowId, name, isActive }) => ({ id: workflowId, name, isActive })), review: ["Review immutable workflow configuration and manually handle personal data stored there before confirming.", "Review logs, backups, downloads and external destinations; this action cannot erase copies outside the listed database payloads.", "Authorizing-account links do not identify other people in arbitrary issue text. Review additional subjects and copies separately."] };
  }

  async resolve(id: string, actorId: string, input: { previewToken?: unknown; reviewReference?: unknown; copiesReviewed?: unknown; legacyReviewed?: unknown; confirmation?: unknown }) {
    const reference = reviewReference(input.reviewReference);
    if (input.copiesReviewed !== true || input.confirmation !== "ERASE" || typeof input.previewToken !== "string") throw conflict("Review configuration, logs, backups and external copies and type ERASE before confirming.");
    const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(input.previewToken);
    if (!match || Number(match[1]) < Date.now() || Number(match[1]) > Date.now() + 15 * 60_000) throw conflict("The preview expired. Review a new preview.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "accountHash" FROM "JiraPrivacyAccount" WHERE "accountHash" = ${requestId(id)} FOR UPDATE`;
      const initial = await this.inventory(tx, id);
      // Creation of live executions shares these credential locks. Never race a new dispatch.
      for (const workflow of initial.workflows) await tx.$queryRaw`SELECT id FROM "Workflow" WHERE id = ${workflow.id} FOR UPDATE`;
      for (const connection of initial.connections) await tx.$queryRaw`SELECT id FROM "Credential" WHERE id = ${connection.id} FOR UPDATE`;
      for (const execution of initial.executions) await tx.$queryRaw`SELECT id FROM "Execution" WHERE id = ${execution.id} FOR UPDATE`;
      const plan = await this.inventory(tx, id);
      const expected = this.fingerprint(plan, actorId, Number(match[1]));
      if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(match[2]!, "hex"))) throw conflict("Affected data changed. Review a new preview before erasing anything.");
      if (plan.blockers.length) throw conflict(plan.blockers.join(" "));
      if (!plan.record.coverageReviewedAt && input.legacyReviewed !== true) throw conflict("The legacy inventory requires a separate operator review.");
      const ids = plan.executions.map((row) => row.id), erasedAt = new Date();
      await tx.nodeExecutionItem.updateMany({ where: { nodeExecution: { executionId: { in: ids } } }, data: { input: Prisma.DbNull, output: Prisma.DbNull, errorMessage: null, errorRetryable: false } });
      await tx.nodeExecution.updateMany({ where: { executionId: { in: ids } }, data: { input: Prisma.DbNull, output: Prisma.DbNull, errorMessage: null, errorRetryable: false } });
      await tx.execution.updateMany({ where: { id: { in: ids } }, data: { triggerData: Prisma.DbNull, errorMessage: null, errorRetryable: false, privacyErasedAt: erasedAt, webhookPayloadDigest: null } });
      const removed = await tx.credential.deleteMany({ where: { id: { in: plan.connections.map((row) => row.id) }, provider: CredentialProvider.JIRA } });
      await tx.jiraPrivacyAccount.delete({ where: { accountHash: id } });
      // No subject ID/hash, payload, graph, label or token in the retained audit event.
      await tx.auditLog.create({ data: { actorId, action: "admin.jira_privacy_erased", targetType: "jira_privacy", metadata: { reference, reason: plan.record.requiredAction, executions: ids.length, connections: removed.count } } });
      return { resolved: true, erasedExecutions: ids.length, removedConnections: removed.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20_000 }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw conflict("Affected data changed concurrently. Review a new preview; nothing was erased.");
      throw error;
    });
  }

  async recover(id: string, actorId: string, input: { nextReportAt?: unknown; reviewReference?: unknown; providerReviewed?: unknown }) {
    const reference = reviewReference(input.reviewReference), date = typeof input.nextReportAt === "string" ? new Date(input.nextReportAt) : new Date(NaN);
    if (input.providerReviewed !== true || !Number.isFinite(date.getTime())) throw conflict("Confirm the provider's next eligible reporting date after investigating the uncertain attempt.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "accountHash" FROM "JiraPrivacyAccount" WHERE "accountHash" = ${requestId(id)} FOR UPDATE`;
      const row = await tx.jiraPrivacyAccount.findUnique({ where: { accountHash: id } });
      if (!row || row.state !== "UNCERTAIN") throw conflict("Only an uncertain report can be rescheduled by this operation.");
      const earliest = (row.lastAttemptAt ?? new Date()).getTime() + row.cycleDays * 86400_000;
      if (date.getTime() < Math.max(Date.now() + 60_000, earliest)) throw conflict("Do not replay an uncertain request before its reporting cycle. Confirm a later date with the provider.");
      await tx.jiraPrivacyAccount.update({ where: { accountHash: id }, data: { state: "READY", nextReportAt: date, claimToken: null, claimedAt: null, lastErrorCode: null } });
      await tx.auditLog.create({ data: { actorId, action: "admin.jira_privacy_rescheduled", targetType: "jira_privacy", metadata: { reference, nextReportAt: date.toISOString() } } });
      return { scheduled: true, nextReportAt: date };
    });
  }
}
