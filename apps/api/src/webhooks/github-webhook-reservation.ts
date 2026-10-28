import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { parseWorkflowGraph } from "../workflows/workflow-graph";

const eventByType: Record<string, string> = {
  "trigger.github.issue-opened": "issues",
  "trigger.github.pull-request-opened": "pull_request",
  "trigger.github.push": "push",
  "trigger.github.workflow-run-completed": "workflow_run",
};

/** Internal only: apiOrigin must come from trusted server configuration, never the request.
 * Never invoke GitHub before the reservation transaction commits. */
export async function reserveGitHubWebhook(prisma: PrismaService, input: { workflowId: string; userId: string; versionId: string; endpointId: string; endpointUpdatedAt: Date; apiOrigin: string }) {
  let origin: URL;
  try { origin = new URL(input.apiOrigin); } catch { throw invalidOrigin(); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw invalidOrigin();
  try {
    return await prisma.$transaction(async (tx) => {
      // Serializes with manual endpoint creation/rotation. Ownership is checked
      // after the lock and before any data is returned or provider call made.
      await tx.$queryRaw`SELECT id FROM "Workflow" WHERE id = ${input.workflowId} FOR UPDATE`;
      const workflow = await tx.workflow.findFirst({ where: { id: input.workflowId, workspace: { members: { some: { userId: input.userId, role: "OWNER" } } } }, include: { publishedVersion: true } });
      if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
      if (!workflow.publishedVersion || workflow.publishedVersion.id !== input.versionId) throw changed();
      const endpoint = await tx.webhookEndpoint.findFirst({ where: { id: input.endpointId, workflowId: workflow.id } });
      if (!endpoint || endpoint.workflowVersionId !== input.versionId || endpoint.updatedAt.getTime() !== input.endpointUpdatedAt.getTime() || !endpoint.isActive || !endpoint.encryptedSigningSecret) throw changed();
      const triggers = parseWorkflowGraph(workflow.publishedVersion.graph).nodes.filter((node) => node.type.startsWith("trigger."));
      const trigger = triggers[0];
      const event = trigger && eventByType[trigger.type];
      if (triggers.length !== 1 || !trigger || !event) throw new BadRequestException({ code: "GITHUB_TRIGGER_REQUIRED", message: "Publish a workflow with a GitHub event trigger." });
      const repository = typeof trigger.config.repository === "string" ? trigger.config.repository.trim().toLowerCase() : "";
      const credentialId = typeof trigger.config.credentialId === "string" ? trigger.config.credentialId.trim() : "";
      if (!/^[a-z0-9_.-]{1,100}\/[a-z0-9_.-]{1,100}$/.test(repository) || repository.split("/").some((part) => part === "." || part === "..")) throw new BadRequestException({ code: "GITHUB_REPOSITORY_REQUIRED", message: "Select one GitHub repository before setting up automatic registration." });
      const credential = await tx.credential.findFirst({ where: { id: credentialId, workspaceId: workflow.workspaceId, provider: CredentialProvider.GITHUB }, select: { id: true } });
      if (!credential) throw new BadRequestException({ code: "GITHUB_CREDENTIAL_REQUIRED", message: "Select a GitHub credential from this workspace." });
      const callbackUrl = new URL(`/webhooks/${encodeURIComponent(endpoint.path)}`, origin).toString();
      const existing = await tx.providerWebhookRegistration.findUnique({ where: { endpointId: endpoint.id }, select: { id: true, state: true } });
      if (existing && existing.state !== "REMOVED" && existing.state !== "CREATE_REJECTED") {
        throw new ConflictException({ code: "PROVIDER_WEBHOOK_EXISTS", message: "A provider registration already exists for this endpoint." });
      }
      const data = { provider: "GITHUB", repository, event, callbackUrl, credentialId, workflowVersionId: input.versionId, encryptedSigningSecret: endpoint.encryptedSigningSecret, state: "CREATING" as const, operationId: randomUUID(), remoteHookId: null };
      return existing
        ? await tx.providerWebhookRegistration.update({ where: { id: existing.id }, data, select: { id: true, operationId: true } })
        : await tx.providerWebhookRegistration.create({ data: { endpointId: endpoint.id, ...data }, select: { id: true, operationId: true } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException({ code: "PROVIDER_WEBHOOK_EXISTS", message: "A provider registration already exists for this endpoint." });
    throw error;
  }
}

function invalidOrigin() { return new BadRequestException({ code: "PUBLIC_API_ORIGIN_INVALID", message: "Configure a public HTTPS API origin before creating a GitHub webhook." }); }
function changed() { return new ConflictException({ code: "WEBHOOK_REGISTRATION_CHANGED", message: "The published workflow or webhook endpoint changed. Reload before trying again." }); }
