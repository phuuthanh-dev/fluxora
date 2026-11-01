import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { GoogleOAuthController } from "./google-oauth.controller";

test("Gmail OAuth is separate, checks granted scope and preserves existing connections on missing refresh", async () => {
  const names = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "APP_ENCRYPTION_KEY", "WEB_ORIGIN"] as const;
  const before = new Map(names.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", GOOGLE_REDIRECT_URI: "https://api.example.test/callback", APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), WEB_ORIGIN: "https://example.test" });
  let gmailWrites = 0; let otherWrites = 0; let redirect = "";
  const service = { requireOwner: async () => {}, upsertGmailOAuth: async () => { gmailWrites++; }, upsertGoogleChatOAuth: async () => { otherWrites++; }, upsertGoogleOAuth: async () => { otherWrites++; } };
  const controller = new GoogleOAuthController(service as never);
  const request = { currentUser: { id: "owner" } } as never;
  const response = { redirect: (url: string) => { redirect = url; } } as unknown as Response;
  try {
    await controller.connectGmail("workspace", request, response);
    const auth = new URL(redirect); const state = auth.searchParams.get("state")!; const scope = auth.searchParams.get("scope")!;
    assert.equal(scope, "https://www.googleapis.com/auth/gmail.readonly");
    assert.equal(auth.searchParams.get("include_granted_scopes"), "false");
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "token", expires_in: 3600, scope }));
    await controller.callback("code", state, request, response);
    assert.equal(new URL(redirect).searchParams.get("google_oauth"), "gmail_missing_refresh");
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope: "missing" }));
    await assert.rejects(controller.callback("code", state, request, response));
    assert.equal(gmailWrites, 0);
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope }));
    await controller.callback("code", state, request, response);
    assert.equal(gmailWrites, 1); assert.equal(otherWrites, 0);
    assert.equal(new URL(redirect).searchParams.get("connected"), "gmail");
    await assert.rejects(controller.callback("code", state, { currentUser: { id: "other" } } as never, response));
  } finally { globalThis.fetch = originalFetch; for (const key of names) { const value = before.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
