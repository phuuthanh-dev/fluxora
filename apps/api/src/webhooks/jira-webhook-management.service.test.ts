import { strict as assert } from "node:assert";
import { test } from "node:test";
import { JiraWebhookManagementService } from "./jira-webhook-management.service";

function fixture() {
  const cloudId = "12345678-1234-1234-1234-123456789abc";
  const workflow = { id: "flow", workspaceId: "space", publishedVersionId: "version" };
  const endpoint = { id: "endpoint", updatedAt: new Date(), workflowVersionId: "version" };
  const registration = { id: "reg", endpointId: "endpoint", operationId: "old-op", provider: "JIRA", repository: `${cloudId}:10001`, credentialId: "credential", workflowVersionId: "version", state: "ACTIVE", remoteHookId: 42n, callbackUrl: "https://example.invalid/api/v1/webhooks/test", event: "jira:issue_created", createdAt: new Date(), updatedAt: new Date() };
  let deleted = false, removeCalls = 0;
  const table = {
    findUnique: async () => deleted ? null : registration,
    updateMany: async ({ where, data }: { where: { state?: string; operationId?: string }; data: Record<string, unknown> }) => {
      if (where.state !== registration.state || where.operationId !== registration.operationId) return { count: 0 };
      Object.assign(registration, data); return { count: 1 };
    },
    deleteMany: async () => { deleted = true; return { count: 1 }; },
  };
  const tx = { $queryRaw: async () => [{ id: "flow" }], providerWebhookRegistration: table };
  const prisma = { workflow: { findFirst: async () => workflow }, webhookEndpoint: { findFirst: async () => endpoint }, providerWebhookRegistration: table, $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) };
  const credentials = { readForExecution: async () => ({ cloudId, accessToken: "synthetic-token" }), runJiraOperation: async (_id: string, _space: string, operation: () => Promise<unknown>) => operation() };
  const adapter = { inspect: async () => ({ found: true, matches: true }), remove: async () => { removeCalls++; }, findMatching: async () => [42] };
  const service = new JiraWebhookManagementService(prisma as never, credentials as never, {} as never, adapter as never);
  return { service, registration, adapter, deleted: () => deleted, removeCalls: () => removeCalls };
}

test("Jira disconnect does not delete a changed provider webhook", async (t) => {
  const previous = process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED;
  process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED; else process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED = previous; });
  const f = fixture();
  f.adapter.inspect = async () => ({ found: true, matches: false });
  const result = await f.service.remove("flow", "owner");
  assert.equal(result.operationResult, "REJECTED");
  assert.equal(f.removeCalls(), 0);
  assert.equal(f.registration.state, "ACTIVE");
});

test("a rejected Jira registration can be cleared without calling Jira", async (t) => {
  const previous = process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED;
  process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED; else process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED = previous; });
  const f = fixture();
  Object.assign(f.registration, { state: "CREATE_REJECTED", remoteHookId: null });
  const result = await f.service.remove("flow", "owner");
  assert.equal(result.operationResult, "REMOVED");
  assert.equal(f.removeCalls(), 0);
  assert.equal(f.deleted(), true);
});

test("Jira async deletion remains uncertain while the remote webhook is still present", async (t) => {
  const previous = process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED;
  process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED; else process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED = previous; });
  const f = fixture();
  const result = await f.service.remove("flow", "owner");
  assert.equal(f.removeCalls(), 1);
  assert.equal(result.operationResult, "UNCERTAIN");
  assert.equal(f.registration.state, "DELETE_UNCERTAIN");
  assert.equal(f.deleted(), false);
  f.adapter.inspect = async () => ({ found: false, matches: false });
  const checked = await f.service.reconcile("flow", "owner");
  assert.equal(checked.reconciliation.outcome, "MATCHED");
  assert.equal(f.deleted(), true);
});
