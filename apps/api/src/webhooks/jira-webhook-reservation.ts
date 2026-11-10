import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { parseStoredWorkflowGraph } from "../workflows/workflow-graph";
import { jiraIssueEvents, type JiraIssueEvent } from "./jira-webhook-adapter";
import { jiraDeliveryToken } from "./jira-trigger-protocol";

/** Reserve a single immutable remote operation before contacting Atlassian. */
export async function reserveJiraWebhook(prisma: PrismaService, vault: CredentialVaultService, input: { workflowId: string; userId: string; versionId: string; endpointId: string; endpointUpdatedAt: Date; apiOrigin: string; clientSecret: string | undefined }) {
  let origin: URL;
  try { origin = new URL(input.apiOrigin); } catch { throw invalidOrigin(); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw invalidOrigin();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workflow" WHERE id = ${input.workflowId} FOR UPDATE`;
      const workflow = await tx.workflow.findFirst({ where: { id: input.workflowId, workspace: { members: { some: { userId: input.userId, role: "OWNER" } } } }, include: { publishedVersion: true } });
      if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
      if (!workflow.publishedVersion || workflow.publishedVersion.id !== input.versionId) throw changed();
      const endpoint = await tx.webhookEndpoint.findFirst({ where: { id: input.endpointId, workflowId: workflow.id } });
      if (!endpoint || !endpoint.isActive || endpoint.workflowVersionId !== input.versionId || endpoint.updatedAt.getTime() !== input.endpointUpdatedAt.getTime() || !endpoint.encryptedSigningSecret || !endpoint.secretHash) throw changed();
      const triggers = parseStoredWorkflowGraph(workflow.publishedVersion.graph).nodes.filter((node) => node.type.startsWith("trigger."));
      const trigger = triggers[0];
      if (triggers.length !== 1 || trigger?.type !== "trigger.jira.issue") throw new BadRequestException({ code: "JIRA_TRIGGER_REQUIRED", message: "Publish a workflow with a Jira issue trigger." });
      const credentialId = typeof trigger.config.credentialId === "string" ? trigger.config.credentialId.trim() : "";
      const projectId = typeof trigger.config.project === "string" ? trigger.config.project.trim() : "";
      const event = trigger.config.event;
      if (!/^\d{1,20}$/.test(projectId) || typeof event !== "string" || !jiraIssueEvents.includes(event as JiraIssueEvent)) throw new BadRequestException({ code: "JIRA_TRIGGER_INVALID", message: "Select a Jira project and issue event." });
      await tx.$queryRaw`SELECT id FROM "Credential" WHERE id = ${credentialId} AND "workspaceId" = ${workflow.workspaceId} FOR UPDATE`;
      const credential = await tx.credential.findFirst({ where: { id: credentialId, workspaceId: workflow.workspaceId, provider: CredentialProvider.JIRA } });
      if (!credential) throw new BadRequestException({ code: "JIRA_CREDENTIAL_REQUIRED", message: "Select a Jira connection from this workspace." });
      const data = vault.decrypt(credential.encryptedData);
      if (typeof data.cloudId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.cloudId) || !Array.isArray(data.grantedScopes) || !data.grantedScopes.includes("manage:jira-webhook")) throw new BadRequestException({ code: "JIRA_WEBHOOK_ACCESS_REQUIRED", message: "Reconnect Jira with trigger access before registering this webhook." });
      const existing = await tx.providerWebhookRegistration.findUnique({ where: { endpointId: endpoint.id }, select: { id: true, state: true } });
      if (existing && existing.state !== "REMOVED" && existing.state !== "CREATE_REJECTED") throw new ConflictException({ code: "PROVIDER_WEBHOOK_EXISTS", message: "A provider registration already exists for this endpoint." });
      const clientSecret = input.clientSecret;
      if (!clientSecret) throw invalidOrigin();
      const callback = new URL(`/api/v1/webhooks/${encodeURIComponent(endpoint.path)}`, origin);
      callback.searchParams.set("delivery", jiraDeliveryToken(clientSecret, endpoint.id));
      const reservation = { provider: "JIRA", repository: `${data.cloudId.toLowerCase()}:${projectId}`, event, callbackUrl: callback.toString(), credentialId, workflowVersionId: input.versionId, encryptedSigningSecret: endpoint.encryptedSigningSecret, state: "CREATING" as const, operationId: randomUUID(), remoteHookId: null };
      return existing
        ? await tx.providerWebhookRegistration.update({ where: { id: existing.id }, data: reservation, select: { id: true, operationId: true } })
        : await tx.providerWebhookRegistration.create({ data: { endpointId: endpoint.id, ...reservation }, select: { id: true, operationId: true } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException({ code: "PROVIDER_WEBHOOK_EXISTS", message: "A provider registration already exists for this endpoint." });
    throw error;
  }
}

function invalidOrigin() { return new BadRequestException({ code: "PUBLIC_API_ORIGIN_INVALID", message: "Configure a public HTTPS API origin before creating a Jira webhook." }); }
function changed() { return new ConflictException({ code: "WEBHOOK_REGISTRATION_CHANGED", message: "The published workflow or webhook endpoint changed. Reload before trying again." }); }
