import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProviderWebhookError } from "./provider-webhook-adapter";
import { dispatchJiraWebhookCreate } from "./jira-webhook-create";

function fixture() {
  let state = "CREATING", calls = 0;
  let id: bigint | undefined;
  const cloudId = "12345678-1234-1234-1234-123456789abc";
  const registration = { id: "reg", operationId: "op", repository: `${cloudId}:10001`, callbackUrl: "https://example.invalid/webhooks/one", event: "jira:issue_created", credentialId: "cred", endpoint: { workflow: { workspaceId: "workspace" } } };
  const prisma = { providerWebhookRegistration: {
    findFirst: async () => registration,
    updateMany: async ({ where, data }: { where: { state: string; operationId: string }; data: { state: string; remoteHookId?: bigint } }) => {
      if (state !== where.state || where.operationId !== "op") return { count: 0 };
      state = data.state; id = data.remoteHookId; return { count: 1 };
    },
  } };
  const credentials = { readForExecution: async () => ({ cloudId, accessToken: "synthetic-token", grantedScopes: ["manage:jira-webhook"] }), runJiraOperation: async (_id: string, _workspace: string, operation: () => Promise<number>) => operation() };
  const adapter = { create: async () => { calls++; return 42; } };
  const run = () => dispatchJiraWebhookCreate(prisma as never, credentials as never, adapter as never, { id: "reg", operationId: "op", userId: "owner" });
  return { run, adapter, state: () => state, id: () => id, calls: () => calls };
}

test("concurrent Jira registrations dispatch only once", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.run(), f.run()]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(f.calls(), 1);
  assert.equal(f.state(), "ACTIVE");
  assert.equal(f.id(), 42n);
});

test("ambiguous Jira writes remain uncertain and cannot be retried blindly", async () => {
  const f = fixture();
  f.adapter.create = async () => { throw new Error("synthetic-token"); };
  assert.deepEqual(await f.run(), { state: "CREATE_UNCERTAIN" });
  await assert.rejects(f.run());
});

test("definite Jira access denial is recorded as rejected", async () => {
  const f = fixture();
  f.adapter.create = async () => { throw new ProviderWebhookError("FORBIDDEN", false); };
  assert.deepEqual(await f.run(), { state: "CREATE_REJECTED" });
});
