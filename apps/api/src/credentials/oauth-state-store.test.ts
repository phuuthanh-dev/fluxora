import assert from "node:assert/strict";
import test from "node:test";
import { GoogleOAuthStateService } from "./google-oauth-state.service";
import { SlackOAuthStateService } from "./slack-oauth-state.service";

test("Slack state is browser- and session-bound, single-use, and isolated from Google", async () => {
  const previous = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  const values = new Map<string, string>();
  const redis = { set: async (key: string, value: string) => { if (values.has(key)) return null; values.set(key, value); return "OK"; }, eval: async (_script: string, _count: number, key: string, binding: string) => { const value = values.get(key); if (!value?.startsWith(`${binding}:`)) return null; values.delete(key); return value.slice(binding.length + 1); }, disconnect() {} };
  const slack = new SlackOAuthStateService(); const google = new GoogleOAuthStateService();
  (slack as unknown as { redis: unknown }).redis = redis; (google as unknown as { redis: unknown }).redis = redis;
  const cookies = new Map([["workflow_session", "session-a"]]);
  const request = { headers: { cookie: "workflow_session=session-a" } } as never;
  const response = { cookie: (key: string, value: string) => cookies.set(key, value), clearCookie: (key: string) => cookies.delete(key) } as never;
  const sync = () => { (request as { headers: { cookie: string } }).headers.cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); };
  try {
    const issued = await slack.issue({ workspaceId: "ws", userId: "user" }, request, response); sync();
    await assert.rejects(google.consume(issued.state, request, response));
    cookies.set("workflow_session", "different-session"); sync();
    await assert.rejects(slack.consume(issued.state, request, response));
    cookies.set("workflow_session", "session-a"); sync();
    const consumed = await slack.consume(issued.state, request, response);
    assert.equal(consumed.state.workspaceId, "ws");
    await assert.rejects(slack.consume(issued.state, request, response));
  } finally {
    slack.onApplicationShutdown(); google.onApplicationShutdown();
    if (previous === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previous;
  }
});
