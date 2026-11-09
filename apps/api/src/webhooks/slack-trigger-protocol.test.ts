import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizeSlackEvent, readSlackEnvelope, SLACK_EVENT_MAX_BYTES, verifySlackSignature } from "./slack-trigger-protocol";

const secret = "synthetic-slack-signing-fixture", timestamp = "1794213000";
const config = { event: "message", channel: "CEXAMPLE" };
const body = (event = {}, outer = {}) => Buffer.from(JSON.stringify({ type: "event_callback", event_id: "Ev123", team_id: "TEXAMPLE", api_app_id: "AEXAMPLE", event: { type: "message", channel: "CEXAMPLE", user: "UEXAMPLE", text: "Hello", ts: "1794213000.123456", ...event }, ...outer }));
const sign = (raw: Buffer) => `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:`).update(raw).digest("hex")}`;

test("Slack authenticates exact bytes and rejects stale, future, malformed or oversized requests", () => {
  const raw = body();
  assert.equal(verifySlackSignature(raw, sign(raw), timestamp, secret, Number(timestamp) * 1000), true);
  for (const [bytes, signature, stamp, now] of [[Buffer.concat([raw, Buffer.from(" ")]), sign(raw), timestamp, Number(timestamp) * 1000], [raw, "v0=bad", timestamp, Number(timestamp) * 1000], [raw, sign(raw), timestamp, Number(timestamp) * 1000 + 301000], [raw, sign(raw), timestamp, Number(timestamp) * 1000 - 301000], [Buffer.alloc(SLACK_EVENT_MAX_BYTES + 1), sign(raw), timestamp, Number(timestamp) * 1000]] as const) assert.equal(verifySlackSignature(bytes, signature, stamp, secret, now), false);
});

test("Slack narrows event payload, binds workspace/channel and prevents bot loops", () => {
  const result = normalizeSlackEvent(readSlackEnvelope(body({ token: "not-forwarded", blocks: [{ private: "unused" }] })), config, "TEXAMPLE", secret);
  assert.deepEqual(result, { source: "slack", event: "message", eventId: "Ev123", teamId: "TEXAMPLE", channel: "CEXAMPLE", user: "UEXAMPLE", text: "Hello", timestamp: "1794213000.123456", threadTimestamp: null });
  for (const event of [{ bot_id: "BBOT" }, { subtype: "bot_message" }, { subtype: "message_changed" }, { subtype: "message_deleted" }, { hidden: true }, { channel: "COTHER" }, { type: "app_mention" }]) assert.equal(normalizeSlackEvent(readSlackEnvelope(body(event)), config, "TEXAMPLE", secret), null);
  assert.equal(normalizeSlackEvent(readSlackEnvelope(body()), config, "TOTHER", secret), null);
  assert.equal(normalizeSlackEvent(readSlackEnvelope(body({ type: "app_mention", thread_ts: "1794212000.000001" })), { ...config, event: "app_mention" }, "TEXAMPLE", secret)?.threadTimestamp, "1794212000.000001");
  assert.throws(() => normalizeSlackEvent(readSlackEnvelope(body({ text: secret })), config, "TEXAMPLE", secret), (error: unknown) => error instanceof Error && !error.message.includes(secret));
  assert.throws(() => readSlackEnvelope(Buffer.from("bad json")));
  assert.deepEqual(readSlackEnvelope(Buffer.from(JSON.stringify({ type: "url_verification", challenge: "challenge_example" }))), { kind: "challenge", challenge: "challenge_example" });
});
