import { ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CredentialService } from "../credentials/credential.service";
import { ProviderWebhookError } from "./provider-webhook-adapter";
import { JiraWebhookAdapter, jiraIssueEvents, type JiraIssueEvent } from "./jira-webhook-adapter";
import { ProviderWebhookStateStore } from "./provider-webhook-state";

/** Never repeat an ambiguous remote registration: it may already exist. */
export async function dispatchJiraWebhookCreate(prisma: PrismaService, credentials: CredentialService, adapter: JiraWebhookAdapter, input: { id: string; operationId: string; userId: string }) {
  const registration = await prisma.providerWebhookRegistration.findFirst({
    where: { id: input.id, operationId: input.operationId, provider: "JIRA", endpoint: { workflow: { workspace: { members: { some: { userId: input.userId, role: "OWNER" } } } } } },
    include: { endpoint: { include: { workflow: { select: { workspaceId: true } } } } },
  });
  if (!registration) throw new NotFoundException({ code: "PROVIDER_WEBHOOK_NOT_FOUND", message: "Provider registration was not found." });
  const [cloudId = "", projectId = "", extra] = registration.repository.split(":");
  if (extra !== undefined || !cloudId || !/^\d{1,20}$/.test(projectId) || !jiraIssueEvents.includes(registration.event as JiraIssueEvent)) throw new ConflictException({ code: "PROVIDER_WEBHOOK_IDENTITY_UNKNOWN", message: "The Jira registration must be reviewed." });
  const states = new ProviderWebhookStateStore(prisma.providerWebhookRegistration);
  if (!await states.beginCreate(registration.id, input.operationId)) throw changed();
  let outcome: { kind: "created"; hookId: number } | { kind: "rejected" | "uncertain" };
  try {
    const workspaceId = registration.endpoint.workflow.workspaceId;
    const hookId = await credentials.runJiraOperation(registration.credentialId, workspaceId, async () => {
      const credential = await credentials.readForExecution(registration.credentialId, workspaceId, CredentialProvider.JIRA);
      if (credential.cloudId !== cloudId || typeof credential.accessToken !== "string" || !Array.isArray(credential.grantedScopes) || !credential.grantedScopes.includes("manage:jira-webhook")) throw new ProviderWebhookError("INVALID_INPUT", false);
      return adapter.create({ cloudId, accessToken: credential.accessToken }, { url: registration.callbackUrl, projectId, event: registration.event as JiraIssueEvent });
    });
    outcome = { kind: "created", hookId };
  } catch (error) {
    // Authentication/reconnect exceptions can arise before or after dispatch;
    // keep unknown outcomes for explicit reconciliation.
    outcome = { kind: error instanceof ProviderWebhookError && ["INVALID_INPUT", "FORBIDDEN", "CONFLICT"].includes(error.code) ? "rejected" : "uncertain" };
  }
  if (!await states.finishCreate(registration.id, input.operationId, outcome)) throw changed();
  return { state: outcome.kind === "created" ? "ACTIVE" : outcome.kind === "rejected" ? "CREATE_REJECTED" : "CREATE_UNCERTAIN" };
}

function changed() { return new ConflictException({ code: "PROVIDER_WEBHOOK_OPERATION_CHANGED", message: "The provider result requires reconciliation." }); }
