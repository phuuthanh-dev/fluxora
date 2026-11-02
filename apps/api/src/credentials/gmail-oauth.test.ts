import assert from "node:assert/strict";
import test from "node:test";
import { oauthEnvironment, oauthHarness } from "./google-oauth-test-helpers";

test("Gmail requests its own scope and saves only a verified complete grant", async () => {
  const restore = oauthEnvironment(); let kind = "";
  const h = oauthHarness({ requireOwner: async () => {}, saveGoogleOAuth: async (_ws: string, _user: string, value: string) => { kind = value; } });
  try {
    await h.controller.connectGmail("workspace", h.request, h.response);
    const auth = new URL(h.redirect()); const scope = auth.searchParams.get("scope")!;
    assert.equal(scope, "openid email https://www.googleapis.com/auth/gmail.readonly");
    assert.equal(auth.searchParams.get("include_granted_scopes"), null);
    globalThis.fetch = async (url) => String(url).includes("userinfo") ? new Response(JSON.stringify({ sub: "subject", email: "owner@example.test", email_verified: true })) : new Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope }));
    await h.controller.callback("code", auth.searchParams.get("state")!, h.request, h.response);
    assert.equal(kind, "gmail");
    assert.equal(new URL(h.redirect()).searchParams.get("connected"), "gmail");
  } finally { restore(); }
});
