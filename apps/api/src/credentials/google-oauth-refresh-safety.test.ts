import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { GoogleOAuthController } from "./google-oauth.controller";

test("Google OAuth never replaces an offline connection when the token response has no usable refresh token", async () => {
  const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "APP_ENCRYPTION_KEY", "WEB_ORIGIN"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_CLIENT_ID = "synthetic-client";
  process.env.GOOGLE_CLIENT_SECRET = "synthetic-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://api.example.test/oauth/google/callback";
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  process.env.WEB_ORIGIN = "https://example.test";

  let saved = { accessToken: "old-access", refreshToken: "old-refresh" };
  let saves = 0;
  const service = {
    requireOwner: async () => {},
    upsertGoogleOAuth: async (_workspace: string, _user: string, data: typeof saved) => { saved = data; saves++; },
  };
  const controller = new GoogleOAuthController(service as never);
  const request = { currentUser: { id: "user-1" } } as never;
  let redirect = "";
  const response = { redirect: (value: string) => { redirect = value; } } as unknown as Response;
  try {
    await controller.connect("workspace-1", request, response);
    const state = new URL(redirect).searchParams.get("state")!;
    for (const refreshToken of [undefined, null, "", "  ", 123]) {
      globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "new-access", refresh_token: refreshToken, expires_in: 3600 }), { status: 200 });
      await assert.rejects(controller.callback("synthetic-code", state, request, response), (error: unknown) => {
        const result = error as { response?: { code?: string; message?: string } };
        return result.response?.code === "GOOGLE_OAUTH_REFRESH_TOKEN_MISSING" && !JSON.stringify(result.response).includes("new-access");
      });
      assert.equal(saves, 0);
      assert.deepEqual(saved, { accessToken: "old-access", refreshToken: "old-refresh" });
    }
    for (const expiresIn of [undefined, 0, -1, "3600", Number.MAX_SAFE_INTEGER]) {
      globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: expiresIn }), { status: 200 });
      await assert.rejects(controller.callback("synthetic-code", state, request, response));
      assert.equal(saves, 0);
    }
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }), { status: 200 });
    await controller.callback("synthetic-code", state, request, response);
    assert.equal(saves, 1);
    assert.equal(saved.refreshToken, "new-refresh");
    assert.equal(redirect, "https://example.test/editor?connected=google");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
