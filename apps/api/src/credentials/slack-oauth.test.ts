import assert from "node:assert/strict";
import test from "node:test";
import { SlackOAuthController } from "./slack-oauth.controller";

test("Slack callback stores only an owner-bound, fully scoped authorization", async () => {
  const syntheticToken = ["xoxb", "synthetic", "token", "12345"].join("-");
  const keys = ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_REDIRECT_URI", "SLACK_APP_ID", "WEB_ORIGIN"] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { SLACK_APP_ID: "AEXAMPLE", SLACK_CLIENT_ID: "test-client", SLACK_CLIENT_SECRET: "test-secret", SLACK_REDIRECT_URI: "https://api.example.test/callback", WEB_ORIGIN: "https://example.test" });
  const originalFetch = globalThis.fetch;
  const saved: unknown[] = []; let redirect = "";
  const credentials = { requireOwner: async () => {}, saveSlackOAuth: async (...args: unknown[]) => saved.push(args) };
  let eventAccess = false;
  const states = { consume: async () => ({ state: { workspaceId: "ws", userId: "owner", eventAccess } }) };
  const auth = { getCurrentUser: async () => ({ id: "owner" }) };
  const controller = new SlackOAuthController(credentials as never, states as never, auth as never);
  const response = { setHeader() {}, redirect: (url: string) => { redirect = url; } } as never;
  const request = { headers: { cookie: "workflow_session=synthetic" } } as never;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, app_id: "AEXAMPLE", access_token: syntheticToken, team: { id: "T12345", name: "Test" }, scope: "channels:read,chat:write" }), { status: 200 });
    await controller.callback("code", "state", undefined, request, response);
    assert.equal(saved.length, 1); assert.equal(new URL(redirect).searchParams.get("connected"), "slack");
    assert.ok(!redirect.includes("xoxb-") && !redirect.includes("test-secret"));
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, app_id: "AEXAMPLE", access_token: syntheticToken, team: { id: "T12345", name: "Test" }, scope: "chat:write" }), { status: 200 });
    await controller.callback("code", "state", undefined, request, response);
    assert.equal(saved.length, 1); assert.equal(new URL(redirect).searchParams.get("slack_oauth"), "token_failed");
    eventAccess = true;
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, app_id: "AEXAMPLE", access_token: syntheticToken, team: { id: "T12345", name: "Test" }, scope: "channels:read,chat:write" }), { status: 200 });
    await controller.callback("code", "state", undefined, request, response);
    assert.equal(saved.length, 1); // A basic grant cannot satisfy an event-access request.
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, app_id: "AEXAMPLE", access_token: syntheticToken, team: { id: "T12345", name: "Test" }, scope: "channels:read,chat:write,channels:history,app_mentions:read" }), { status: 200 });
    await controller.callback("code", "state", undefined, request, response);
    assert.equal(saved.length, 2);
    assert.equal(new URL(redirect).searchParams.get("connected"), "slack");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) { const value = previous.get(key); if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
