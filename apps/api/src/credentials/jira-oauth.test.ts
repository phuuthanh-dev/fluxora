import assert from "node:assert/strict";
import test from "node:test";
import { exchangeJiraToken, identifyJiraAuthorization, runJiraAuthorized, saveJiraAuthorization, type JiraAuthorization } from "./jira-oauth";
import { NodeFailure } from "../execution/node-failure";
const grant: JiraAuthorization = { accessToken: "synthetic-access-token", refreshToken: "synthetic-refresh-token", cloudId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", siteName: "Example", accountId: "account-id" };
const vault = { encrypt: (data: unknown) => JSON.stringify(data), decrypt: (data: string) => JSON.parse(data) };
function configure(t: { after: (fn: () => void) => void }) {
  const keys = ["JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET", "JIRA_REDIRECT_URI"]; const previous = keys.map((key) => process.env[key]); const original = globalThis.fetch;
  Object.assign(process.env, { JIRA_CLIENT_ID: "synthetic-client", JIRA_CLIENT_SECRET: "synthetic-secret", JIRA_REDIRECT_URI: "https://api.example.test/api/v1/oauth/jira/callback" });
  t.after(() => { globalThis.fetch = original; keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); });
}
test("Jira token exchange and identity are bound to one site", async (t) => {
  configure(t); const calls: string[] = [];
  globalThis.fetch = async (url, init) => { calls.push(String(url)); assert.equal(init?.redirect, "error"); if (String(url).endsWith("/token")) return Response.json({ access_token: grant.accessToken, refresh_token: grant.refreshToken }); if (String(url).endsWith("accessible-resources")) return Response.json([{ id: grant.cloudId, name: grant.siteName }]); return Response.json({ account_id: grant.accountId }); };
  const tokens = await exchangeJiraToken({ code: "fixture" }); assert.deepEqual(await identifyJiraAuthorization(tokens), grant); assert.equal(calls.length, 3);
  globalThis.fetch = async () => Response.json([]); await assert.rejects(() => identifyJiraAuthorization(tokens));
});
test("Jira reconnect does not replace a different account or site", async (t) => {
  const previous = process.env.APP_ENCRYPTION_KEY; process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  t.after(() => { if (previous === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previous; });
  const record = { id: "credential", encryptedData: vault.encrypt(grant) }; let writes = 0;
  const prisma = { credential: { findFirst: async () => record, updateMany: async () => { writes++; return { count: 1 }; } }, jiraPrivacyAccount: { upsert: async () => ({}), updateMany: async () => ({ count: 1 }) }, $queryRaw: async () => [{ state: "READY" }], auditLog: { create: async () => ({}) }, $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(prisma) };
  await assert.rejects(saveJiraAuthorization(prisma as never, vault as never, "workspace", "owner", { ...grant, accountId: "different" }, "credential"));
  assert.equal(writes, 0);
  await saveJiraAuthorization(prisma as never, vault as never, "workspace", "owner", grant, "credential"); assert.equal(writes, 1);
});
test("Jira refresh is serialized and only retries a definite 401", async (t) => {
  configure(t); let record = { id: "credential", encryptedData: vault.encrypt(grant) }, refreshes = 0, attempts = 0;
  const prisma = { credential: { findFirst: async () => ({ ...record }), update: async ({ data }: { data: { encryptedData: string } }) => { record = { ...record, ...data }; } }, $queryRaw: async () => {}, $transaction: async (fn: (tx: unknown) => Promise<void>) => fn(prisma) };
  globalThis.fetch = async () => { refreshes++; return Response.json({ access_token: "renewed", refresh_token: "next-refresh" }); };
  const value = await runJiraAuthorized(prisma as never, vault as never, "workspace", "credential", async () => { if (++attempts === 1) throw new NodeFailure("HTTP_ERROR", "Unauthorized", false, 401); return vault.decrypt(record.encryptedData); });
  assert.equal(value.refreshToken, "next-refresh"); assert.equal(attempts, 2); assert.equal(refreshes, 1);
  await assert.rejects(runJiraAuthorized(prisma as never, vault as never, "workspace", "credential", async () => { throw new NodeFailure("DELIVERY_UNCERTAIN", "Unknown", false); })); assert.equal(refreshes, 1);
});

test("Jira OAuth callback requires matching session, workspace ownership and a single site", async (t) => {
  configure(t); let user = "owner", stateOwner = "owner", owns = true, saved = 0, location = "";
  const { JiraOAuthController } = await import("./jira-oauth.controller");
  const credentials = { requireOwner: async () => { if (!owns) throw Error("not owner"); }, saveJiraOAuth: async () => { saved++; } };
  const states = { issue: async () => ({ state: "bound-state" }), consume: async () => ({ state: { workspaceId: "workspace", userId: stateOwner } }) };
  const controller = new JiraOAuthController(credentials as never, states as never, { getCurrentUser: async () => ({ id: user }) } as never);
  const response = { setHeader() {}, redirect(url: string) { location = url; } } as never;
  const request = { headers: { cookie: "workflow_session=fixture" }, currentUser: { id: "owner" } } as never;
  globalThis.fetch = async (url) => String(url).endsWith("/token") ? Response.json({ access_token: grant.accessToken, refresh_token: grant.refreshToken }) : String(url).endsWith("accessible-resources") ? Response.json([{ id: grant.cloudId, name: grant.siteName }]) : Response.json({ account_id: grant.accountId });
  await controller.connect("workspace", request, response); assert.equal(new URL(location).host, "auth.atlassian.com");
  await controller.callback("code", "state", undefined, request, response); assert.equal(saved, 1); assert.equal(new URL(location).searchParams.get("connected"), "jira");
  user = "other"; await controller.callback("code", "state", undefined, request, response);
  user = "owner"; owns = false; await controller.callback("code", "state", undefined, request, response);
  owns = true; stateOwner = "owner"; await controller.callback("code", "state", "access_denied", request, response);
  assert.equal(saved, 1); assert.doesNotMatch(location, /synthetic|fixture|token/);
});

test("Jira managed connections do not expose tokens and cannot be manually created", async () => {
  const { CredentialService } = await import("./credential.service");
  const { CredentialProvider } = await import("@prisma/client");
  const record = { id: "credential", provider: CredentialProvider.JIRA, label: "Jira", encryptedData: vault.encrypt(grant), createdAt: new Date(), updatedAt: new Date() };
  const service = new CredentialService({ credential: { findMany: async () => [record] } } as never, { requireOwner: async () => {} } as never, vault as never);
  const [summary] = await service.list("workspace", "owner");
  assert.equal(summary?.isManaged, true); assert.equal(summary?.hints, undefined); assert.doesNotMatch(JSON.stringify(summary), /synthetic|refreshToken|accountId/);
  await assert.rejects(service.create("workspace", "owner", { provider: CredentialProvider.JIRA, label: "Spoof", data: grant }));
});
