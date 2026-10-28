import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CredentialService } from "../credentials/credential.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { GitHubWebhookAdapter } from "./github-webhook-adapter";
import { dispatchGitHubWebhookCreate } from "./github-webhook-create";
import { dispatchGitHubWebhookDelete } from "./github-webhook-delete";
import { reserveGitHubWebhook } from "./github-webhook-reservation";
import { ProviderWebhookState } from "@prisma/client";

const busyStates = new Set<ProviderWebhookState>([
  ProviderWebhookState.CREATING,
  ProviderWebhookState.CREATE_DISPATCHING,
  ProviderWebhookState.DELETING,
]);

/**
 * User-facing orchestration for provider-managed GitHub hooks.
 *
 * Provider-specific HTTP remains behind GitHubWebhookAdapter and the lifecycle
 * state machine remains in the small reservation/dispatcher modules. This
 * service only composes authorization, trusted configuration and safe DTOs so
 * another provider can get an equivalent management service later.
 */
@Injectable()
export class GitHubWebhookManagementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CredentialService) private readonly credentials: CredentialService,
    @Inject(CredentialVaultService) private readonly vault: CredentialVaultService,
    @Inject(GitHubWebhookAdapter) private readonly adapter: GitHubWebhookAdapter,
  ) {}

  async status(workflowId: string, userId: string) {
    const record = await this.findOwnedRecord(workflowId, userId);
    return this.safeStatus(record.endpoint, record.registration);
  }

  async create(workflowId: string, userId: string) {
    this.requireEnabled();
    const record = await this.findOwnedRecord(workflowId, userId);
    if (!record.workflow.publishedVersion) throw new BadRequestException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish this workflow before connecting its GitHub webhook." });
    if (!record.endpoint) throw new NotFoundException({ code: "WEBHOOK_ENDPOINT_REQUIRED", message: "Create the webhook endpoint before connecting GitHub." });
    if (record.registration) {
      if (record.registration.state === ProviderWebhookState.CREATE_UNCERTAIN || record.registration.state === ProviderWebhookState.DELETE_UNCERTAIN) throw new ConflictException({ code: "PROVIDER_WEBHOOK_REQUIRES_RECONCILIATION", message: "Reconcile the uncertain GitHub registration before trying again." });
      throw new ConflictException({ code: "PROVIDER_WEBHOOK_EXISTS", message: "This workflow already has a GitHub webhook registration." });
    }

    const reservation = await reserveGitHubWebhook(this.prisma, {
      workflowId,
      userId,
      versionId: record.workflow.publishedVersion.id,
      endpointId: record.endpoint.id,
      endpointUpdatedAt: record.endpoint.updatedAt,
      apiOrigin: process.env.PUBLIC_API_ORIGIN ?? "",
    });
    await dispatchGitHubWebhookCreate(this.prisma, this.credentials, this.vault, this.adapter, { id: reservation.id, operationId: reservation.operationId, userId });
    return this.status(workflowId, userId);
  }

  async remove(workflowId: string, userId: string) {
    this.requireEnabled();
    const record = await this.findOwnedRecord(workflowId, userId);
    if (!record.registration) throw new NotFoundException({ code: "PROVIDER_WEBHOOK_NOT_FOUND", message: "This workflow has no managed GitHub webhook." });
    if (busyStates.has(record.registration.state)) throw new ConflictException({ code: "PROVIDER_WEBHOOK_OPERATION_IN_PROGRESS", message: "A GitHub webhook operation is already in progress." });
    if (record.registration.state !== ProviderWebhookState.ACTIVE) throw new ConflictException({ code: "PROVIDER_WEBHOOK_REQUIRES_RECONCILIATION", message: "Reconcile the recorded GitHub webhook state before removing it." });
    const result = await dispatchGitHubWebhookDelete(this.prisma, this.credentials, this.adapter, { id: record.registration.id, userId });
    return { ...await this.status(workflowId, userId), operationResult: result.result };
  }

  private async findOwnedRecord(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { publishedVersion: { select: { id: true } } },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { workflowId: workflow.id } });
    const registration = endpoint ? await this.prisma.providerWebhookRegistration.findUnique({ where: { endpointId: endpoint.id } }) : null;
    return { workflow, endpoint, registration };
  }

  private safeStatus(endpoint: { id: string; path: string; workflowVersionId: string; updatedAt: Date } | null, registration: { provider: string; repository: string; event: string; workflowVersionId: string; state: ProviderWebhookState; createdAt: Date; updatedAt: Date } | null) {
    return {
      enabled: process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED === "true",
      endpoint: endpoint ? { id: endpoint.id, path: endpoint.path, workflowVersionId: endpoint.workflowVersionId, updatedAt: endpoint.updatedAt } : null,
      registration: registration ? { provider: registration.provider, repository: registration.repository, event: registration.event, workflowVersionId: registration.workflowVersionId, state: registration.state, createdAt: registration.createdAt, updatedAt: registration.updatedAt } : null,
    };
  }

  private requireEnabled() {
    if (process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED !== "true") throw new BadRequestException({ code: "PROVIDER_WEBHOOK_AUTOMATION_DISABLED", message: "Automatic GitHub webhook registration is disabled until its public HTTPS origin is configured." });
  }
}
