import assert from "node:assert/strict";
import test from "node:test";
import { AuthController } from "./auth.controller";

test("Google sign-in bounds both provider requests and handles a timeout without creating a session", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_AUTH_REDIRECT_URI", "WEB_ORIGIN"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", GOOGLE_AUTH_REDIRECT_URI: "http://localhost/callback", WEB_ORIGIN: "http://localhost:3000" });
  const signals: AbortSignal[] = [];
  const redirects: string[] = [];
  let sessions = 0;
  const controller = new AuthController({ loginWithIdentity: async () => { sessions++; return { token: "synthetic-session" }; } } as never);
  const request = { headers: { cookie: "workflow_google_auth_state=synthetic-state" } } as never;
  const response = { clearCookie: () => {}, cookie: () => {}, redirect: (url: string) => { redirects.push(url); return url; } } as never;
  try {
    globalThis.fetch = async (_input, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      signals.push(init.signal);
      return signals.length === 1
        ? Response.json({ id_token: "synthetic-id-token" })
        : Response.json({ aud: "synthetic-client", iss: "https://accounts.google.com", email_verified: "true", sub: "synthetic-user", email: "owner@example.test" });
    };
    await controller.completeGoogleLogin("synthetic-code", "synthetic-state", undefined, request, response);
    assert.equal(signals.length, 2);
    assert.equal(sessions, 1);
    assert.equal(new URL(redirects[0]!).pathname, "/dashboard");

    globalThis.fetch = async (_input, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      throw new DOMException("Synthetic timeout", "TimeoutError");
    };
    await controller.completeGoogleLogin("synthetic-code", "synthetic-state", undefined, request, response);
    assert.equal(sessions, 1);
    assert.equal(new URL(redirects[1]!).searchParams.get("authError"), "google_failed");

    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      if (++calls === 1) return Response.json({ id_token: "synthetic-id-token" });
      throw new DOMException("Synthetic timeout", "TimeoutError");
    };
    await controller.completeGoogleLogin("synthetic-code", "synthetic-state", undefined, request, response);
    assert.equal(calls, 2);
    assert.equal(sessions, 1);
    assert.equal(new URL(redirects[2]!).searchParams.get("authError"), "google_failed");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
