import assert from "node:assert/strict";
import test from "node:test";
import { oauthEnvironment, oauthHarness } from "./google-oauth-test-helpers";

test("Chat uses separate scopes and rejects incomplete grants", async () => {
  const restore = oauthEnvironment(); let writes = 0;
  const h = oauthHarness({ requireOwner: async () => {}, saveGoogleOAuth: async () => { writes++; } });
  try {
    await h.controller.connectChat("workspace", h.request, h.response);
    const auth = new URL(h.redirect()); const scope = auth.searchParams.get("scope")!;
    assert.ok(scope.includes("chat.messages.create") && scope.includes("chat.spaces.readonly"));
    assert.ok(!scope.includes("auth/drive"));
    assert.equal(auth.searchParams.get("include_granted_scopes"), null);
    globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "token", refresh_token: "refresh", expires_in: 3600, scope: "openid" }));
    await h.controller.callback("code", auth.searchParams.get("state")!, h.request, h.response);
    assert.equal(new URL(h.redirect()).searchParams.get("google_oauth"), "scope_missing");
    assert.equal(writes, 0);
  } finally { restore(); }
});
