import assert from "node:assert/strict";
import test from "node:test";
import { executeSlackOAuth, listSlackChannels } from "./slack-oauth";
import { NodeFailure } from "./node-failure";

const token = ["xoxb", "synthetic", "token", "12345"].join("-");
const credentials = { readForExecution: async () => ({ accessToken: token }) } as never;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("Slack discovery returns joined public channels and a continuation", async () => {
  let requested = "";
  const result = await listSlackChannels(token, "next-page", async (url) => { requested = String(url); return json({ ok: true, channels: [{ id: "C123456", name: "general", is_member: true }, { id: "C234567", name: "other", is_member: false }], response_metadata: { next_cursor: "more" } }); });
  assert.deepEqual(result.channels, [{ id: "C123456", name: "#general" }]);
  assert.equal(result.nextCursor, "more"); assert.match(requested, /cursor=next-page/);
});

test("Slack sends once and returns a bounded receipt without the token", async () => {
  let calls = 0;
  const result = await executeSlackOAuth({ credentialId: "cred", channel: "C123456", message: "Hello" }, "live", "workspace", credentials, async (_url, init) => { calls++; assert.equal(init?.method, "POST"); return json({ ok: true, channel: "C123456", ts: "1794190000.123456" }); });
  assert.equal(calls, 1); assert.equal(result.output.messageId, "1794190000.123456");
  assert.ok(!JSON.stringify(result).includes(token));
});

test("Slack reply uses the selected parent timestamp", async () => {
  const config = { credentialId: "cred", channel: "C123456", message: "Reply", threadTs: "1794190000.123456" };
  await executeSlackOAuth(config, "live", "workspace", credentials, async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).thread_ts, config.threadTs);
    return json({ ok: true, channel: "C123456", ts: "1794190001.123456" });
  });
});

test("Slack updates only the selected message and does not expose the token", async () => {
  const config = { credentialId: "cred", channel: "C123456", message: "Updated", messageId: "1794190000.123456" };
  const result = await executeSlackOAuth(config, "live", "workspace", credentials, async (url, init) => {
    assert.match(String(url), /chat\.update$/);
    assert.equal(JSON.parse(String(init?.body)).ts, config.messageId);
    return json({ ok: true, channel: config.channel, ts: config.messageId });
  }, "update");
  assert.equal(result.output.messageId, config.messageId);
  assert.ok(!JSON.stringify(result).includes(token));
});

test("uncertain Slack writes fail closed rather than allowing automatic retry", async () => {
  const config = { credentialId: "cred", channel: "C123456", message: "Hello" };
  await assert.rejects(executeSlackOAuth(config, "live", "workspace", credentials, async () => { throw new Error("network"); }), (error) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable);
  await assert.rejects(executeSlackOAuth(config, "live", "workspace", credentials, async () => json({ ok: false, error: "not_in_channel" })), (error) => error instanceof NodeFailure && error.code === "SLACK_REJECTED" && !error.retryable);
});
