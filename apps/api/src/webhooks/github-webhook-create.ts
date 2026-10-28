import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CredentialService } from "../credentials/credential.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { ProviderWebhookAdapter, ProviderWebhookError } from "./provider-webhook-adapter";
import { ProviderWebhookStateStore } from "./provider-webhook-state";

/** Internal operation, not a route. Caller must use trusted origin when reserving. */
export async function dispatchGitHubWebhookCreate(prisma: PrismaService, credentials: CredentialService, vault: CredentialVaultService, adapter: ProviderWebhookAdapter, input: { id: string; operationId: string; userId: string }) {
  const registration = await prisma.providerWebhookRegistration.findFirst({
    where: { id: input.id, operationId: input.operationId, provider: "GITHUB", endpoint: { workflow: { workspace: { members: { some: { userId: input.userId, role: "OWNER" } } } } } },
    include: { endpoint: { include: { workflow: { select: { workspaceId: true } } } } },
  });
  if (!registration) throw new NotFoundException({ code: "PROVIDER_WEBHOOK_NOT_FOUND", message: "Provider registration was not found." });
  const credential = await credentials.readForExecution(registration.credentialId, registration.endpoint.workflow.workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  const decrypted = vault.decrypt(registration.encryptedSigningSecret);
  const secret = typeof decrypted.secret === "string" ? decrypted.secret : "";
  if (!token || !secret) throw new BadRequestException({ code: "PROVIDER_WEBHOOK_CREDENTIAL_INVALID", message: "The GitHub credential or webhook signing secret is invalid." });
  const states = new ProviderWebhookStateStore(prisma.providerWebhookRegistration);
  if (!await states.beginCreate(registration.id, input.operationId)) throw new ConflictException({ code: "PROVIDER_WEBHOOK_OPERATION_CHANGED", message: "This provider operation has already been started or changed." });
  let outcome: { kind: "created"; hookId: number } | { kind: "rejected" | "uncertain" };
  try {
    const identity = await adapter.create(token, { repository: registration.repository, url: registration.callbackUrl, event: registration.event, secret });
    outcome = { kind: "created", hookId: identity.hookId };
  } catch (error) {
    // An unexpected error may follow a successful remote write. Never retry it automatically.
    outcome = { kind: error instanceof ProviderWebhookError && ["INVALID_INPUT", "FORBIDDEN", "NOT_FOUND", "CONFLICT"].includes(error.code) ? "rejected" : "uncertain" };
  }
  // A lost DB write leaves CREATE_DISPATCHING for recovery to mark uncertain.
  if (!await states.finishCreate(registration.id, input.operationId, outcome)) throw new ConflictException({ code: "PROVIDER_WEBHOOK_OPERATION_CHANGED", message: "The provider result requires reconciliation." });
  return { state: outcome.kind === "created" ? "ACTIVE" : outcome.kind === "rejected" ? "CREATE_REJECTED" : "CREATE_UNCERTAIN" };
}
