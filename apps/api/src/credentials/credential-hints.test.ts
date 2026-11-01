import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { credentialHints } from "./credential-hints";

test("only allowlisted long opaque tokens expose a fixed mask and two trailing characters", () => {
  const apiKey = "fixture_api_key_0123456789ab";
  const token = "fixture_token_0123456789xyz9";
  assert.deepEqual(credentialHints(CredentialProvider.TRELLO, { apiKey, token, password: "another_long_fixture_password" }), [
    { field: "apiKey", label: "API key", masked: "••••••ab" },
    { field: "token", label: "Token", masked: "••••••z9" },
  ]);
  assert.deepEqual(credentialHints(CredentialProvider.TRELLO, { apiKey: "short", token: "https://example.test/a/secret" }), []);
  for (const provider of [CredentialProvider.SMTP, CredentialProvider.MONGODB, CredentialProvider.GOOGLE, CredentialProvider.DISCORD_WEBHOOK]) {
    assert.deepEqual(credentialHints(provider, { token, password: token, accessToken: token, webhookUrl: token }), []);
  }
});
