import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";
import { CredentialProvider } from "@prisma/client";
import { CredentialService } from "../credentials/credential.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { parseWorkflowGraph } from "../workflows/workflow-graph";

@Injectable()
export class WebhookService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
    @Inject(CredentialService) private readonly credentials: CredentialService,
    @Inject(CredentialVaultService) private readonly vault: CredentialVaultService = new CredentialVaultService(),
  ) {}

  async getEndpoint(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { workflowId: workflow.id } });
    return endpoint ? { id: endpoint.id, path: endpoint.path, secretRequired: Boolean(endpoint.secretHash || endpoint.encryptedSigningSecret), signingMode: endpoint.encryptedSigningSecret ? "registration" : "legacy", workflowVersionId: endpoint.workflowVersionId, createdAt: endpoint.createdAt, updatedAt: endpoint.updatedAt } : null;
  }

  async createEndpoint(workflowId: string, userId: string, path: string, secretRequired: boolean) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish this workflow before creating a webhook endpoint." });
    const graph = parseWorkflowGraph(workflow.publishedVersion.graph);
    const githubTrigger = githubWebhookTrigger(graph);
    if (!graph.nodes.some((node) => node.type === "trigger.webhook") && !githubTrigger) {
      throw new BadRequestException({ code: "WEBHOOK_TRIGGER_REQUIRED", message: "Publish a workflow version containing a Webhook or GitHub event trigger before creating an endpoint." });
    }
    const conflictingEndpoint = await this.prisma.webhookEndpoint.findFirst({ where: { path, NOT: { workflowId } } });
    if (conflictingEndpoint) throw new ConflictException({ code: "WEBHOOK_PATH_IN_USE", message: "This webhook path is already in use by another workflow." });
    const secret = githubTrigger || secretRequired ? randomBytes(24).toString("base64url") : null;
    const encryptedSigningSecret = githubTrigger && secret ? this.vault.encrypt({ secret }) : null;
    const publishedVersionId = workflow.publishedVersion.id;
    const endpoint = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.webhookEndpoint.findFirst({ where: { workflowId } });
      const saved = existing
        ? await transaction.webhookEndpoint.update({ where: { id: existing.id }, data: { path, secretHash: !githubTrigger && secret ? hashWebhookSecret(secret) : null, encryptedSigningSecret, workflowVersionId: publishedVersionId, isActive: true } })
        : await transaction.webhookEndpoint.create({ data: { workflowId, workflowVersionId: publishedVersionId, path, secretHash: !githubTrigger && secret ? hashWebhookSecret(secret) : null, encryptedSigningSecret } });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "webhook.created", targetType: "webhook", targetId: saved.id, metadata: { path, secretRequired: Boolean(secretRequired) || Boolean(githubTrigger) } } });
      return saved;
    });
    return { id: endpoint.id, path: endpoint.path, secret };
  }

  private async findOwned(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    return workflow;
  }

  async receive(path: string, secret: string | undefined, payload: unknown, idempotencyKey?: string, githubEventHeaders: GitHubEventHeaders = {}) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { path }, include: { workflow: true, workflowVersion: true } });
    if (!endpoint || !endpoint.isActive || endpoint.workflow.archivedAt) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    const graph = parseWorkflowGraph(endpoint.workflowVersion.graph);
    const githubTrigger = githubWebhookTrigger(graph);
    if (githubTrigger) {
      await this.verifyGitHubWebhook(endpoint.workflow.workspaceId, githubTrigger.config, payload, githubEventHeaders, endpoint.encryptedSigningSecret);
      if (githubEventHeaders.githubEvent === "ping") return { acknowledged: true };
    } else if (endpoint.secretHash && (!secret || !matchesWebhookSecret(secret, endpoint.secretHash))) {
      throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
    }
    if (!endpoint.workflow.isActive) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    const deliveryKey = githubTrigger && githubEventHeaders.githubDelivery ? `github:${githubEventHeaders.githubDelivery}` : idempotencyKey;
    const execution = await this.executions.createScheduledExecution(
      endpoint.workflowVersionId,
      payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { payload },
      deliveryKey ? `webhook:${endpoint.id}:${deliveryKey}` : undefined,
    );
    await this.queue.dispatch({ executionId: execution.id, mode: "live" });
    return { executionId: execution.id };
  }

  private async verifyGitHubWebhook(workspaceId: string, config: Record<string, unknown>, payload: unknown, headers: GitHubEventHeaders, encryptedSigningSecret: string | null) {
    const credentialId = readCredentialId(config);
    if (!headers.rawBody || !headers.githubSignature) {
      throw new ForbiddenException({ code: "GITHUB_WEBHOOK_SIGNATURE_INVALID", message: "The GitHub webhook signature is invalid." });
    }
    const credential = !encryptedSigningSecret && credentialId ? await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITHUB) : null;
    const webhookSecret = encryptedSigningSecret ? readSecret(this.vault.decrypt(encryptedSigningSecret).secret) : readSecret(credential?.webhookSecret);
    if (!webhookSecret || !verifyGitHubWebhookSignature(headers.rawBody, headers.githubSignature, webhookSecret)) {
      throw new ForbiddenException({ code: "GITHUB_WEBHOOK_SIGNATURE_INVALID", message: "The GitHub webhook signature is invalid." });
    }
    const eventName = readString(config.event) ?? "issues";
    const action = readString(config.action) ?? (eventName === "issues" || eventName === "pull_request" ? "opened" : null);
    if (!isRecord(payload) || (headers.githubEvent !== "ping" && (headers.githubEvent !== eventName || (action && payload.action !== action)))) {
      throw new ForbiddenException({ code: "GITHUB_EVENT_NOT_MATCHED", message: "The GitHub webhook event does not match this trigger." });
    }
    const repositoryFilter = readString(config.repository);
    const repositoryName = isRecord(payload.repository) ? readString(payload.repository.full_name) : null;
    if (repositoryFilter && repositoryName !== repositoryFilter) {
      throw new ForbiddenException({ code: "GITHUB_REPOSITORY_NOT_MATCHED", message: "The GitHub webhook repository does not match this trigger." });
    }
  }
}

export type GitHubEventHeaders = { githubEvent?: string; githubSignature?: string; githubDelivery?: string; rawBody?: Buffer };

function githubWebhookTrigger(graph: ReturnType<typeof parseWorkflowGraph>) {
  return graph.nodes.find((node) => node.type === "trigger.github.issue-opened" || node.type === "trigger.github.pull-request-opened" || node.type === "trigger.github.push" || node.type === "trigger.github.workflow-run-completed");
}

function readCredentialId(config: Record<string, unknown>) {
  return typeof config.credentialId === "string" && config.credentialId.trim() ? config.credentialId.trim() : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSecret(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function hashWebhookSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function matchesWebhookSecret(value: string, expected: string) {
  const actual = Buffer.from(hashWebhookSecret(value), "hex");
  const known = Buffer.from(expected, "hex");
  return actual.length === known.length && timingSafeEqual(actual, known);
}

export function verifyGitHubWebhookSignature(rawBody: Buffer, signature: string, secret: string) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const actual = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = signature.slice("sha256=".length);
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
