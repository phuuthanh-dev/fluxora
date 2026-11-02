import assert from "node:assert/strict";
import test from "node:test";
import { executeGoogleChatOAuth, listGoogleChatSpaces } from "./google-chat-oauth";
import { NodeFailure } from "./node-failure";

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

test("Google Chat labels unnamed conversations without inventing names or changing IDs", async () => {
  const result = await listGoogleChatSpaces("synthetic-token", async () => new Response(JSON.stringify({ spaces: [
    { name: "spaces/room", displayName: " Notification ", spaceType: "SPACE" },
    { name: "spaces/dm", displayName: "", spaceType: "DIRECT_MESSAGE" },
    { name: "spaces/group", spaceType: "GROUP_CHAT" },
    { name: "spaces/unnamed", spaceType: "SPACE" },
    { name: "spaces/unknown" },
    { name: "https://invalid", displayName: "Ignored" },
  ] })));
  assert.deepEqual(result.spaces, [
    { id: "spaces/room", name: "Notification" },
    { id: "spaces/dm", name: "Direct message · spaces/dm" },
    { id: "spaces/group", name: "Group conversation · spaces/group" },
    { id: "spaces/unnamed", name: "Unnamed space · spaces/unnamed" },
    { id: "spaces/unknown", name: "Unnamed conversation · spaces/unknown" },
  ]);
});

test("Google Chat OAuth writes permit only known 429 retries and send once per attempt", async (t) => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) };
  for (const status of [400, 401, 403, 408, 429, 500, 502, 503]) {
    await t.test(String(status), async () => {
      let writes = 0;
      // An unreadable error body must neither hide a 429 nor create a second
      // network failure after a permanent or ambiguous HTTP response.
      const response = new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new Error("synthetic-token")); },
      }), { status });
      await assert.rejects(executeGoogleChatOAuth(
        { credentialId: "connection", space: "spaces/abc", message: "Hello" },
        "live", "workspace", credentials as never,
        async (_url, init) => { writes += 1; assert.equal(init?.method, "POST"); return response; },
      ), (error: unknown) => {
        assert.ok(error instanceof NodeFailure);
        assert.equal(error.code, "GOOGLE_CHAT_ERROR");
        assert.equal(error.statusCode, status);
        assert.equal(error.retryable, status === 429);
        assert.equal(error.message.includes("synthetic-token"), false);
        return true;
      });
      assert.equal(writes, 1);
      assert.equal(response.body?.locked, false, "error body is cancelled and unlocked");
    });
  }
});

test("Google Chat OAuth write transport failures never resend or expose credentials", async (t) => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) };
  for (const name of ["TypeError", "TimeoutError", "AbortError"]) {
    await t.test(name, async () => {
      let writes = 0;
      await assert.rejects(executeGoogleChatOAuth(
        { credentialId: "connection", space: "spaces/abc", message: "Hello" },
        "live", "workspace", credentials as never,
        async () => { writes += 1; throw Object.assign(new Error("synthetic-token"), { name }); },
      ), (error: unknown) => {
        assert.ok(error instanceof NodeFailure);
        assert.equal(error.code, "DELIVERY_UNCERTAIN");
        assert.equal(error.retryable, false);
        assert.equal(error.message.includes("synthetic-token"), false);
        return true;
      });
      assert.equal(writes, 1);
    });
  }
});

test("Google Chat OAuth receipt failures stay nonretryable after an accepted write", async (t) => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) };
  const receipts: Array<{ name: string; response: () => Response }> = [
    { name: "malformed JSON", response: () => new Response('{"synthetic-token":') },
    { name: "empty body", response: () => new Response("") },
    { name: "null body", response: () => new Response("null") },
    { name: "missing message identity", response: () => new Response("{}") },
    { name: "invalid message identity", response: () => new Response('{"name":"invalid"}') },
    { name: "advertised oversized body", response: () => new Response("{}", { headers: { "Content-Length": "1000001" } }) },
    { name: "unadvertised oversized body", response: () => new Response("x".repeat(1_000_001)) },
    ...["TypeError", "TimeoutError", "AbortError"].map((name) => ({
      name: `stream ${name}`,
      response: () => {
        let started = false;
        return new Response(new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!started) {
              started = true;
              controller.enqueue(new TextEncoder().encode('{"name":"spaces/abc/messages/'));
            } else {
              controller.error(Object.assign(new Error("synthetic-token"), { name }));
            }
          },
        }));
      },
    })),
  ];
  for (const receipt of receipts) {
    await t.test(receipt.name, async () => {
      let writes = 0;
      await assert.rejects(executeGoogleChatOAuth(
        { credentialId: "connection", space: "spaces/abc", message: "Hello" },
        "live", "workspace", credentials as never,
        async () => { writes += 1; return receipt.response(); },
      ), (error: unknown) => {
        assert.ok(error instanceof NodeFailure);
        assert.equal(error.code, "DELIVERY_UNCERTAIN");
        assert.equal(error.retryable, false);
        assert.match(error.message, /Check the destination before retrying/);
        assert.equal(error.message.includes("synthetic-token"), false);
        return true;
      });
      assert.equal(writes, 1);
    });
  }
});

test("Google Chat space reads retain temporary failure retries", async () => {
  for (const status of [429, 503]) {
    let reads = 0;
    await assert.rejects(listGoogleChatSpaces("synthetic-token", async (_url, init) => {
      reads += 1;
      assert.equal(init?.method ?? "GET", "GET");
      return new Response(null, { status });
    }), (error: unknown) => error instanceof NodeFailure && error.retryable === true);
    assert.equal(reads, 1);
  }
  await assert.rejects(listGoogleChatSpaces("synthetic-token", async () => {
    throw new TypeError("synthetic-token");
  }), (error: unknown) => error instanceof NodeFailure && error.retryable === true && !error.message.includes("synthetic-token"));
});
