import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CredentialProvider, ProviderWebhookState } from "@prisma/client";
import { CredentialService } from "../credentials/credential.service";
import { PrismaService } from "../database/prisma.service";
import { GitHubWebhookAdapter } from "./github-webhook-adapter";
import { ProviderWebhookStateStore } from "./provider-webhook-state";

export type GitHubWebhookReconciliation = {
  outcome: "MATCHED" | "DRIFTED" | "UNKNOWN" | "MANUAL_REQUIRED";
  message: string;
};

/**
 * Re-checks only a provider hook identity already recorded by Fluxora.
 *
 * This deliberately cannot discover hooks by callback URL: a URL is not proof
 * of ownership and GitHub 404 can also mean missing permission. Unknown
 * creation outcomes without a recorded hook ID therefore remain manual.
 */
export async function reconcileGitHubWebhook(
  prisma: PrismaService,
  credentials: CredentialService,
  adapter: GitHubWebhookAdapter,
  input: { id: string; userId: string },
): Promise<GitHubWebhookReconciliation> {
  const registration = await prisma.providerWebhookRegistration.findFirst({
    where: { id: input.id, provider: "GITHUB", endpoint: { workflow: { workspace: { members: { some: { userId: input.userId, role: "OWNER" } } } } } },
    include: { endpoint: { include: { workflow: { select: { workspaceId: true } } } } },
  });
  if (!registration) throw new NotFoundException({ code: "PROVIDER_WEBHOOK_NOT_FOUND", message: "Provider registration was not found." });

  const hookId = registration.remoteHookId === null ? NaN : Number(registration.remoteHookId);
  if (!Number.isSafeInteger(hookId) || hookId <= 0) {
    return { outcome: "MANUAL_REQUIRED", message: "The remote GitHub webhook identity is unknown. Inspect GitHub manually before retrying or removing this registration." };
  }

  const credential = await credentials.readForExecution(registration.credentialId, registration.endpoint.workflow.workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token) throw new BadRequestException({ code: "PROVIDER_WEBHOOK_CREDENTIAL_INVALID", message: "The GitHub credential is invalid." });

  let inspection: Awaited<ReturnType<GitHubWebhookAdapter["inspect"]>>;
  try {
    inspection = await adapter.inspect(token, { repository: registration.repository, hookId }, { url: registration.callbackUrl, event: registration.event });
  } catch {
    return { outcome: "UNKNOWN", message: "GitHub could not verify the recorded webhook. No registration state was changed." };
  }

  if (!inspection.urlMatches || !inspection.eventsMatch || !inspection.active) {
    return { outcome: "DRIFTED", message: "The recorded GitHub webhook no longer matches the published workflow. No remote change was made." };
  }

  if (registration.state === ProviderWebhookState.DELETE_UNCERTAIN) {
    const stateStore = new ProviderWebhookStateStore(prisma.providerWebhookRegistration);
    const restored = await stateStore.restoreDeleteUncertain(registration.id, registration.operationId);
    if (!restored) return { outcome: "UNKNOWN", message: "The registration changed while it was being reconciled. Reload its status before trying again." };
  }

  return { outcome: "MATCHED", message: "The recorded GitHub webhook matches the published workflow and is active." };
}
