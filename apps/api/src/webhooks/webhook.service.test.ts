import assert from "node:assert/strict";
import test from "node:test";
import { hashWebhookSecret, matchesWebhookSecret } from "./webhook.service";

test("webhook secret hashes cannot be used as the original secret and only the correct secret matches", () => {
  const secret = "a-random-webhook-secret";
  const hash = hashWebhookSecret(secret);
  assert.notEqual(hash, secret);
  assert.equal(matchesWebhookSecret(secret, hash), true);
  assert.equal(matchesWebhookSecret("wrong-secret", hash), false);
  assert.equal(matchesWebhookSecret(secret, "not-a-sha256-hash"), false);
});
