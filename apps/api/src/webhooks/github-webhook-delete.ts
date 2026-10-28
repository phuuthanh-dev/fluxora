import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CredentialService } from "../credentials/credential.service";
import { ProviderWebhookAdapter, ProviderWebhookError } from "./provider-webhook-adapter";
import { ProviderWebhookStateStore } from "./provider-webhook-state";

/** Internal operation only. A caller may never supply the provider hook identity. */
export async function dispatchGitHubWebhookDelete(prisma: PrismaService, credentials: CredentialService, adapter: ProviderWebhookAdapter, input: { id: string; userId: string }) {
  const registration = await prisma.providerWebhookRegistration.findFirst({
    where: { id: input.id, provider: "GITHUB", endpoint: { workflow: { workspace: { members: { some: { userId: input.userId, role: "OWNER" } } } } } },
    include: { endpoint: { include: { workflow: { select: { workspaceId: true } } } } },
  });
  if (!registration) throw new NotFoundException({ code: "PROVIDER_WEBHOOK_NOT_FOUND", message: "Provider registration was not found." });
  const hookId = registration.remoteHookId === null ? NaN : Number(registration.remoteHookId);
  if (!Number.isSafeInteger(hookId) || hookId <= 0) throw new ConflictException({ code: "PROVIDER_WEBHOOK_IDENTITY_UNKNOWN", message: "The provider webhook identity is unknown and must be reconciled." });
  const credential = await credentials.readForExecution(registration.credentialId, registration.endpoint.workflow.workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new BadRequestException({ code: "PROVIDER_WEBHOOK_CREDENTIAL_INVALID", message: "The GitHub credential is invalid." });
  const states = new ProviderWebhookStateStore(prisma.providerWebhookRegistration);
  const operationId = randomUUID();
  if (!await states.beginDelete(registration.id, registration.operationId, operationId)) throw new ConflictException({ code: "PROVIDER_WEBHOOK_OPERATION_CHANGED", message: "This provider operation has already been started or changed." });
  const identity = { repository: registration.repository, hookId };
  let inspection;
  try { inspection = await adapter.inspect(token, identity, { url: registration.callbackUrl, event: registration.event }); }
  catch {
    // No DELETE has been issued: retain the recorded identity and report that
    // verification failed. 404 may mean insufficient access, not absence.
    if (!await states.finishDelete(registration.id, operationId, "rejected")) throw changed();
    return { state: "ACTIVE", result: "INSPECTION_FAILED" };
  }
  if (!inspection.urlMatches || !inspection.eventsMatch || !inspection.active) {
    if (!await states.finishDelete(registration.id, operationId, "rejected")) throw changed();
    return { state: "ACTIVE", result: "PROVIDER_CONFIGURATION_CHANGED" };
  }
  let outcome: "removed" | "rejected" | "uncertain";
  try { await adapter.remove(token, identity); outcome = "removed"; }
  catch (error) {
    // GitHub can obscure missing access with 404. Neither 404 nor a failed
    // response proves the remote webhook is absent.
    outcome = error instanceof ProviderWebhookError && ["INVALID_INPUT", "FORBIDDEN", "CONFLICT"].includes(error.code) ? "rejected" : "uncertain";
  }
  if (!await states.finishDelete(registration.id, operationId, outcome)) throw changed();
  return { state: outcome === "removed" ? "REMOVED" : outcome === "rejected" ? "ACTIVE" : "DELETE_UNCERTAIN", result: outcome.toUpperCase() };
}

function changed() { return new ConflictException({ code: "PROVIDER_WEBHOOK_OPERATION_CHANGED", message: "The provider result requires reconciliation." }); }
