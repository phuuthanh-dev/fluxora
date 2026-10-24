import assert from "node:assert/strict";
import test from "node:test";
import { createSteamOpenIdUrl, steamIdFromClaimedId } from "./steam-openid";

test("Steam OpenID start URL requests a claimed Steam identity and preserves the state", () => {
  const url = new URL(createSteamOpenIdUrl({ returnUri: "https://api.example.test/api/v1/auth/steam/callback", realm: "https://api.example.test", state: "csrf-state" }));
  assert.equal(url.origin + url.pathname, "https://steamcommunity.com/openid/login");
  assert.equal(url.searchParams.get("openid.mode"), "checkid_setup");
  assert.equal(url.searchParams.get("openid.return_to"), "https://api.example.test/api/v1/auth/steam/callback?state=csrf-state");
});

test("Steam OpenID only accepts an HTTPS 64-bit Steam claimed ID", () => {
  assert.equal(steamIdFromClaimedId("https://steamcommunity.com/openid/id/76561198000000000"), "76561198000000000");
  assert.throws(() => steamIdFromClaimedId("http://steamcommunity.com/openid/id/76561198000000000"));
  assert.throws(() => steamIdFromClaimedId("https://example.test/openid/id/76561198000000000"));
});
