import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { createHash, createHmac } from "node:crypto";
import { CredentialProvider } from "@prisma/client";
import { CredentialService } from "./credential.service";
import { oauthEnvironment, oauthHarness } from "./google-oauth-test-helpers";
import { chatManageScope, googleConnectionPolicy, googleScopeProof } from "./google-oauth-policy";

let originalEncryptionKey: string | undefined;
beforeEach(() => { originalEncryptionKey = process.env.APP_ENCRYPTION_KEY; process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64"); });
afterEach(() => { if (originalEncryptionKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = originalEncryptionKey; });

type Row = { id: string; workspaceId: string; provider: CredentialProvider; label: string; encryptedData: string; createdAt: Date; updatedAt: Date };
const grant = (subject: string, scopes = googleConnectionPolicy.google.scopes) => ({ accessToken: `access-${subject}`, scopeTokenHash: createHash("sha256").update(`access-${subject}`).digest("hex"), refreshToken: `refresh-${subject}`, expiresAt: "2099-01-01T00:00:00Z", googleSubject: subject, googleEmail: `${subject}@example.test`, grantedScopes: scopes });
const codeOf = (error: unknown) => (error as { response?: { code?: string } }).response?.code;

test("Google Chat management is available only with explicit consent and a verified grant", async () => {
  const f = fixture();
  const scopes = [...googleConnectionPolicy.chat.scopes, chatManageScope];
  const readOnly = await f.service.saveGoogleOAuth("ws", "owner", "chat", grant("alpha", scopes));
  const projected = await f.service.readGoogleForExecution(readOnly.id, "ws", CredentialProvider.GOOGLE_CHAT_OAUTH);
  assert.ok(Array.isArray(projected.grantedScopes));
  assert.equal(projected.grantedScopes.includes(chatManageScope), false);
  const managed = await f.service.saveGoogleOAuth("ws", "owner", "chat", grant("beta", scopes), undefined, undefined, true);
  const allowed = await f.service.readGoogleForExecution(managed.id, "ws", CredentialProvider.GOOGLE_CHAT_OAUTH);
  assert.ok(Array.isArray(allowed.grantedScopes));
  assert.equal(allowed.grantedScopes.includes(chatManageScope), true);
  assert.equal(managed.chatManageEnabled, true);
  await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "chat", grant("gamma", googleConnectionPolicy.chat.scopes), undefined, undefined, true), (error) => codeOf(error) === "GOOGLE_OAUTH_SCOPE_MISSING");
});

test("Google Chat management summary requires a current, authenticated scope grant", async () => {
  const f = fixture();
  const scopes = [...googleConnectionPolicy.chat.scopes, chatManageScope];
  const managed = await f.service.saveGoogleOAuth("ws", "owner", "chat", grant("alpha", scopes), undefined, undefined, true);
  const row = f.rows.find((item) => item.id === managed.id)!;
  const stored = JSON.parse(row.encryptedData) as Record<string, unknown>;

  // Consent is still recorded, but the provider has narrowed the current grant.
  stored.grantedScopes = [...googleConnectionPolicy.chat.scopes];
  stored.scopeProof = googleScopeProof("access-alpha", stored.grantedScopes as string[]);
  row.encryptedData = JSON.stringify(stored);
  let [summary] = await f.service.list("ws", "owner");
  assert.notEqual(summary?.chatManageEnabled, true);
  assert.equal(summary?.googleReconnectRequired, true);

  // A stale or forged scope list must not advertise management permission.
  stored.grantedScopes = scopes;
  stored.scopeProof = "invalid";
  row.encryptedData = JSON.stringify(stored);
  [summary] = await f.service.list("ws", "owner");
  assert.notEqual(summary?.chatManageEnabled, true);
  assert.equal(summary?.googleReconnectRequired, true);
});

test("Google Chat management consent is bound to OAuth state and cannot be silently granted", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const h = oauthHarness(f.service);
    await h.controller.connectChat("ws", h.request, h.response, undefined, "1");
    const auth = new URL(h.redirect());
    assert.ok(auth.searchParams.get("scope")!.includes(chatManageScope));
    const state = auth.searchParams.get("state")!;
    const [payload, signature] = state.split(".");
    const tampered = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    tampered.chatManage = false;
    await h.controller.callback("code", `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${signature}`, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "invalid_state");
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope: googleConnectionPolicy.chat.scopes.join(" ") })); };
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "scope_missing");
    assert.equal(calls, 1);
    assert.equal(f.writes(), 0);
  } finally { restore(); }
});

function fixture() {
  const rows: Row[] = [];
  let writes = 0;
  let denyOwner = false;
  let loseRace = false;
  let locked = false;
  let activeTransactions = 0;
  let busyCalls = 0;
  let onBusy: (() => void) | undefined;
  let failLock = false;
  let lockError: Error | undefined;
  let beforeTransaction: ((options: { maxWait: number; timeout: number }) => void) | undefined;
  const credential = {
    create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "updatedAt"> }) => {
      const row = { ...data, id: `id-${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date() };
      rows.push(row); writes++; return row;
    },
    findFirst: async ({ where }: { where: Partial<Row> }) => {
      const row = rows.find((item) => Object.entries(where).every(([key, value]) => item[key as keyof Row] === value));
      return row ? { ...row } : null;
    },
    findMany: async ({ where }: { where: Partial<Row> }) => rows.filter((row) => row.workspaceId === where.workspaceId),
    updateMany: async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
      const row = rows.find((item) => Object.entries(where).every(([key, value]) => item[key as keyof Row] === value));
      if (!row || loseRace) return { count: 0 };
      Object.assign(row, data); writes++; return { count: 1 };
    },
  };
  const prisma = {
    credential,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, options: { maxWait: number; timeout: number }) => {
      beforeTransaction?.(options);
      let ownsLock = false;
      activeTransactions++;
      const tx = { credential, $queryRaw: async () => {
        if (lockError) throw lockError;
        if (failLock) throw new Error("synthetic lock failure");
        if (locked) { busyCalls++; onBusy?.(); return [{ locked: false }]; }
        locked = true; ownsLock = true; return [{ locked: true }];
      } };
      try { return await fn(tx); } finally { if (ownsLock) locked = false; activeTransactions--; }
    },
    auditLog: { create: async () => ({}) },
  };
  const service = new CredentialService(prisma as never, { requireOwner: async (ws: string, user: string) => { if (denyOwner || ws !== "ws" || user !== "owner") throw new Error("denied"); } } as never,
    { encrypt: (data: unknown) => JSON.stringify(data), decrypt: (data: string) => JSON.parse(data) } as never);
  return { service, rows, writes: () => writes, deny: () => { denyOwner = true; }, race: () => { loseRace = true; }, failLock: () => { failLock = true; }, failLockWith: (error: Error) => { lockError = error; }, onBusy: (callback: () => void) => { onBusy = callback; }, beforeTransaction: (callback: (options: { maxWait: number; timeout: number }) => void) => { beforeTransaction = callback; }, activeTransactions: () => activeTransactions, busyCalls: () => busyCalls };
}

test("separate accounts remain independent and reconnect requires the same subject and workspace", async () => {
  const f = fixture();
  const a = await f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"));
  const b = await f.service.saveGoogleOAuth("ws", "owner", "google", grant("beta"));
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.label, b.label);
  assert.equal(a.isManaged, true);
  const before = f.rows.map((row) => row.encryptedData);
  await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "google", grant("beta"), a.id), (error) => codeOf(error) === "GOOGLE_OAUTH_ACCOUNT_MISMATCH");
  await assert.rejects(f.service.saveGoogleOAuth("other", "owner", "google", grant("alpha"), a.id));
  await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "gmail", grant("alpha"), a.id));
  assert.deepEqual(f.rows.map((row) => row.encryptedData), before);
  await f.service.saveGoogleOAuth("ws", "owner", "google", { ...grant("alpha"), accessToken: "replacement", scopeTokenHash: createHash("sha256").update("replacement").digest("hex") }, a.id);
  assert.equal(JSON.parse(f.rows[0]!.encryptedData).accessToken, "replacement");
  assert.equal(f.rows[1]!.encryptedData, before[1]);
  const summaries = await f.service.list("ws", "owner");
  assert.ok(!JSON.stringify(summaries).includes("replacement"));
  assert.ok(!JSON.stringify(summaries).includes("refresh-alpha"));
  await assert.rejects(f.service.update("ws", a.id, "owner", { label: "manual" }), (error) => codeOf(error) === "CREDENTIAL_MANAGED_BY_OAUTH");
});

test("legacy grants stay usable and cannot be rebound when old identity is unavailable", async () => {
  const f = fixture();
  f.rows.push({ id: "legacy", workspaceId: "ws", provider: CredentialProvider.GOOGLE, label: "Google OAuth", encryptedData: JSON.stringify({ accessToken: "legacy-access" }), createdAt: new Date(), updatedAt: new Date() });
  assert.equal((await f.service.readGoogleForExecution("legacy", "ws")).accessToken, "legacy-access");
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 401 });
    await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"), "legacy"), (error) => codeOf(error) === "GOOGLE_OAUTH_LEGACY_IDENTITY_UNKNOWN");
    assert.equal(f.writes(), 0);
    globalThis.fetch = async () => new Response(JSON.stringify({ sub: "alpha", email: "alpha@example.test", email_verified: true }));
    await f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"), "legacy");
    assert.equal(JSON.parse(f.rows[0]!.encryptedData).googleSubject, "alpha");
  } finally { globalThis.fetch = oldFetch; }
});

test("explicit legacy reconnect keeps the credential id, while known account mismatch remains blocked", async () => {
  const f = fixture();
  f.rows.push({ id: "legacy", workspaceId: "ws", provider: CredentialProvider.GOOGLE, label: "Google OAuth", encryptedData: JSON.stringify({ accessToken: "old" }), createdAt: new Date(), updatedAt: new Date() });
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 401 });
    await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"), "legacy"), (error) => codeOf(error) === "GOOGLE_OAUTH_LEGACY_IDENTITY_UNKNOWN");
    await f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"), "legacy", undefined, undefined, true);
    assert.equal(f.rows[0]!.id, "legacy");
    assert.equal(JSON.parse(f.rows[0]!.encryptedData).googleSubject, "alpha");
    await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "google", grant("beta"), "legacy", undefined, undefined, true), (error) => codeOf(error) === "GOOGLE_OAUTH_ACCOUNT_MISMATCH");
  } finally { globalThis.fetch = oldFetch; }
});

test("confirmed legacy reconnect is bound to signed, single-use state", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  f.rows.push({ id: "legacy", workspaceId: "ws", provider: CredentialProvider.GOOGLE, label: "Google OAuth", encryptedData: JSON.stringify({ accessToken: "old" }), createdAt: new Date(), updatedAt: new Date() });
  try {
    const h = oauthHarness(f.service);
    let authorization = "";
    (h.response as unknown as { json: (value: { url: string }) => void }).json = (value) => { authorization = value.url; };
    await assert.rejects(h.controller.reconnectConfirmed("ws", "legacy", { confirmed: false, kind: "google" }, h.request, h.response));
    await h.controller.reconnectConfirmed("ws", "legacy", { confirmed: true, kind: "google" }, h.request, h.response);
    const url = new URL(authorization); const state = url.searchParams.get("state")!;
    const [encoded, signature] = state.split(".");
    const altered = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8")); altered.credentialId = "other";
    await h.controller.callback("code", `${Buffer.from(JSON.stringify(altered)).toString("base64url")}.${signature}`, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "invalid_state");
    globalThis.fetch = async (request) => String(request).includes("userinfo") ? new Response(JSON.stringify({ sub: "alpha", email: "alpha@example.test", email_verified: true })) : new Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope: url.searchParams.get("scope") }));
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("connected"), "google");
    assert.equal(f.rows[0]!.id, "legacy");
    assert.equal(JSON.parse(f.rows[0]!.encryptedData).googleSubject, "alpha");
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "invalid_state");
  } finally { restore(); }
});

test("scoped credentials fail closed on missing permissions and stale reconnect writes", async () => {
  const f = fixture();
  const a = await f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"));
  const narrowed = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
  narrowed.grantedScopes = [googleConnectionPolicy.google.scopes[0]!];
  narrowed.scopeProof = googleScopeProof("access-alpha", narrowed.grantedScopes as string[]);
  f.rows[0]!.encryptedData = JSON.stringify(narrowed);
  await assert.rejects(f.service.readGoogleForExecution(a.id, "ws"), (error) => codeOf(error) === "GOOGLE_OAUTH_SCOPE_MISSING");
  const before = f.rows[0]!.encryptedData;
  f.race();
  await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"), a.id), (error) => codeOf(error) === "GOOGLE_CREDENTIAL_CHANGED");
  assert.equal(f.rows[0]!.encryptedData, before);
});

test("callback enforces grants, account identity, session, browser cookie, PKCE and one-time state", async () => {
  const restore = oauthEnvironment();
  const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"));
    const h = oauthHarness(f.service);
    let scope = ""; let subject = "alpha"; let calls = 0; let verifier = "";
    globalThis.fetch = async (url, init) => {
      calls++;
      if (String(url).includes("userinfo")) return new Response(JSON.stringify({ sub: subject, email: `${subject}@example.test`, email_verified: true }));
      verifier = (init?.body as URLSearchParams).get("code_verifier")!;
      return new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope }));
    };
    for (const missing of googleConnectionPolicy.google.scopes) {
      await h.controller.connect("ws", h.request, h.response, a.id);
      const auth = new URL(h.redirect());
      scope = auth.searchParams.get("scope")!.split(" ").filter((item) => item !== missing).join(" ");
      await h.controller.callback("code", auth.searchParams.get("state")!, h.request, h.response);
      assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "scope_missing");
      assert.equal(f.writes(), 1);
    }
    await h.controller.connect("ws", h.request, h.response, a.id);
    let auth = new URL(h.redirect()); scope = auth.searchParams.get("scope")!; subject = "beta";
    await h.controller.callback("code", auth.searchParams.get("state")!, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "account_mismatch");
    assert.equal(f.writes(), 1);

    await h.controller.connect("ws", h.request, h.response, a.id);
    auth = new URL(h.redirect()); const state = auth.searchParams.get("state")!; scope = auth.searchParams.get("scope")!; subject = "alpha";
    const cookieName = [...h.cookies.keys()].find((name) => name.startsWith("fluxora_google_oauth_"))!;
    const cookieValue = h.cookies.get(cookieName)!;
    h.cookies.set("workflow_session", "session-owner-second"); h.sync(); const beforeCalls = calls;
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "invalid_state");
    assert.equal(calls, beforeCalls);
    h.cookies.set("workflow_session", "session-owner"); h.cookies.set(cookieName, "wrong-browser"); h.sync();
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(calls, beforeCalls);
    h.cookies.set(cookieName, cookieValue); h.sync();
    await h.controller.callback("code", `${state}x`, h.request, h.response);
    assert.equal(calls, beforeCalls);
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(f.writes(), 2);
    const connected = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
    assert.equal(connected.scopeTokenHash, createHash("sha256").update("new-access").digest("hex"));
    assert.equal(createHash("sha256").update(verifier).digest("base64url"), auth.searchParams.get("code_challenge"));
    assert.ok(!h.redirect().includes("new-access") && !h.redirect().includes("new-refresh"));
    h.cookies.set(cookieName, cookieValue); h.sync();
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "invalid_state");
    assert.equal(f.writes(), 2);
    await h.controller.connect("ws", h.request, h.response, a.id);
    const deniedState = new URL(h.redirect()).searchParams.get("state")!;
    f.deny(); const previousCalls = calls;
    await h.controller.callback("code", deniedState, h.request, h.response);
    assert.equal(calls, previousCalls);
  } finally { restore(); }
});

test("refresh cannot overwrite a concurrently reconnected grant and rejects narrowed scopes", async () => {
  const previousFetch = globalThis.fetch;
  const previousId = process.env.GOOGLE_CLIENT_ID;
  const previousSecret = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID = "client";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  try {
    const f = fixture();
    const a = await f.service.saveGoogleOAuth("ws", "owner", "google", { ...grant("alpha"), expiresAt: "2020-01-01T00:00:00Z" });
    const before = f.rows[0]!.encryptedData;
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600, scope: googleConnectionPolicy.google.scopes[0] }));
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws"), (error) => codeOf(error) === "GOOGLE_OAUTH_SCOPE_MISSING");
    assert.equal(f.rows[0]!.encryptedData, before);
    f.race();
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600, scope: googleConnectionPolicy.google.scopes.join(" ") }));
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws"), (error) => codeOf(error) === "GOOGLE_CREDENTIAL_CHANGED");
    assert.equal(f.rows[0]!.encryptedData, before);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = previousSecret;
  }
});


test("a lost refresh race returns the current valid credential without overwriting it", async () => {
  const restore = oauthEnvironment();
  const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "google", { ...grant("alpha"), expiresAt: "2020-01-01T00:00:00Z" });
    const replacement = { ...grant("alpha"), accessToken: "winner" };
    globalThis.fetch = async () => {
      f.rows[0]!.encryptedData = JSON.stringify(replacement);
      return new Response(JSON.stringify({ access_token: "stale", expires_in: 3600, scope: googleConnectionPolicy.google.scopes.join(" ") }));
    };
    const result = await f.service.readGoogleForExecution(a.id, "ws");
    assert.equal(result.accessToken, "winner");
    assert.equal(JSON.parse(f.rows[0]!.encryptedData).accessToken, "winner");
  } finally { restore(); }
});

test("legacy identity probing never refreshes the old grant, even if its access token is unusable", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    f.rows.push({ id: "legacy", workspaceId: "ws", provider: CredentialProvider.GOOGLE, label: "Google OAuth", encryptedData: JSON.stringify({ accessToken: "old", refreshToken: "old-refresh" }), createdAt: new Date(), updatedAt: new Date() });
    const before = f.rows[0]!.encryptedData;
    let canProve = false; let refreshCalls = 0;
    globalThis.fetch = async (url, init) => {
      if (!String(url).includes("userinfo")) { refreshCalls++; throw new Error("legacy refresh must not occur"); }
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer old");
      return canProve ? new Response(JSON.stringify({ sub: "alpha" })) : new Response("{}", { status: 401 });
    };
    await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"), "legacy"), (error) => codeOf(error) === "GOOGLE_OAUTH_LEGACY_IDENTITY_UNKNOWN");
    assert.equal(f.rows[0]!.encryptedData, before);
    canProve = true;
    await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "google", grant("beta"), "legacy"), (error) => codeOf(error) === "GOOGLE_OAUTH_ACCOUNT_MISMATCH");
    assert.equal(f.rows[0]!.encryptedData, before);
    await f.service.saveGoogleOAuth("ws", "owner", "google", grant("alpha"), "legacy");
    assert.equal(f.rows[0]!.id, "legacy");
    assert.equal(JSON.parse(f.rows[0]!.encryptedData).googleSubject, "alpha");
    assert.equal(refreshCalls, 0);
  } finally { restore(); }
});

test("single-use state allows only one of two concurrent callbacks", async () => {
  const restore = oauthEnvironment(); let saves = 0;
  const h = oauthHarness({ requireOwner: async () => {}, saveGoogleOAuth: async () => { saves++; } });
  try {
    await h.controller.connect("ws", h.request, h.response);
    const auth = new URL(h.redirect()); const state = auth.searchParams.get("state")!; const scope = auth.searchParams.get("scope")!;
    globalThis.fetch = async (url) => String(url).includes("userinfo") ? new Response(JSON.stringify({ sub: "subject", email: "owner@example.test", email_verified: true })) : new Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope }));
    await Promise.all([h.controller.callback("code", state, h.request, h.response), h.controller.callback("code", state, h.request, h.response)]);
    assert.equal(saves, 1);
  } finally { restore(); }
});

test("cancelled Google consent redirects to a safe actionable status without exposing provider data", async () => {
  const restore = oauthEnvironment(); let calls = 0;
  const h = oauthHarness({ requireOwner: async () => {}, saveGoogleOAuth: async () => { throw new Error("unexpected"); } });
  try {
    await h.controller.connect("ws", h.request, h.response);
    const state = new URL(h.redirect()).searchParams.get("state")!;
    globalThis.fetch = async () => { calls++; throw new Error("unexpected"); };
    await h.controller.callback(undefined, state, h.request, h.response, "access_denied private text");
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "denied");
    assert.ok(!h.redirect().includes("private"));
    assert.equal(calls, 0);
  } finally { restore(); }
});

test("expired signed state is rejected without consuming a still-valid flow", async () => {
  const restore = oauthEnvironment(); let writes = 0;
  const h = oauthHarness({ requireOwner: async () => {}, saveGoogleOAuth: async () => { writes++; } });
  try {
    await h.controller.connect("ws", h.request, h.response);
    const auth = new URL(h.redirect()); const state = auth.searchParams.get("state")!;
    const payload = JSON.parse(Buffer.from(state.split(".")[0]!, "base64url").toString("utf8"));
    payload.issuedAt = Date.now() - 11 * 60_000;
    const oldPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", Buffer.from(process.env.APP_ENCRYPTION_KEY!, "base64")).update(oldPayload).digest("base64url");
    let calls = 0;
    globalThis.fetch = async (url) => { calls++; return String(url).includes("userinfo") ? new Response(JSON.stringify({ sub: "subject", email: "owner@example.test", email_verified: true })) : new Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope: auth.searchParams.get("scope") })); };
    await h.controller.callback("code", `${oldPayload}.${sig}`, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "invalid_state");
    assert.equal(calls, 0);
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(writes, 1);
  } finally { restore(); }
});

test("Redis failure during start or callback redirects safely and never exchanges tokens", async () => {
  const restore = oauthEnvironment(); let calls = 0; let saves = 0;
  const h = oauthHarness({ requireOwner: async () => {}, saveGoogleOAuth: async () => { saves++; } });
  try {
    globalThis.fetch = async () => { calls++; throw new Error("unexpected provider request"); };
    h.failStateStore(true);
    await h.controller.connect("ws", h.request, h.response);
    let recovery = new URL(h.redirect());
    assert.equal(recovery.searchParams.get("google_oauth"), "redis_unavailable");
    assert.equal(recovery.searchParams.get("workspace"), "ws");
    h.failStateStore(false);
    await h.controller.connect("ws", h.request, h.response);
    const state = new URL(h.redirect()).searchParams.get("state")!;
    h.failStateStore(true);
    await h.controller.callback("code", state, h.request, h.response);
    recovery = new URL(h.redirect());
    assert.equal(recovery.searchParams.get("google_oauth"), "redis_unavailable");
    assert.ok(!h.redirect().includes("synthetic Redis failure") && !h.redirect().includes("code"));
    assert.equal(calls, 0);
    assert.equal(saves, 0);
  } finally { restore(); }
});

test("returned permissions may contain prior grants and the complete set is stored", async () => {
  const restore = oauthEnvironment(); const saved: Record<string, unknown>[] = [];
  const h = oauthHarness({ requireOwner: async () => {}, saveGoogleOAuth: async (_ws: string, _user: string, _kind: string, data: Record<string, unknown>) => { saved.push(data); } });
  try {
    await h.controller.connectGmail("ws", h.request, h.response);
    const auth = new URL(h.redirect());
    assert.equal(auth.searchParams.get("include_granted_scopes"), null);
    const extra = "https://www.googleapis.com/auth/drive";
    const returned = `${auth.searchParams.get("scope")} ${extra}`;
    globalThis.fetch = async (url) => String(url).includes("userinfo") ? new Response(JSON.stringify({ sub: "subject", email: "owner@example.test", email_verified: true })) : new Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope: returned }));
    await h.controller.callback("code", auth.searchParams.get("state")!, h.request, h.response);
    assert.deepEqual(saved[0]?.grantedScopes, returned.split(" "));
    assert.equal(saved[0]?.scopeTokenHash, createHash("sha256").update("token").digest("hex"));
    assert.equal(new URL(h.redirect()).searchParams.get("connected"), "gmail");
  } finally { restore(); }
});

const gmailReadScope = "https://www.googleapis.com/auth/gmail.readonly";
const gmailWriteScope = "https://www.googleapis.com/auth/gmail.modify";
function hasBoundWriteGrant(data: Record<string, unknown>) {
  return typeof data.accessToken === "string" && data.scopeTokenHash === createHash("sha256").update(data.accessToken).digest("hex") && Array.isArray(data.grantedScopes) && data.grantedScopes.includes(gmailWriteScope);
}

test("refresh binds unchanged provider-confirmed scopes to the new token", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const scopes = [gmailReadScope, gmailWriteScope];
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", scopes), expiresAt: "2020-01-01T00:00:00Z" }, undefined, ["readonly", "modify"]);
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600, scope: [...scopes].reverse().join(" ") }));
    const current = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(current.scopeTokenHash, createHash("sha256").update("refreshed").digest("hex"));
    assert.equal(hasBoundWriteGrant(current), true);
    assert.equal(JSON.parse(f.rows[0]!.encryptedData).scopeTokenHash, current.scopeTokenHash);
    const summaries = await f.service.list("ws", "owner");
    assert.ok(!JSON.stringify(summaries).includes(String(current.scopeTokenHash)));
    const proof = JSON.parse(f.rows[0]!.encryptedData).scopeProof as string;
    assert.equal(current.scopeProof, undefined);
    assert.ok(!JSON.stringify(summaries).includes(proof));
  } finally { restore(); }
});

test("omitted refresh scope uses the authenticated grant; changed scope uses only Google's response", async () => {
  const restore = oauthEnvironment();
  try {
    for (const scope of [undefined, `${gmailReadScope} ${gmailWriteScope} https://www.googleapis.com/auth/gmail.send`, gmailReadScope]) {
      const f = fixture();
      const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope, gmailWriteScope]), expiresAt: "2020-01-01T00:00:00Z" }, undefined, ["readonly", "modify"]);
      globalThis.fetch = async (_url, init) => {
        assert.equal((init?.body as URLSearchParams).has("scope"), false);
        return new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600, ...(scope === undefined ? {} : { scope }) }));
      };
      const current = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
      assert.equal(current.scopeTokenHash, createHash("sha256").update("refreshed").digest("hex"));
      assert.equal(hasBoundWriteGrant(current), scope !== gmailReadScope);
      assert.ok(!(current.grantedScopes as string[]).includes("https://www.googleapis.com/auth/gmail.send"));
      const stored = JSON.parse(f.rows[0]!.encryptedData);
      assert.equal(stored.scopeTokenHash, current.scopeTokenHash);
      if (scope?.includes("gmail.send")) assert.equal(stored.refreshGrantProof, "");
      else assert.ok(stored.refreshGrantProof);
    }
  } finally { restore(); }
});

test("legacy Gmail remains eligible only for the candidate's legacy read path", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    f.rows.push({ id: "legacy", workspaceId: "ws", provider: CredentialProvider.GMAIL, label: "Gmail OAuth", encryptedData: JSON.stringify({ accessToken: "old", refreshToken: "refresh", expiresAt: "2020-01-01T00:00:00Z" }), createdAt: new Date(), updatedAt: new Date() });
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600, scope: `${gmailReadScope} ${gmailWriteScope}` }));
    const current = await f.service.readGoogleForExecution("legacy", "ws", CredentialProvider.GMAIL);
    assert.equal(current.grantedScopes, undefined);
    assert.equal(current.scopeTokenHash, undefined);
    assert.equal(hasBoundWriteGrant(current), false);
  } finally { restore(); }
});

test("manual or pre-binding scoped metadata cannot forge a provider-verified write grant", async () => {
  const f = fixture();
  const claimed = grant("alpha", [gmailReadScope, gmailWriteScope]);
  for (const label of ["Manual Gmail", "Gmail OAuth"]) {
    f.rows.push({ id: label, workspaceId: "ws", provider: CredentialProvider.GMAIL, label, encryptedData: JSON.stringify(claimed), createdAt: new Date(), updatedAt: new Date() });
    const current = await f.service.readGoogleForExecution(label, "ws", CredentialProvider.GMAIL);
    assert.equal(current.scopeTokenHash, undefined);
    assert.equal(hasBoundWriteGrant(current), false);
  }
});

test("scoped records without authenticated evidence cannot gain write authority on refresh", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const unverified = { ...grant("alpha", [gmailReadScope, gmailWriteScope]), expiresAt: "2020-01-01T00:00:00Z" };
    f.rows.push({ id: "old-scoped", workspaceId: "ws", provider: CredentialProvider.GMAIL, label: "Gmail OAuth", encryptedData: JSON.stringify(unverified), createdAt: new Date(), updatedAt: new Date() });
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600, scope: `${gmailReadScope} ${gmailWriteScope}` }));
    const current = await f.service.readGoogleForExecution("old-scoped", "ws", CredentialProvider.GMAIL);
    assert.equal(current.scopeTokenHash, undefined);
    assert.equal(hasBoundWriteGrant(current), false);
  } finally { restore(); }
});

test("changing recorded scopes invalidates server evidence even when token hash is unchanged", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", grant("alpha", [gmailReadScope]));
    const data = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
    data.grantedScopes = [gmailReadScope, gmailWriteScope];
    f.rows[0]!.encryptedData = JSON.stringify(data);
    const current = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(current.scopeTokenHash, "");
    assert.equal(hasBoundWriteGrant(current), false);
  } finally { restore(); }
});

test("saving OAuth with a token digest from a different access token is rejected", async () => {
  const f = fixture();
  const data = { ...grant("alpha", [gmailReadScope]), scopeTokenHash: createHash("sha256").update("other").digest("hex") };
  await assert.rejects(f.service.saveGoogleOAuth("ws", "owner", "gmail", data), (error) => codeOf(error) === "GOOGLE_OAUTH_SCOPE_UNVERIFIED");
  assert.equal(f.writes(), 0);
});

test("a winning reconnect preserves its verified token binding when a stale refresh loses CAS", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope, gmailWriteScope]), expiresAt: "2020-01-01T00:00:00Z" }, undefined, ["readonly", "modify"]);
    const winner = { ...grant("alpha", [gmailReadScope, gmailWriteScope]), accessToken: "winning-token", scopeTokenHash: createHash("sha256").update("winning-token").digest("hex") };
    globalThis.fetch = async () => {
      await f.service.saveGoogleOAuth("ws", "owner", "gmail", winner, a.id, ["readonly", "modify"]);
      return new Response(JSON.stringify({ access_token: "stale-token", expires_in: 3600, scope: `${gmailReadScope} ${gmailWriteScope}` }));
    };
    const current = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(current.accessToken, "winning-token");
    assert.equal(current.scopeTokenHash, createHash("sha256").update("winning-token").digest("hex"));
    assert.equal(hasBoundWriteGrant(current), true);
    assert.equal(JSON.parse(f.rows[0]!.encryptedData).accessToken, "winning-token");
  } finally { restore(); }
});

test("explicit Gmail consent binds selections to state and rejects partial or tampered grants", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const old = await f.service.saveGoogleOAuth("ws", "owner", "gmail", grant("alpha", [gmailReadScope]));
    const h = oauthHarness(f.service);
    let scope = ""; let providerCalls = 0;
    globalThis.fetch = async (url) => {
      providerCalls++;
      return String(url).includes("userinfo") ? new Response(JSON.stringify({ sub: "alpha", email: "alpha@example.test", email_verified: true })) : new Response(JSON.stringify({ access_token: "new-token", refresh_token: "new-refresh", expires_in: 3600, scope }));
    };
    await h.controller.connectGmail("ws", h.request, h.response, old.id, "readonly,send,labels");
    let auth = new URL(h.redirect()); let state = auth.searchParams.get("state")!;
    assert.ok(auth.searchParams.get("scope")!.includes("gmail.send"));
    assert.ok(auth.searchParams.get("scope")!.includes("gmail.labels"));
    assert.ok(!auth.searchParams.get("scope")!.includes("gmail.modify"));
    const parts = state.split(".");
    const payload = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
    payload.gmailCapabilities = ["readonly"];
    const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${parts[1]}`;
    await h.controller.callback("code", tampered, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "invalid_state");
    assert.equal(providerCalls, 0);
    scope = auth.searchParams.get("scope")!.split(" ").filter((item) => !item.endsWith("gmail.send")).join(" ");
    await h.controller.callback("code", state, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "scope_missing");
    assert.equal(new URL(h.redirect()).searchParams.get("capabilities"), "readonly,send,labels");
    assert.equal(f.writes(), 1);
    await h.controller.connectGmail("ws", h.request, h.response, old.id, "readonly,send,labels");
    auth = new URL(h.redirect()); state = auth.searchParams.get("state")!;
    scope = `${auth.searchParams.get("scope")} ${gmailWriteScope}`;
    await h.controller.callback("code", state, h.request, h.response);
    const result = await f.service.readGoogleForExecution(old.id, "ws", CredentialProvider.GMAIL);
    assert.deepEqual(result.grantedScopes, [gmailReadScope, "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.labels"]);
    assert.equal(hasBoundWriteGrant(result), false);
    const [summary] = await f.service.list("ws", "owner");
    assert.deepEqual(summary?.gmailCapabilities, ["readonly", "send", "labels"]);
  } finally { restore(); }
});

test("Gmail capability input is allowlisted and read access remains required", async () => {
  const restore = oauthEnvironment();
  const h = oauthHarness({ requireOwner: async () => {} });
  try {
    for (const value of ["send", "readonly,send,send", "readonly,unknown", "readonly,https://example.test"]) {
      await assert.rejects(h.controller.connectGmail("ws", h.request, h.response, undefined, value));
    }
  } finally { restore(); }
});

test("an omitted refresh scope fails closed when the refresh-token grant binding is invalid", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope, gmailWriteScope]), expiresAt: "2020-01-01T00:00:00Z" }, undefined, ["readonly", "modify"]);
    const data = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
    data.refreshToken = "different-refresh";
    f.rows[0]!.encryptedData = JSON.stringify(data);
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600 }));
    const current = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(current.scopeTokenHash, "");
    assert.equal(hasBoundWriteGrant(current), false);
  } finally { restore(); }
});

test("refresh-token rotation rebinds the verified grant and selected capabilities", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope, gmailWriteScope]), expiresAt: "2020-01-01T00:00:00Z" }, undefined, ["readonly", "modify"]);
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      const body = init?.body as URLSearchParams;
      calls++;
      assert.equal(body.get("refresh_token"), calls === 1 ? "refresh-alpha" : "rotated-refresh");
      assert.equal(body.has("scope"), false);
      return new Response(JSON.stringify({ access_token: `access-${calls}`, expires_in: 3600, ...(calls === 1 ? { refresh_token: "rotated-refresh" } : {}) }));
    };
    const first = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(hasBoundWriteGrant(first), true);
    const stored = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
    stored.expiresAt = "2020-01-01T00:00:00Z";
    f.rows[0]!.encryptedData = JSON.stringify(stored);
    const second = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(second.accessToken, "access-2");
    assert.equal(hasBoundWriteGrant(second), true);
  } finally { restore(); }
});

test("a narrowed explicit grant becomes a safe baseline for the next omitted scope", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope, gmailWriteScope]), expiresAt: "2020-01-01T00:00:00Z" }, undefined, ["readonly", "modify"]);
    let calls = 0;
    globalThis.fetch = async () => new Response(JSON.stringify(++calls === 1 ? { access_token: "one", expires_in: 3600, scope: gmailReadScope } : { access_token: "two", expires_in: 3600 }));
    const first = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(first.scopeTokenHash, createHash("sha256").update("one").digest("hex"));
    assert.equal(hasBoundWriteGrant(first), false);
    const stored = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
    assert.ok(stored.refreshGrantProof);
    stored.expiresAt = "2020-01-01T00:00:00Z";
    f.rows[0]!.encryptedData = JSON.stringify(stored);
    const second = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(second.scopeTokenHash, createHash("sha256").update("two").digest("hex"));
    assert.equal(hasBoundWriteGrant(second), false);
  } finally { restore(); }
});

test("older access-scope proofs remain readable but cannot infer an unbound refresh grant", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", grant("alpha", [gmailReadScope]));
    const stored = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
    delete stored.refreshGrantScopes;
    delete stored.refreshGrantProof;
    f.rows[0]!.encryptedData = JSON.stringify(stored);
    const beforeExpiry = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(beforeExpiry.scopeTokenHash, createHash("sha256").update("access-alpha").digest("hex"));
    stored.expiresAt = "2020-01-01T00:00:00Z";
    f.rows[0]!.encryptedData = JSON.stringify(stored);
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "refreshed", expires_in: 3600 }));
    const afterRefresh = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(afterRefresh.scopeTokenHash, undefined);
    assert.equal(afterRefresh.grantedScopes, undefined);
  } finally { restore(); }
});

test("all Gmail capability scopes are requested only when the owner selects them", async () => {
  const restore = oauthEnvironment();
  const h = oauthHarness({ requireOwner: async () => {} });
  try {
    await h.controller.connectGmail("ws", h.request, h.response);
    let scope = new URL(h.redirect()).searchParams.get("scope")!;
    assert.ok(scope.includes("gmail.readonly"));
    for (const suffix of ["gmail.send", "gmail.compose", "gmail.modify", "gmail.labels"]) assert.ok(!scope.includes(suffix));
    await h.controller.connectGmail("ws", h.request, h.response, undefined, "readonly,send,compose,modify,labels");
    scope = new URL(h.redirect()).searchParams.get("scope")!;
    for (const suffix of ["gmail.readonly", "gmail.send", "gmail.compose", "gmail.modify", "gmail.labels"]) assert.ok(scope.includes(suffix));
  } finally { restore(); }
});

test("concurrent refreshes serialize provider requests and reread the winning token", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    let calls = 0; let releaseProvider!: () => void; let enteredProvider!: () => void;
    const entered = new Promise<void>((resolve) => { enteredProvider = resolve; });
    const gate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    globalThis.fetch = async () => { calls++; enteredProvider(); await gate; return new Response(JSON.stringify({ access_token: "winner", expires_in: 3600 })); };
    const first = f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    await entered;
    let sawBusy!: () => void;
    const busy = new Promise<void>((resolve) => { sawBusy = resolve; });
    f.onBusy(() => { if (f.busyCalls() >= 12) sawBusy(); });
    const contenders = Array.from({ length: 12 }, () => f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL));
    await busy;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.activeTransactions(), 1);
    assert.ok(f.busyCalls() >= 12);
    releaseProvider();
    const [left, ...others] = await Promise.all([first, ...contenders]);
    assert.equal(calls, 1);
    assert.equal(left!.accessToken, "winner");
    assert.ok(others.every((entry) => entry.accessToken === "winner"));
    assert.equal(left!.scopeTokenHash, createHash("sha256").update("winner").digest("hex"));
  } finally { restore(); }
});

test("a failed refresh rereads a concurrently reconnected valid token", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    const winner = { ...grant("alpha", [gmailReadScope]), accessToken: "winner", scopeTokenHash: createHash("sha256").update("winner").digest("hex") };
    globalThis.fetch = async () => { await f.service.saveGoogleOAuth("ws", "owner", "gmail", winner, a.id); return new Response("{}", { status: 400 }); };
    const current = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.equal(current.accessToken, "winner");
    assert.equal(current.scopeTokenHash, createHash("sha256").update("winner").digest("hex"));
  } finally { restore(); }
});

test("advisory-lock failure does not call Google and produces a safe retry error", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    f.failLock(); let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("unexpected provider call"); };
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL), (error) => codeOf(error) === "GOOGLE_TOKEN_REFRESH_FAILED");
    assert.equal(calls, 0);
  } finally { restore(); }
});

test("an expanded refresh grant is usable only for that token and requires actionable reconnect at expiry", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ access_token: "new", expires_in: 3600, scope: `${gmailReadScope} ${gmailWriteScope}` })); };
    const current = await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    assert.deepEqual(current.grantedScopes, [gmailReadScope]);
    assert.equal(current.scopeTokenHash, createHash("sha256").update("new").digest("hex"));
    const stored = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
    assert.equal(stored.refreshGrantAmbiguous, true);
    assert.equal((await f.service.list("ws", "owner"))[0]?.googleReconnectRequired, true);
    stored.expiresAt = "2020-01-01T00:00:00Z";
    f.rows[0]!.encryptedData = JSON.stringify(stored);
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL), (error) => codeOf(error) === "GOOGLE_OAUTH_REFRESH_SCOPE_UNVERIFIED");
    assert.equal(calls, 1);
  } finally { restore(); }
});

test("broader Gmail scopes satisfy selected capabilities without projecting unselected privileges", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    for (const broad of [gmailWriteScope, "https://mail.google.com/"]) {
      const old = await f.service.saveGoogleOAuth("ws", "owner", "gmail", grant("alpha", [broad]), undefined, ["readonly", "send"]);
      const current = await f.service.readGoogleForExecution(old.id, "ws", CredentialProvider.GMAIL);
      assert.deepEqual(current.grantedScopes, [gmailReadScope, "https://www.googleapis.com/auth/gmail.send"]);
      assert.equal(hasBoundWriteGrant(current), false);
      assert.equal(current.scopeTokenHash, createHash("sha256").update("access-alpha").digest("hex"));
    }
    const h = oauthHarness(f.service);
    await h.controller.connectGmail("ws", h.request, h.response, undefined, "readonly,send");
    const auth = new URL(h.redirect());
    globalThis.fetch = async (url) => String(url).includes("userinfo") ? new Response(JSON.stringify({ sub: "alpha", email: "alpha@example.test", email_verified: true })) : new Response(JSON.stringify({ access_token: "fresh", refresh_token: "refresh", expires_in: 3600, scope: `openid ${gmailWriteScope}` }));
    await h.controller.callback("code", auth.searchParams.get("state")!, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("connected"), "gmail");
    const row = f.rows[f.rows.length - 1]!;
    const current = await f.service.readGoogleForExecution(row.id, "ws", CredentialProvider.GMAIL);
    assert.deepEqual(current.grantedScopes, [gmailReadScope, "https://www.googleapis.com/auth/gmail.send"]);
  } finally { restore(); }
});

test("a rotated refresh token is retained even if Google removes required scopes", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "google", { ...grant("alpha"), expiresAt: "2020-01-01T00:00:00Z" });
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "narrow", refresh_token: "rotated", expires_in: 3600, scope: googleConnectionPolicy.google.scopes[0] }));
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws"), (error) => codeOf(error) === "GOOGLE_OAUTH_SCOPE_MISSING");
    const stored = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
    assert.equal(stored.refreshToken, "rotated");
    assert.equal((await f.service.list("ws", "owner"))[0]?.googleReconnectRequired, true);
  } finally { restore(); }
});

test("readonly and labels project from a full Gmail grant without exposing unselected capabilities", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const id = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", ["https://mail.google.com/"]), expiresAt: "2020-01-01T00:00:00Z" }, undefined, ["readonly", "labels"]);
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "new", expires_in: 3600, scope: "https://mail.google.com/" }));
    const data = await f.service.readGoogleForExecution(id.id, "ws", CredentialProvider.GMAIL);
    assert.deepEqual(data.grantedScopes, [gmailReadScope, "https://www.googleapis.com/auth/gmail.labels"]);
    assert.equal(data.scopeTokenHash, createHash("sha256").update("new").digest("hex"));
    assert.equal(hasBoundWriteGrant(data), false);
  } finally { restore(); }
});

test("pre-proof scoped credentials across Google providers remain legacy-compatible after refresh", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const entries = [
      { provider: CredentialProvider.GOOGLE, label: "Google OAuth", scopes: googleConnectionPolicy.google.scopes },
      { provider: CredentialProvider.GMAIL, label: "Gmail OAuth", scopes: [gmailReadScope, gmailWriteScope] },
      { provider: CredentialProvider.GOOGLE_CHAT_OAUTH, label: "Google Chat OAuth", scopes: googleConnectionPolicy.chat.scopes },
      { provider: CredentialProvider.GOOGLE_CALENDAR, label: "Google Calendar OAuth", scopes: googleConnectionPolicy.calendar.scopes },
    ] as const;
    for (const [index, entry] of entries.entries()) {
      const id = `legacy-${index}`;
      f.rows.push({ id, workspaceId: "ws", provider: entry.provider, label: entry.label, encryptedData: JSON.stringify({ accessToken: "old", refreshToken: "refresh", expiresAt: "2020-01-01T00:00:00Z", grantedScopes: entry.scopes, scopeTokenHash: createHash("sha256").update("old").digest("hex") }), createdAt: new Date(), updatedAt: new Date() });
      globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }));
      const current = await f.service.readGoogleForExecution(id, "ws", entry.provider);
      assert.equal(current.accessToken, "new");
      assert.equal(current.grantedScopes, undefined);
      assert.equal(current.scopeTokenHash, undefined);
      assert.equal(hasBoundWriteGrant(current), false);
      const persisted = JSON.parse(f.rows.find((row) => row.id === id)!.encryptedData) as Record<string, unknown>;
      assert.equal(persisted.refreshGrantAmbiguous, undefined);
      assert.equal(persisted.grantedScopes, undefined);
      assert.equal((await f.service.list("ws", "owner")).find((item) => item.id === id)?.googleLegacyScopesUnverified, true);
    }
  } finally { restore(); }
});

test("a busy refresh stops at its total deadline without issuing a second provider call", async () => {
  const restore = oauthEnvironment(); const f = fixture(); const originalNow = Date.now;
  let releaseProvider!: () => void;
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    let enteredProvider!: () => void; let calls = 0;
    const entered = new Promise<void>((resolve) => { enteredProvider = resolve; });
    const gate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    globalThis.fetch = async () => { calls++; enteredProvider(); await gate; return new Response(JSON.stringify({ access_token: "winner", expires_in: 3600 })); };
    const first = f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL);
    await entered;
    let time = originalNow();
    Date.now = () => time;
    f.onBusy(() => { time += 26_000; });
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL), (error) => codeOf(error) === "GOOGLE_TOKEN_REFRESH_BUSY");
    assert.equal(calls, 1);
    Date.now = originalNow;
    releaseProvider();
    assert.equal((await first).accessToken, "winner");
  } finally { Date.now = originalNow; releaseProvider?.(); restore(); }
});

test("authenticated access scopes without a refresh-grant proof downgrade safely for every Google provider", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const entries = [
      { kind: "google", provider: CredentialProvider.GOOGLE, scopes: googleConnectionPolicy.google.scopes },
      { kind: "gmail", provider: CredentialProvider.GMAIL, scopes: googleConnectionPolicy.gmail.scopes },
      { kind: "chat", provider: CredentialProvider.GOOGLE_CHAT_OAUTH, scopes: googleConnectionPolicy.chat.scopes },
      { kind: "calendar", provider: CredentialProvider.GOOGLE_CALENDAR, scopes: googleConnectionPolicy.calendar.scopes },
    ] as const;
    for (const entry of entries) {
      const credential = await f.service.saveGoogleOAuth("ws", "owner", entry.kind, grant("alpha", entry.scopes));
      const row = f.rows.find((item) => item.id === credential.id)!;
      const stored = JSON.parse(row.encryptedData) as Record<string, unknown>;
      delete stored.refreshGrantScopes;
      delete stored.refreshGrantProof;
      stored.expiresAt = "2020-01-01T00:00:00Z";
      row.encryptedData = JSON.stringify(stored);
      globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }));
      const current = await f.service.readGoogleForExecution(credential.id, "ws", entry.provider);
      assert.equal(current.accessToken, "new");
      assert.equal(current.grantedScopes, undefined);
      assert.equal(current.scopeTokenHash, undefined);
      assert.equal(hasBoundWriteGrant(current), false);
    }
  } finally { restore(); }
});


test("pool checkout timeouts retry within the deadline, including a timed-out reread", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    let attempts = 0; let calls = 0;
    f.beforeTransaction(({ maxWait, timeout }) => {
      attempts++;
      assert.ok(maxWait <= 1000 && timeout > 0 && maxWait + timeout <= 25_000);
      if (attempts === 1) throw Object.assign(new Error("pool timeout"), { code: "P2024" });
      if (attempts === 2) throw Object.assign(new Error("Unable to start a transaction in the given time"), { code: "P2028" });
    });
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ access_token: "winner", expires_in: 3600 })); };
    assert.equal((await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL)).accessToken, "winner");
    assert.equal(attempts, 3);
    assert.equal(calls, 1);
  } finally { restore(); }
});

test("checkout timeout exhausts the total budget without an unbounded final reread", async () => {
  const restore = oauthEnvironment(); const f = fixture(); const originalNow = Date.now;
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    let now = originalNow(); let attempts = 0; let calls = 0;
    Date.now = () => now;
    f.beforeTransaction(() => { attempts++; now += 25_000; throw Object.assign(new Error("pool timeout"), { code: "P2024" }); });
    globalThis.fetch = async () => { calls++; throw new Error("unexpected provider call"); };
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL), (error) => codeOf(error) === "GOOGLE_TOKEN_REFRESH_BUSY");
    assert.equal(attempts, 1);
    assert.equal(calls, 0);
  } finally { Date.now = originalNow; restore(); }
});

test("non-checkout transaction errors are not retried as pool contention", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    let attempts = 0; let calls = 0;
    f.beforeTransaction(() => { attempts++; if (attempts === 1) throw Object.assign(new Error("unrelated transaction failure"), { code: "P2028" }); });
    globalThis.fetch = async () => { calls++; throw new Error("unexpected provider call"); };
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL), (error) => codeOf(error) === "GOOGLE_TOKEN_REFRESH_FAILED");
    assert.equal(attempts, 2); // One bounded recovery reread; no refresh retry.
    assert.equal(calls, 0);
  } finally { restore(); }
});


test("a pool-coded error after transaction entry is not retried", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    let attempts = 0;
    f.beforeTransaction(() => { attempts++; });
    f.failLockWith(Object.assign(new Error("query failed"), { code: "P2024" }));
    await assert.rejects(f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL), (error) => codeOf(error) === "GOOGLE_TOKEN_REFRESH_FAILED");
    assert.equal(attempts, 2); // One lock attempt and one recovery reread.
  } finally { restore(); }
});

test("checkout timeout rereads and reuses a concurrent reconnect", async () => {
  const restore = oauthEnvironment(); const f = fixture();
  try {
    const a = await f.service.saveGoogleOAuth("ws", "owner", "gmail", { ...grant("alpha", [gmailReadScope]), expiresAt: "2020-01-01T00:00:00Z" });
    let attempts = 0; let calls = 0;
    f.beforeTransaction(() => {
      attempts++;
      if (attempts === 1) {
        const current = JSON.parse(f.rows[0]!.encryptedData) as Record<string, unknown>;
        current.expiresAt = "2099-01-01T00:00:00Z";
        f.rows[0]!.encryptedData = JSON.stringify(current);
        throw Object.assign(new Error("pool timeout"), { code: "P2024" });
      }
    });
    globalThis.fetch = async () => { calls++; throw new Error("unexpected provider call"); };
    assert.equal((await f.service.readGoogleForExecution(a.id, "ws", CredentialProvider.GMAIL)).accessToken, "access-alpha");
    assert.equal(attempts, 2);
    assert.equal(calls, 0);
  } finally { restore(); }
});
