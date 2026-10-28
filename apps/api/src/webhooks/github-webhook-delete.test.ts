import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProviderWebhookError } from "./provider-webhook-adapter";
import { dispatchGitHubWebhookDelete } from "./github-webhook-delete";

function fixture() {
  let state = "ACTIVE";
  let op = "create-op";
  let removed = 0;
  const registration = { id: "reg", operationId: "create-op", repository: "owner/repo", remoteHookId: 42n, callbackUrl: "https://example.invalid/webhook", event: "push", credentialId: "cred", endpoint: { workflow: { workspaceId: "space" } } };
  const prisma = { providerWebhookRegistration: {
    findFirst: async () => ({ ...registration, operationId: op }),
    updateMany: async ({ where, data }: { where: { state: string; operationId: string }; data: { state: string; operationId?: string } }) => {
      if (state !== where.state || op !== where.operationId) return { count: 0 };
      state = data.state; op = data.operationId ?? op; return { count: 1 };
    },
  } };
  const credentials = { readForExecution: async () => ({ token: "private-token" }) };
  const adapter = {
    inspect: async () => ({ urlMatches: true, eventsMatch: true, active: true }),
    remove: async (_token: string, identity: { repository: string; hookId: number }) => { assert.deepEqual(identity, { repository: "owner/repo", hookId: 42 }); removed++; },
  };
  const run = () => dispatchGitHubWebhookDelete(prisma as never, credentials as never, adapter as never, { id: "reg", userId: "owner" });
  return { run, adapter, registration, state: () => state, removed: () => removed };
}

test("concurrent deletions use the recorded identity and issue one delete", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.run(), f.run()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.removed(), 1);
  assert.equal(f.state(), "REMOVED");
});

test("changed provider settings or failed inspection do not issue a delete", async () => {
  const f = fixture();
  f.adapter.inspect = async () => ({ urlMatches: false, eventsMatch: true, active: true });
  assert.deepEqual(await f.run(), { state: "ACTIVE", result: "PROVIDER_CONFIGURATION_CHANGED" });
  assert.equal(f.removed(), 0);
  const g = fixture();
  g.adapter.inspect = async () => { throw new ProviderWebhookError("NOT_FOUND", false); };
  assert.deepEqual(await g.run(), { state: "ACTIVE", result: "INSPECTION_FAILED" });
  assert.equal(g.removed(), 0);
});

test("ambiguous deletion including GitHub 404 is never treated as success", async () => {
  const f = fixture();
  f.adapter.remove = async () => { throw new ProviderWebhookError("NOT_FOUND", false); };
  assert.deepEqual(await f.run(), { state: "DELETE_UNCERTAIN", result: "UNCERTAIN" });
  assert.equal(f.state(), "DELETE_UNCERTAIN");
  await assert.rejects(f.run());
});

test("refuses missing or unsafe provider IDs without making a provider request", async () => {
  const f = fixture();
  f.registration.remoteHookId = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  await assert.rejects(f.run());
  assert.equal(f.removed(), 0);
});
