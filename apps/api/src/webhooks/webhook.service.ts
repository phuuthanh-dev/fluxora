import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";

@Injectable()
export class WebhookService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
  ) {}

  async createEndpoint(workflowId: string, userId: string, path: string, secretRequired: boolean) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { publishedVersion: true },
    });
    if (!workflow?.publishedVersion) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish this workflow before creating a webhook endpoint." });
    const secret = secretRequired ? randomBytes(24).toString("base64url") : null;
    const existing = await this.prisma.webhookEndpoint.findFirst({ where: { workflowId } });
    const endpoint = existing
      ? await this.prisma.webhookEndpoint.update({ where: { id: existing.id }, data: { path, secretHash: secret ? hash(secret) : null, workflowVersionId: workflow.publishedVersion.id, isActive: true } })
      : await this.prisma.webhookEndpoint.create({ data: { workflowId, workflowVersionId: workflow.publishedVersion.id, path, secretHash: secret ? hash(secret) : null } });
    await this.prisma.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "webhook.created", targetType: "webhook", targetId: endpoint.id, metadata: { path, secretRequired } } });
    return { id: endpoint.id, path: endpoint.path, secret };
  }

  async receive(path: string, secret: string | undefined, payload: unknown) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { path } });
    if (!endpoint || !endpoint.isActive) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook endpoint was not found." });
    if (endpoint.secretHash && (!secret || !matchesHash(secret, endpoint.secretHash))) {
      throw new ForbiddenException({ code: "WEBHOOK_SECRET_INVALID", message: "Webhook secret is invalid." });
    }
    const execution = await this.executions.createScheduledExecution(endpoint.workflowVersionId, payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : { payload });
    await this.queue.dispatch({ executionId: execution.id, mode: "live" });
    return { executionId: execution.id };
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function matchesHash(value: string, expected: string) {
  const actual = Buffer.from(hash(value), "hex");
  const known = Buffer.from(expected, "hex");
  return actual.length === known.length && timingSafeEqual(actual, known);
}
