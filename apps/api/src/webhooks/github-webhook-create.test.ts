import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProviderWebhookError } from "./provider-webhook-adapter";
import { dispatchGitHubWebhookCreate } from "./github-webhook-create";

function fixture() {
  let state = "CREATING";
  let id: bigint | undefined;
  let calls = 0;
  const registration = { id: "reg", operationId: "op", repository: "owner/repo", callbackUrl: "https://example.invalid/webhooks/one", event: "push", credentialId: "cred", encryptedSigningSecret: "cipher", endpoint: { workflow: { workspaceId: "workspace" } } };
  const prisma = { providerWebhookRegistration: {
    findFirst: async () => registration,
    updateMany: async ({ where, data }: { where: { state: string; operationId: string }; data: { state: string; remoteHookId?: bigint } }) => {
      if (state !== where.state || where.operationId !== "op") return { count: 0 };
      state = data.state; id = data.remoteHookId; return { count: 1 };
    },
  } };
  const credentials = { readForExecution: async () => ({ token: "token-private" }) };
  const vault = { decrypt: () => ({ secret: "secret-private" }) };
  const adapter = { create: async () => { calls++; return { repository: "owner/repo", hookId: 42 }; } };
  const run = () => dispatchGitHubWebhookCreate(prisma as never, credentials as never, vault as never, adapter as never, { id: "reg", operationId: "op", userId: "owner" });
  return { run, adapter, state: () => state, id: () => id, calls: () => calls };
}

test("concurrent create dispatches make only one provider request", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.run(), f.run()]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(f.calls(), 1);
  assert.equal(f.state(), "ACTIVE");
  assert.equal(f.id(), 42n);
});

test("unknown provider outcomes are not retried or exposed", async () => {
  const f = fixture();
  f.adapter.create = async () => { throw new Error("token-private secret-private"); };
  assert.deepEqual(await f.run(), { state: "CREATE_UNCERTAIN" });
  assert.equal(f.state(), "CREATE_UNCERTAIN");
  await assert.rejects(f.run());
});

test("definitive provider denial records a rejected create", async () => {
  const f = fixture();
  f.adapter.create = async () => { throw new ProviderWebhookError("FORBIDDEN", false); };
  assert.deepEqual(await f.run(), { state: "CREATE_REJECTED" });
});
