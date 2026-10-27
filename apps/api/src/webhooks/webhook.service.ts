import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";
import { CredentialProvider } from "@prisma/client";
import { CredentialService } from "../credentials/credential.service";
import { parseWorkflowGraph } from "../workflows/workflow-graph";

@Injectable()
export class WebhookService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
    @Inject(CredentialService) private readonly credentials: CredentialService,
  ) {}

  async getEndpoint(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { workflowId: workflow.id } });
    return endpoint ? { id: endpoint.id, path: endpoint.path, secretRequired: Boolean(endpoint.secretHash), workflowVersionId: endpoint.workflowVersionId, createdAt: endpoint.createdAt, updatedAt: endpoint.updatedAt } : null;
  }

  async createEndpoint(workflowId: string, userId: string, path: string, secretRequired: boolean) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish this workflow before creating a webhook endpoint." });
    const graph = parseWorkflowGraph(workflow.publishedVersion.graph);
    const githubTrigger = githubIssueOpenedTrigger(graph);
    if (!graph.nodes.some((node) => node.type === "trigger.webhook") && !githubTrigger) {
      throw new BadRequestException({ code: "WEBHOOK_TRIGGER_REQUIRED", message: "Publish a workflow version containing a Webhook or GitHub Issue opened trigger before creating an endpoint." });
    }
    const conflictingEndpoint = await this.prisma.webhookEndpoint.findFirst({ where: { path, NOT: { workflowId } } });
    if (conflictingEndpoint) throw new ConflictException({ code: "WEBHOOK_PATH_IN_USE", message: "This webhook path is already in use by another workflow." });
    if (githubTrigger) await this.requireGitHubWebhookSecret(workflow.workspaceId, githubTrigger.config);
    const secret = githubTrigger ? null : secretRequired ? randomBytes(24).toString("base64url") : null;
    const existing = await this.prisma.webhookEndpoint.findFirst({ where: { workflowId } });
    const endpoint = existing
      ? await this.prisma.webhookEndpoint.update({ where: { id: existing.id }, data: { path, secretHash: secret ? hashWebhookSecret(secret) : null, workflowVersionId: workflow.publishedVersion.id, isActive: true } })
      : await this.prisma.webhookEndpoint.create({ data: { workflowId, workflowVersionId: workflow.publishedVersion.id, path, secretHash: secret ? hashWebhookSecret(secret) : null } });
    await this.prisma.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "webhook.created", targetType: "webhook", targetId: endpoint.id, metadata: { path, secretRequired: Boolean(secretRequired) || Boolean(githubTrigger) } } });
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
    if (!endpoint || !endpoint.isActive || !endpoint.workflow.isActive || endpoint.workflow.archivedAt) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    const graph = parseWorkflowGraph(endpoint.workflowVersion.graph);
    const githubTrigger = githubIssueOpenedTrigger(graph);
    if (githubTrigger) {
      await this.verifyGitHubIssueOpened(endpoint.workflow.workspaceId, githubTrigger.config, payload, githubEventHeaders);
    } else if (endpoint.secretHash && (!secret || !matchesWebhookSecret(secret, endpoint.secretHash))) {
      throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
    }
    const execution = await this.executions.createScheduledExecution(
      endpoint.workflowVersionId,
      payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { payload },
      idempotencyKey ? `webhook:${endpoint.id}:${idempotencyKey}` : undefined,
    );
    await this.queue.dispatch({ executionId: execution.id, mode: "live" });
    return { executionId: execution.id };
  }

  private async requireGitHubWebhookSecret(workspaceId: string, config: Record<string, unknown>) {
    const credentialId = readCredentialId(config);
    if (!credentialId) throw new BadRequestException({ code: "GITHUB_WEBHOOK_CREDENTIAL_REQUIRED", message: "Select a GitHub connector credential with a webhook secret." });
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITHUB);
    if (!readSecret(credential.webhookSecret)) throw new BadRequestException({ code: "GITHUB_WEBHOOK_SECRET_REQUIRED", message: "Add webhookSecret to the selected GitHub connector credential before creating the endpoint." });
  }

  private async verifyGitHubIssueOpened(workspaceId: string, config: Record<string, unknown>, payload: unknown, headers: GitHubEventHeaders) {
    const credentialId = readCredentialId(config);
    const eventName = readString(config.event) ?? "issues";
    const action = readString(config.action) ?? "opened";
    if (headers.githubEvent !== eventName || !isRecord(payload) || payload.action !== action) {
      throw new ForbiddenException({ code: "GITHUB_EVENT_NOT_MATCHED", message: "The GitHub webhook event does not match this trigger." });
    }
    if (!credentialId || !headers.rawBody || !headers.githubSignature) {
      throw new ForbiddenException({ code: "GITHUB_WEBHOOK_SIGNATURE_INVALID", message: "The GitHub webhook signature is invalid." });
    }
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITHUB);
    const webhookSecret = readSecret(credential.webhookSecret);
    if (!webhookSecret || !verifyGitHubWebhookSignature(headers.rawBody, headers.githubSignature, webhookSecret)) {
      throw new ForbiddenException({ code: "GITHUB_WEBHOOK_SIGNATURE_INVALID", message: "The GitHub webhook signature is invalid." });
    }
  }
}

export type GitHubEventHeaders = { githubEvent?: string; githubSignature?: string; rawBody?: Buffer };

function githubIssueOpenedTrigger(graph: ReturnType<typeof parseWorkflowGraph>) {
  return graph.nodes.find((node) => node.type === "trigger.github.issue-opened");
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
