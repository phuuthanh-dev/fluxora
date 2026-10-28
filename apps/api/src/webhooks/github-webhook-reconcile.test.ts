import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProviderWebhookState } from "@prisma/client";
import { reconcileGitHubWebhook } from "./github-webhook-reconcile";

function fixture(state: ProviderWebhookState = ProviderWebhookState.DELETE_UNCERTAIN, remoteHookId: bigint | null = 42n) {
  let currentState = state;
  let updates = 0;
  let inspections = 0;
  const registration = {
    id: "registration-1",
    operationId: "delete-operation-1",
    provider: "GITHUB",
    repository: "owner/repo",
    callbackUrl: "https://fluxora.example/webhooks/github-hook",
    event: "push",
    credentialId: "credential-1",
    remoteHookId,
    state,
    endpoint: { workflow: { workspaceId: "workspace-1" } },
  };
  const prisma = {
    providerWebhookRegistration: {
      findFirst: async () => ({ ...registration, state: currentState }),
      updateMany: async ({ where, data }: { where: { id: string; operationId: string; state: ProviderWebhookState }; data: { state: ProviderWebhookState } }) => {
        if (where.id !== registration.id || where.operationId !== registration.operationId || where.state !== currentState) return { count: 0 };
        currentState = data.state;
        updates++;
        return { count: 1 };
      },
    },
  };
  const credentials = { readForExecution: async () => ({ token: "token-private" }) };
  const adapter = {
    inspect: async () => {
      inspections++;
      return { urlMatches: true, eventsMatch: true, active: true };
    },
  };
  return { prisma, credentials, adapter, run: () => reconcileGitHubWebhook(prisma as never, credentials as never, adapter as never, { id: registration.id, userId: "owner-1" }), state: () => currentState, updates: () => updates, inspections: () => inspections };
}

test("reconciliation restores an uncertain delete only after the recorded hook matches", async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { outcome: "MATCHED", message: "The recorded GitHub webhook matches the published workflow and is active." });
  assert.equal(f.state(), ProviderWebhookState.ACTIVE);
  assert.equal(f.updates(), 1);
  assert.equal(f.inspections(), 1);
});

test("reconciliation reports drift without changing ownership state", async () => {
  const f = fixture(ProviderWebhookState.ACTIVE);
  f.adapter.inspect = async () => ({ urlMatches: false, eventsMatch: true, active: true });
  assert.deepEqual(await f.run(), { outcome: "DRIFTED", message: "The recorded GitHub webhook no longer matches the published workflow. No remote change was made." });
  assert.equal(f.state(), ProviderWebhookState.ACTIVE);
  assert.equal(f.updates(), 0);
});

test("ambiguous inspection never converts an uncertain registration into an absent one", async () => {
  const f = fixture();
  f.adapter.inspect = async () => { throw new Error("provider response is private"); };
  assert.deepEqual(await f.run(), { outcome: "UNKNOWN", message: "GitHub could not verify the recorded webhook. No registration state was changed." });
  assert.equal(f.state(), ProviderWebhookState.DELETE_UNCERTAIN);
  assert.equal(f.updates(), 0);
});

test("unknown create identity remains a manual reconciliation boundary without a provider call", async () => {
  const f = fixture(ProviderWebhookState.CREATE_UNCERTAIN, null);
  assert.deepEqual(await f.run(), { outcome: "MANUAL_REQUIRED", message: "The remote GitHub webhook identity is unknown. Inspect GitHub manually before retrying or removing this registration." });
  assert.equal(f.inspections(), 0);
  assert.equal(f.updates(), 0);
});
