import assert from "node:assert/strict";
import test from "node:test";
import { NotionOAuthController } from "./notion-oauth.controller";
import { exchangeNotionToken, runNotionAuthorized, saveNotionAuthorization, type NotionAuthorization } from "./notion-oauth";
import { NodeFailure } from "../execution/node-failure";
import { CredentialService } from "./credential.service";
import { CredentialProvider } from "@prisma/client";

const grant: NotionAuthorization = { token: "synthetic-access-token", refreshToken: "synthetic-refresh-token", notionWorkspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", botId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", notionWorkspaceName: "Example", authType: "oauth" };
const vault = { encrypt: (data: unknown) => JSON.stringify(data), decrypt: (data: string) => JSON.parse(data) };
const tokenResponse = (extra: Record<string, unknown> = {}) => ({ access_token: grant.token, refresh_token: grant.refreshToken, workspace_id: grant.notionWorkspaceId, bot_id: grant.botId, workspace_name: grant.notionWorkspaceName, ...extra });
function configure(t: { after: (fn: () => void) => void }) {
  const keys = ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET", "NOTION_REDIRECT_URI", "WEB_ORIGIN"];
  const previous = keys.map((key) => process.env[key]); const original = globalThis.fetch;
  Object.assign(process.env, { NOTION_CLIENT_ID: "synthetic-client", NOTION_CLIENT_SECRET: "synthetic-client-secret", NOTION_REDIRECT_URI: "https://api.example.test/api/v1/oauth/notion/callback", WEB_ORIGIN: "https://example.test" });
  t.after(() => { globalThis.fetch = original; keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); });
}

test("Notion exchanges only at its fixed endpoint and validates complete installation evidence", async (t) => {
  configure(t);
  const bodies: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.notion.com/v1/oauth/token"); assert.equal(init?.redirect, "error");
    assert.match(new Headers(init?.headers).get("authorization") ?? "", /^Basic /);
    bodies.push(JSON.parse(String(init?.body))); return Response.json(tokenResponse());
  };
  assert.deepEqual(await exchangeNotionToken({ code: "fixture-code" }), grant);
  await exchangeNotionToken({ refreshToken: "fixture-refresh" });
  assert.deepEqual(bodies, [{ grant_type: "authorization_code", code: "fixture-code", redirect_uri: process.env.NOTION_REDIRECT_URI }, { grant_type: "refresh_token", refresh_token: "fixture-refresh" }]);
  globalThis.fetch = async () => Response.json(tokenResponse({ workspace_id: "wrong", refresh_token: undefined }));
  await assert.rejects(exchangeNotionToken({ code: "fixture-code" }), /Invalid Notion authorization/);
});

test("Notion callback binds session, state and ownership before exchanging or storing secrets", async (t) => {
  configure(t); let userId = "owner", stateOwner = "owner", owned = true, requests = 0, issued = false; let location = "";
  const saved: unknown[][] = [];
  const credentials = { requireOwner: async () => { if (!owned) throw new Error("Not owner"); }, saveNotionOAuth: async (...args: unknown[]) => { saved.push(args); } };
  const states = { issue: async () => { issued = true; return { state: "single-use-bound-state" }; }, consume: async () => ({ state: { workspaceId: "workspace", userId: stateOwner } }) };
  const controller = new NotionOAuthController(credentials as never, states as never, { getCurrentUser: async () => ({ id: userId }) } as never);
  const response = { setHeader() {}, redirect(url: string) { location = url; } } as never;
  const request = { headers: { cookie: "workflow_session=fixture" }, currentUser: { id: "owner" } } as never;
  globalThis.fetch = async () => { requests++; return Response.json(tokenResponse()); };
  await controller.connect("workspace", request, response);
  assert.equal(issued, true); assert.equal(new URL(location).hostname, "api.notion.com"); assert.equal(new URL(location).searchParams.get("owner"), "user");
  await controller.callback("code", "state", undefined, request, response);
  assert.equal(saved.length, 1); assert.deepEqual(saved[0], ["workspace", "owner", grant, undefined]);
  assert.equal(new URL(location).searchParams.get("connected"), "notion");
  userId = "other"; await controller.callback("code", "state", undefined, request, response);
  userId = "owner"; owned = false; await controller.callback("code", "state", undefined, request, response);
  owned = true; await controller.callback("code", "state", "access_denied", request, response);
  assert.equal(new URL(location).searchParams.get("notion_oauth"), "denied");
  assert.equal(requests, 1); assert.equal(saved.length, 1); assert.doesNotMatch(location, /synthetic|fixture|token/);
});

test("Notion reconnect preserves identity and does not overwrite a concurrent update", async () => {
  let record = { id: "credential", encryptedData: vault.encrypt(grant) }, updated = 0, count = 1;
  const prisma = { credential: { findFirst: async ({ where }: { where: { workspaceId: string } }) => where.workspaceId === "workspace" ? record : null, updateMany: async () => { updated++; return { count }; } }, auditLog: { create: async () => ({}) } };
  await assert.rejects(saveNotionAuthorization(prisma as never, vault as never, "other", "owner", grant, "credential"));
  await assert.rejects(saveNotionAuthorization(prisma as never, vault as never, "workspace", "owner", { ...grant, botId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }, "credential"));
  assert.equal(updated, 0);
  count = 0; await assert.rejects(saveNotionAuthorization(prisma as never, vault as never, "workspace", "owner", grant, "credential"), /The connection changed/);
  count = 1; await saveNotionAuthorization(prisma as never, vault as never, "workspace", "owner", grant, "credential");
  assert.equal(updated, 2);
});

test("Notion refresh retries only a definite 401 and reuses another worker's refreshed grant", async (t) => {
  configure(t); let record = { id: "credential", encryptedData: vault.encrypt(grant) }, refreshes = 0, locks = 0;
  let concurrent = false;
  const prisma = { credential: { findFirst: async () => ({ ...record }), update: async ({ data }: { data: { encryptedData: string } }) => { record = { ...record, ...data }; } }, $queryRaw: async () => { locks++; if (concurrent) record.encryptedData = vault.encrypt({ ...grant, token: "concurrently-refreshed" }); }, $transaction: async (run: (tx: unknown) => Promise<void>) => run(prisma) };
  globalThis.fetch = async () => { refreshes++; return Response.json(tokenResponse({ access_token: "renewed-token" })); };
  let attempts = 0;
  const operation = async () => { attempts++; if (attempts === 1) throw new NodeFailure("HTTP_ERROR", "Notion returned 401", false, 401); return vault.decrypt(record.encryptedData).token; };
  assert.equal(await runNotionAuthorized(prisma as never, vault as never, "workspace", "credential", operation), "renewed-token");
  assert.equal(refreshes, 1); assert.equal(attempts, 2); assert.equal(locks, 1);
  concurrent = true; attempts = 0;
  assert.equal(await runNotionAuthorized(prisma as never, vault as never, "workspace", "credential", operation), "concurrently-refreshed"); assert.equal(refreshes, 1);
  for (const error of [new NodeFailure("HTTP_ERROR", "Forbidden", false, 403), new NodeFailure("TIMEOUT", "Uncertain write", false)]) {
    let calls = 0; await assert.rejects(runNotionAuthorized(prisma as never, vault as never, "workspace", "credential", async () => { calls++; throw error; }), (value) => value === error); assert.equal(calls, 1);
  }
  record.encryptedData = vault.encrypt({ token: "manual-token" }); attempts = 0;
  await assert.rejects(runNotionAuthorized(prisma as never, vault as never, "workspace", "credential", operation));
  assert.equal(attempts, 1); assert.equal(refreshes, 1);
});

test("Notion managed credentials hide all token hints and reject manual OAuth metadata", async () => {
  const record = { id: "credential", provider: CredentialProvider.NOTION, label: "Notion", encryptedData: vault.encrypt(grant), createdAt: new Date(), updatedAt: new Date() };
  const service = new CredentialService({ credential: { findMany: async () => [record] } } as never, { requireOwner: async () => {} } as never, vault as never);
  const [summary] = await service.list("workspace", "owner");
  assert.equal(summary?.isManaged, true); assert.equal(summary?.hints, undefined); assert.doesNotMatch(JSON.stringify(summary), /synthetic|refreshToken|botId/);
  await assert.rejects(service.create("workspace", "owner", { provider: CredentialProvider.NOTION, label: "Spoof", data: { token: "manual-token", authType: "oauth" } }));
});
