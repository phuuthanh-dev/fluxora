import assert from "node:assert/strict";
import test from "node:test";
import { ProviderWebhookState } from "@prisma/client";
import { GitHubWebhookManagementService } from "./github-webhook-management.service";

function service() {
  const prisma = {
    workflow: { findFirst: async () => ({ publishedVersion: { id: "version-1" } }) },
    webhookEndpoint: { findFirst: async () => ({ id: "endpoint-1", path: "github-hook", workflowVersionId: "version-1", updatedAt: new Date("2026-01-01T00:00:00.000Z") }) },
    providerWebhookRegistration: { findUnique: async () => ({ provider: "GITHUB", repository: "ithelpdesk/livestream", event: "push", workflowVersionId: "version-1", state: ProviderWebhookState.ACTIVE, createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z"), id: "registration-1", remoteHookId: 99n, callbackUrl: "https://private.example/hook", encryptedSigningSecret: "private" }) },
  };
  return new GitHubWebhookManagementService(prisma as never, {} as never, {} as never, {} as never);
}

test("provider status exposes lifecycle metadata but no provider identity or secret", async () => {
  const previous = process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED;
  process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED = "false";
  try {
    const status = await service().status("workflow-1", "owner-1");
    assert.equal(status.enabled, false);
    assert.equal(status.registration?.state, "ACTIVE");
    assert.equal("remoteHookId" in (status.registration ?? {}), false);
    assert.equal("callbackUrl" in (status.registration ?? {}), false);
    assert.equal("encryptedSigningSecret" in (status.registration ?? {}), false);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED;
    else process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED = previous;
  }
});

test("provider mutations stay disabled until the lifecycle flag is enabled", async () => {
  const previous = process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED;
  delete process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED;
  try {
    await assert.rejects(() => service().create("workflow-1", "owner-1"), (error: unknown) => typeof error === "object" && error !== null && "response" in error && (error as { response?: { code?: string } }).response?.code === "PROVIDER_WEBHOOK_AUTOMATION_DISABLED");
  } finally {
    if (previous === undefined) delete process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED;
    else process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED = previous;
  }
});
