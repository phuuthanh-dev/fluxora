import assert from "node:assert/strict";
import test from "node:test";
import { oauthEnvironment, oauthHarness } from "./google-oauth-test-helpers";

test("Drive and Sheets require a complete offline grant and preserve the selected target on retry", async () => {
  const restore = oauthEnvironment();
  let saves = 0;
  const h = oauthHarness({ requireOwner: async () => {}, requireGoogleReconnectTarget: async () => {}, saveGoogleOAuth: async () => { saves++; } });
  try {
    for (const refreshToken of [undefined, null, "", "  ", 123]) {
      await h.controller.connect("workspace", h.request, h.response, "credential-1");
      const auth = new URL(h.redirect());
      assert.equal(auth.searchParams.get("include_granted_scopes"), null);
      assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
      assert.ok(auth.searchParams.get("scope")?.includes("auth/drive"));
      globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "access", refresh_token: refreshToken, expires_in: 3600 }));
      await h.controller.callback("code", auth.searchParams.get("state")!, h.request, h.response);
      const recovery = new URL(h.redirect());
      assert.equal(recovery.searchParams.get("google_oauth"), "missing_refresh");
      assert.equal(recovery.searchParams.get("credentialId"), "credential-1");
      assert.ok(!h.redirect().includes("access"));
    }
    assert.equal(saves, 0);
  } finally { restore(); }
});

test("an invalid Google token expiry never replaces an existing connection", async () => {
  const restore = oauthEnvironment();
  let saves = 0;
  const h = oauthHarness({ requireOwner: async () => {}, requireGoogleReconnectTarget: async () => {}, saveGoogleOAuth: async () => { saves++; } });
  try {
    for (const expiresIn of [undefined, null, 0, -1, "3600", Number.MAX_SAFE_INTEGER]) {
      await h.controller.connect("workspace", h.request, h.response, "credential-1");
      const state = new URL(h.redirect()).searchParams.get("state")!;
      globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: expiresIn }));
      await h.controller.callback("code", state, h.request, h.response);
      const recovery = new URL(h.redirect());
      assert.equal(recovery.searchParams.get("google_oauth"), "token_failed");
      assert.equal(recovery.searchParams.get("credentialId"), "credential-1");
      assert.ok(!h.redirect().includes("new-access") && !h.redirect().includes("new-refresh"));
    }
    assert.equal(saves, 0);
  } finally { restore(); }
});
