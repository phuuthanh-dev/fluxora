import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { CredentialProvider, ProviderWebhookState } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CredentialService } from "../credentials/credential.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { JiraWebhookAdapter, type JiraIssueEvent } from "./jira-webhook-adapter";
import { reserveJiraWebhook } from "./jira-webhook-reservation";
import { dispatchJiraWebhookCreate } from "./jira-webhook-create";
import { ProviderWebhookError } from "./provider-webhook-adapter";
import { ProviderWebhookStateStore } from "./provider-webhook-state";

@Injectable()
export class JiraWebhookManagementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CredentialService) private readonly credentials: CredentialService,
    @Inject(CredentialVaultService) private readonly vault: CredentialVaultService,
    @Inject(JiraWebhookAdapter) private readonly adapter: JiraWebhookAdapter,
  ) {}

  async status(workflowId: string, userId: string, triggerNodeId?: string) {
    const { endpoint, registration } = await this.findOwned(workflowId, userId, triggerNodeId);
    return { enabled: process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED === "true", endpoint: endpoint ? { id: endpoint.id, workflowVersionId: endpoint.workflowVersionId, updatedAt: endpoint.updatedAt } : null,
      registration: registration ? { provider: registration.provider, repository: registration.repository.split(":")[1] ?? "", event: registration.event, workflowVersionId: registration.workflowVersionId, state: registration.state, createdAt: registration.createdAt, updatedAt: registration.updatedAt } : null };
  }

  async create(workflowId: string, userId: string, triggerNodeId?: string) {
    if (process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED !== "true") throw new BadRequestException({ code: "PROVIDER_WEBHOOK_AUTOMATION_DISABLED", message: "Jira webhook registration is unavailable." });
    const { workflow, endpoint, registration } = await this.findOwned(workflowId, userId, triggerNodeId);
    if (!workflow.publishedVersionId) throw new BadRequestException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish this workflow before connecting its Jira webhook." });
    if (!endpoint) throw new NotFoundException({ code: "WEBHOOK_ENDPOINT_REQUIRED", message: "Create the webhook endpoint before connecting Jira." });
    if (registration && registration.state !== "REMOVED" && registration.state !== "CREATE_REJECTED") throw new ConflictException({ code: "PROVIDER_WEBHOOK_EXISTS", message: "This endpoint already has a provider registration." });
    const reservation = await reserveJiraWebhook(this.prisma, this.vault, { workflowId, userId, versionId: workflow.publishedVersionId, endpointId: endpoint.id, endpointUpdatedAt: endpoint.updatedAt, apiOrigin: process.env.PUBLIC_API_ORIGIN ?? "", clientSecret: process.env.JIRA_CLIENT_SECRET });
    await dispatchJiraWebhookCreate(this.prisma, this.credentials, this.adapter, { ...reservation, userId });
    return this.status(workflowId, userId, triggerNodeId);
  }

  async remove(workflowId: string, userId: string, triggerNodeId?: string) {
    if (process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED !== "true") throw new BadRequestException({ code: "PROVIDER_WEBHOOK_AUTOMATION_DISABLED", message: "Jira webhook registration is unavailable." });
    const { workflow, registration } = await this.findOwned(workflowId, userId, triggerNodeId);
    if (!registration || registration.provider !== "JIRA") throw new NotFoundException({ code: "PROVIDER_WEBHOOK_NOT_FOUND", message: "This workflow has no managed Jira webhook." });
    if (registration.state === ProviderWebhookState.CREATE_REJECTED && registration.remoteHookId === null) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
        const deleted = await tx.providerWebhookRegistration.deleteMany({ where: { id: registration.id, operationId: registration.operationId, state: ProviderWebhookState.CREATE_REJECTED, remoteHookId: null } });
        if (deleted.count !== 1) throw changed();
      });
      return { ...await this.status(workflowId, userId, triggerNodeId), operationResult: "REMOVED" };
    }
    if (registration.state !== ProviderWebhookState.ACTIVE || registration.remoteHookId === null) throw new ConflictException({ code: "PROVIDER_WEBHOOK_REQUIRES_RECONCILIATION", message: "Review the recorded Jira webhook before removing it." });
    const [cloudId = "", projectId = ""] = registration.repository.split(":");
    const hookId = Number(registration.remoteHookId);
    if (!Number.isSafeInteger(hookId) || hookId <= 0) throw new ConflictException({ code: "PROVIDER_WEBHOOK_IDENTITY_UNKNOWN", message: "The Jira webhook identity needs review." });
    const operationId = randomUUID(), states = new ProviderWebhookStateStore(this.prisma.providerWebhookRegistration);
    if (!await states.beginDelete(registration.id, registration.operationId, operationId)) throw changed();
    let outcome: "removed" | "rejected" | "uncertain" = "uncertain";
    let dispatched = false;
    try {
      outcome = await this.credentials.runJiraOperation(registration.credentialId, workflow.workspaceId, async () => {
        const credential = await this.credentials.readForExecution(registration.credentialId, workflow.workspaceId, CredentialProvider.JIRA);
        if (credential.cloudId !== cloudId || typeof credential.accessToken !== "string") throw new ProviderWebhookError("INVALID_INPUT", false);
        const auth = { cloudId, accessToken: credential.accessToken };
        const expected = { id: hookId, url: registration.callbackUrl, projectId, event: registration.event as JiraIssueEvent };
        const existing = await this.adapter.inspect(auth, expected);
        if (!existing.found) return "removed";
        if (!existing.matches) return "rejected";
        dispatched = true;
        await this.adapter.remove(auth, hookId);
        const after = await this.adapter.inspect(auth, expected);
        return after.found ? "uncertain" : "removed";
      });
    } catch (error) {
      if (!dispatched || error instanceof ProviderWebhookError && ["INVALID_INPUT", "FORBIDDEN", "CONFLICT"].includes(error.code)) outcome = "rejected";
    }
    if (!await states.finishDelete(registration.id, operationId, outcome)) throw changed();
    if (outcome === "removed") {
      // Publish uses the same workflow lock; release the pinned registration
      // only after a complete provider listing confirms this hook is absent.
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
        const deleted = await tx.providerWebhookRegistration.deleteMany({ where: { id: registration.id, operationId, state: ProviderWebhookState.REMOVED } });
        if (deleted.count !== 1) throw changed();
      });
    }
    return { ...await this.status(workflowId, userId, triggerNodeId), operationResult: outcome.toUpperCase() };
  }

  async reconcile(workflowId: string, userId: string, triggerNodeId?: string) {
    if (process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED !== "true") throw new BadRequestException({ code: "PROVIDER_WEBHOOK_AUTOMATION_DISABLED", message: "Jira webhook registration is unavailable." });
    const { workflow, registration } = await this.findOwned(workflowId, userId, triggerNodeId);
    if (!registration || registration.provider !== "JIRA") throw new NotFoundException({ code: "PROVIDER_WEBHOOK_NOT_FOUND", message: "This workflow has no managed Jira webhook." });
    if (!new Set<ProviderWebhookState>([ProviderWebhookState.ACTIVE, ProviderWebhookState.CREATE_UNCERTAIN, ProviderWebhookState.DELETE_UNCERTAIN]).has(registration.state)) throw new ConflictException({ code: "PROVIDER_WEBHOOK_OPERATION_IN_PROGRESS", message: "This Jira webhook cannot be checked right now." });
    const [cloudId = "", projectId = ""] = registration.repository.split(":");
    const expected = { url: registration.callbackUrl, projectId, event: registration.event as JiraIssueEvent };
    let result: { outcome: "MATCHED" | "DRIFTED" | "UNKNOWN" | "MANUAL_REQUIRED"; message: string } = { outcome: "UNKNOWN", message: "Jira could not confirm this registration. Check again before making changes." };
    try {
      result = await this.credentials.runJiraOperation(registration.credentialId, workflow.workspaceId, async () => {
        const credential = await this.credentials.readForExecution(registration.credentialId, workflow.workspaceId, CredentialProvider.JIRA);
        if (credential.cloudId !== cloudId || typeof credential.accessToken !== "string") throw new Error("Jira connection changed");
        const auth = { cloudId, accessToken: credential.accessToken };
        if (registration.state === ProviderWebhookState.CREATE_UNCERTAIN) {
          const matches = await this.adapter.findMatching(auth, expected);
          if (matches.length !== 1) return { outcome: "MANUAL_REQUIRED" as const, message: "Jira did not return exactly one matching webhook. Review Jira before retrying." };
          const updated = await this.prisma.providerWebhookRegistration.updateMany({ where: { id: registration.id, operationId: registration.operationId, state: ProviderWebhookState.CREATE_UNCERTAIN, remoteHookId: null }, data: { state: ProviderWebhookState.ACTIVE, remoteHookId: BigInt(matches[0]!) } });
          if (updated.count !== 1) throw changed();
          return { outcome: "MATCHED" as const, message: "Jira confirmed the webhook." };
        }
        const id = registration.remoteHookId === null ? NaN : Number(registration.remoteHookId);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Jira webhook identity unavailable");
        const remote = await this.adapter.inspect(auth, { ...expected, id });
        if (registration.state === ProviderWebhookState.DELETE_UNCERTAIN && !remote.found) {
          await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
            const deleted = await tx.providerWebhookRegistration.deleteMany({ where: { id: registration.id, operationId: registration.operationId, state: ProviderWebhookState.DELETE_UNCERTAIN, remoteHookId: registration.remoteHookId } });
            if (deleted.count !== 1) throw changed();
          });
          return { outcome: "MATCHED" as const, message: "Jira confirmed the webhook was removed." };
        }
        if (!remote.found || !remote.matches) return { outcome: "DRIFTED" as const, message: "The remote Jira webhook differs from the saved registration." };
        if (registration.state === ProviderWebhookState.DELETE_UNCERTAIN) return { outcome: "UNKNOWN" as const, message: "Jira still lists the webhook; check again before retrying." };
        if (!remote.expirationDate || remote.expirationDate.getTime() <= Date.now()) return { outcome: "DRIFTED" as const, message: "The Jira webhook is expired or its expiry could not be verified." };
        return { outcome: "MATCHED" as const, message: "The Jira webhook matches the saved registration." };
      });
    } catch { /* Do not disclose provider data or assume a failed request changed nothing. */ }
    return { ...await this.status(workflowId, userId, triggerNodeId), reconciliation: result };
  }

  private async findOwned(workflowId: string, userId: string, triggerNodeId?: string) {
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } }, select: { id: true, workspaceId: true, publishedVersionId: true } });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    const endpoints = await this.prisma.webhookEndpoint.findMany({ where: { workflowId: workflow.id, ...(triggerNodeId ? { triggerNodeId } : {}) }, take: 2 });
    if (endpoints.length > 1) throw new ConflictException({ code: "WEBHOOK_TRIGGER_REQUIRED", message: "Choose a webhook trigger to manage its registration." });
    const endpoint = endpoints[0] ?? null;
    const registration = endpoint ? await this.prisma.providerWebhookRegistration.findUnique({ where: { endpointId: endpoint.id } }) : null;
    return { workflow, endpoint, registration };
  }
}

function changed() { return new ConflictException({ code: "PROVIDER_WEBHOOK_OPERATION_CHANGED", message: "The Jira provider operation requires review." }); }
