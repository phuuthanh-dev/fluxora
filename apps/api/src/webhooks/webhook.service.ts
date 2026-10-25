import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";
import { parseWorkflowGraph } from "../workflows/workflow-graph";

@Injectable()
export class WebhookService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
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
    if (!graph.nodes.some((node) => node.type === "trigger.webhook")) {
      throw new BadRequestException({ code: "WEBHOOK_TRIGGER_REQUIRED", message: "Publish a workflow version containing a Webhook trigger before creating an endpoint." });
    }
    const conflictingEndpoint = await this.prisma.webhookEndpoint.findFirst({ where: { path, NOT: { workflowId } } });
    if (conflictingEndpoint) throw new ConflictException({ code: "WEBHOOK_PATH_IN_USE", message: "This webhook path is already in use by another workflow." });
    const secret = secretRequired ? randomBytes(24).toString("base64url") : null;
    const existing = await this.prisma.webhookEndpoint.findFirst({ where: { workflowId } });
    const endpoint = existing
      ? await this.prisma.webhookEndpoint.update({ where: { id: existing.id }, data: { path, secretHash: secret ? hashWebhookSecret(secret) : null, workflowVersionId: workflow.publishedVersion.id, isActive: true } })
      : await this.prisma.webhookEndpoint.create({ data: { workflowId, workflowVersionId: workflow.publishedVersion.id, path, secretHash: secret ? hashWebhookSecret(secret) : null } });
    await this.prisma.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "webhook.created", targetType: "webhook", targetId: endpoint.id, metadata: { path, secretRequired } } });
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

  async receive(path: string, secret: string | undefined, payload: unknown, idempotencyKey?: string) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { path }, include: { workflow: true } });
    if (!endpoint || !endpoint.isActive || !endpoint.workflow.isActive || endpoint.workflow.archivedAt) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    if (endpoint.secretHash && (!secret || !matchesWebhookSecret(secret, endpoint.secretHash))) {
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
}

export function hashWebhookSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function matchesWebhookSecret(value: string, expected: string) {
  const actual = Buffer.from(hashWebhookSecret(value), "hex");
  const known = Buffer.from(expected, "hex");
  return actual.length === known.length && timingSafeEqual(actual, known);
}
