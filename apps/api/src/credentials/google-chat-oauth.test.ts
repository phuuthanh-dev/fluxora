import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { GoogleOAuthController } from "./google-oauth.controller";

test("Chat OAuth uses separate scopes and never overwrites Drive credentials", async () => {
  const names = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "APP_ENCRYPTION_KEY", "WEB_ORIGIN"] as const;
  const before = new Map(names.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", GOOGLE_REDIRECT_URI: "https://api.example.test/callback", APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), WEB_ORIGIN: "https://example.test" });
  let chatWrites = 0;
  let driveWrites = 0;
  let redirect = "";
  const service = { requireOwner: async () => {}, upsertGoogleChatOAuth: async () => { chatWrites++; }, upsertGoogleOAuth: async () => { driveWrites++; } };
  const controller = new GoogleOAuthController(service as never);
  const request = { currentUser: { id: "owner" } } as never;
  const response = { redirect: (url: string) => { redirect = url; } } as unknown as Response;
  try {
    await controller.connectChat("workspace", request, response);
    const auth = new URL(redirect);
    const state = auth.searchParams.get("state")!;
    const scopes = auth.searchParams.get("scope")!;
    assert.ok(scopes.includes("chat.messages.create") && scopes.includes("chat.spaces.readonly"));
    assert.ok(!scopes.includes("auth/drive"));
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "synthetic-token", expires_in: 3600, scope: scopes }));
    await controller.callback("code", state, request, response);
    assert.equal(new URL(redirect).searchParams.get("google_oauth"), "chat_missing_refresh");
    assert.equal(chatWrites, 0);
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_in: 3600, scope: "missing" }));
    await assert.rejects(controller.callback("code", state, request, response));
    assert.equal(chatWrites, 0);
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_in: 3600, scope: scopes }));
    await controller.callback("code", state, request, response);
    assert.equal(chatWrites, 1);
    assert.equal(driveWrites, 0);
    await assert.rejects(controller.callback("code", state, { currentUser: { id: "other" } } as never, response));
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of names) { const value = before.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
