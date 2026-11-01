import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { GoogleOAuthController } from "./google-oauth.controller";

test("Calendar OAuth requests only event read permission and rejects incomplete grants", async () => {
  const names = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "APP_ENCRYPTION_KEY", "WEB_ORIGIN"] as const;
  const before = new Map(names.map((key) => [key, process.env[key]])); const originalFetch = globalThis.fetch;
  Object.assign(process.env, { GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", GOOGLE_REDIRECT_URI: "https://api.example.test/callback", APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), WEB_ORIGIN: "https://example.test" });
  let writes = 0; let redirect = "";
  const controller = new GoogleOAuthController({ requireOwner: async () => {}, upsertGoogleCalendarOAuth: async () => { writes++; } } as never);
  const request = { currentUser: { id: "owner" } } as never;
  const response = { redirect: (url: string) => { redirect = url; } } as unknown as Response;
  try {
    await controller.connectCalendar("workspace", request, response);
    const auth = new URL(redirect); const state = auth.searchParams.get("state")!; const scope = auth.searchParams.get("scope")!;
    assert.equal(scope, "https://www.googleapis.com/auth/calendar.events.readonly");
    assert.equal(auth.searchParams.get("include_granted_scopes"), "false");
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope: "missing" }));
    await assert.rejects(controller.callback("code", state, request, response));
    assert.equal(writes, 0);
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope }));
    await controller.callback("code", state, request, response);
    assert.equal(writes, 1);
    assert.equal(new URL(redirect).searchParams.get("connected"), "google-calendar");
  } finally { globalThis.fetch = originalFetch; for (const key of names) { const value = before.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
