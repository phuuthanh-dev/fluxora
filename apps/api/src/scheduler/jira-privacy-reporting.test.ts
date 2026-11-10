import assert from "node:assert/strict";
import test from "node:test";
import { JiraPrivacyReportingService } from "./jira-privacy-reporting.service";

test("Jira privacy reporting is disabled by default", async () => {
  const old = process.env.JIRA_PRIVACY_REPORTING_ENABLED;
  delete process.env.JIRA_PRIVACY_REPORTING_ENABLED;
  try {
    const service = new JiraPrivacyReportingService({} as never, {} as never, {} as never);
    service.onModuleInit(); await service.onModuleDestroy();
  } finally { if (old !== undefined) process.env.JIRA_PRIVACY_REPORTING_ENABLED = old; }
});

test("Jira privacy report claims once and holds a closed account for review", async (t) => {
  const oldFetch = globalThis.fetch;
  const oldWorkspace = process.env.JIRA_REPORTING_WORKSPACE_ID, oldCredential = process.env.JIRA_REPORTING_CREDENTIAL_ID;
  process.env.JIRA_REPORTING_WORKSPACE_ID = "workspace"; process.env.JIRA_REPORTING_CREDENTIAL_ID = "credential";
  t.after(() => { globalThis.fetch = oldFetch; if (oldWorkspace === undefined) delete process.env.JIRA_REPORTING_WORKSPACE_ID; else process.env.JIRA_REPORTING_WORKSPACE_ID = oldWorkspace; if (oldCredential === undefined) delete process.env.JIRA_REPORTING_CREDENTIAL_ID; else process.env.JIRA_REPORTING_CREDENTIAL_ID = oldCredential; });
  const accountId = "5be24ba3f91c106033269289";
  let state = "READY", claimToken: string | null = null, action: string | null = null, requests = 0;
  const item = { accountHash: "digest", encryptedAccountId: "encrypted", oldestDataAt: new Date("2026-01-01T00:00:00Z") };
  const prisma = { jiraPrivacyAccount: {
    findMany: async () => state === "READY" ? [item] : [],
    findUniqueOrThrow: async () => item,
    updateMany: async ({ where, data }: { where: { accountHash?: string; state: string; claimToken?: string }; data: { state: string; claimToken?: string | null; requiredAction?: string | null } }) => {
      if (!where.accountHash || where.state !== state || (where.claimToken && where.claimToken !== claimToken)) return { count: 0 };
      state = data.state; claimToken = data.claimToken ?? null; action = data.requiredAction ?? action; return { count: 1 };
    },
  } };
  globalThis.fetch = async () => { requests++; return Response.json({ accounts: [{ accountId, status: "closed" }] }); };
  const credentials = { runJiraOperation: async (_id: string, _workspace: string, fn: () => Promise<unknown>) => fn(), readForExecution: async () => ({ accessToken: "synthetic" }) };
  const service = new JiraPrivacyReportingService(prisma as never, credentials as never, { decrypt: () => ({ accountId }) } as never);
  await service.tick(); await service.tick();
  assert.equal(state, "ACTION_REQUIRED"); assert.equal(action, "closed"); assert.equal(requests, 1);
});
