import assert from "node:assert/strict";
import test from "node:test";
import { executeGoogleChatOAuth, listGoogleChatSpaces } from "./google-chat-oauth";

test("Google Chat mock validates destination without reading credentials", async () => {
  const mock = await executeGoogleChatOAuth({ space: "spaces/abc", message: "Hello" }, "mock", "workspace", { readGoogleForExecution: () => { throw new Error("unexpected credential read"); } } as never);
  assert.equal(mock.output.delivered, true);
  await assert.rejects(executeGoogleChatOAuth({ space: "https://example.com", message: "Hello" }, "mock", "workspace", {} as never));
});

test("Google Chat sends via scoped credential and never exposes its token", async () => {
  const credentials = { readGoogleForExecution: async (...args: unknown[]) => { assert.deepEqual(args, ["connection", "workspace", "GOOGLE_CHAT_OAUTH"]); return { accessToken: "synthetic-token" }; } };
  const sent = await executeGoogleChatOAuth({ credentialId: "connection", space: "spaces/abc", message: "Hello" }, "live", "workspace", credentials as never, async (url, init) => {
    assert.equal(url, "https://chat.googleapis.com/v1/spaces/abc/messages");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer synthetic-token");
    return new Response(JSON.stringify({ name: "spaces/abc/messages/msg1" }), { status: 200 });
  });
  assert.equal(sent.output.messageId, "spaces/abc/messages/msg1");
  assert.ok(!JSON.stringify(sent).includes("synthetic-token"));
  await assert.rejects(executeGoogleChatOAuth({ credentialId: "connection", space: "spaces/abc", message: "Hello" }, "live", "workspace", credentials as never, async () => { throw new Error("synthetic-token"); }), (error: unknown) => error instanceof Error && !error.message.includes("synthetic-token") && "retryable" in error && error.retryable === false);
});

test("Google Chat space listing handles empty and trims provider data", async () => {
  assert.deepEqual((await listGoogleChatSpaces("synthetic-token", async () => new Response("{}"))).spaces, []);
  const result = await listGoogleChatSpaces("synthetic-token", async () => new Response(JSON.stringify({ spaces: [{ name: "spaces/abc", displayName: "Team", secret: "ignored" }] })));
  assert.deepEqual(result.spaces, [{ id: "spaces/abc", name: "Team" }]);
});
