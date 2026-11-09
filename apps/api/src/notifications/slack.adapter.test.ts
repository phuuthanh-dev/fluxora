import assert from "node:assert/strict";
import test from "node:test";
import { NodeFailure } from "../execution/node-failure";
import { SlackNotificationAdapter, validateSlackWebhookUrl } from "./slack.adapter";

const url = "https://hooks.slack.com/services/T123/B456/syntheticsecret";
test("Slack webhook validates destination and never exposes its URL in receipts", async () => {
  for (const bad of ["http://hooks.slack.com/services/T/B/secret", "https://hooks.slack.com.attacker.test/services/T/B/secret", `${url}?token=secret`, "https://hooks.slack.com/services/T/B"]) assert.throws(() => validateSlackWebhookUrl(bad));
  const mock = await new SlackNotificationAdapter().send({ provider: "slack", message: "Sample" }, undefined, "mock");
  assert.equal(mock.delivered, true);
  assert.equal(JSON.stringify(mock).includes("syntheticsecret"), false);
});

test("Slack sends one POST and treats an unconfirmed receipt as uncertain", async () => {
  const original = globalThis.fetch;
  const allowed = process.env.OUTBOUND_ALLOWED_HOSTNAMES;
  process.env.OUTBOUND_ALLOWED_HOSTNAMES = "hooks.slack.com";
  let calls = 0;
  try {
    globalThis.fetch = (async (_url, init) => { calls++; assert.equal(init?.method, "POST"); return new Response("ok"); }) as typeof fetch;
    const result = await new SlackNotificationAdapter().send({ provider: "slack", message: "Sample" }, { webhookUrl: url });
    assert.equal(calls, 1); assert.equal(result.delivered, true); assert.ok(!JSON.stringify(result).includes("syntheticsecret"));
    globalThis.fetch = (async () => { calls++; return new Response("unknown receipt"); }) as typeof fetch;
    await assert.rejects(() => new SlackNotificationAdapter().send({ provider: "slack", message: "Sample" }, { webhookUrl: url }), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; if (allowed === undefined) delete process.env.OUTBOUND_ALLOWED_HOSTNAMES; else process.env.OUTBOUND_ALLOWED_HOSTNAMES = allowed; }
});
