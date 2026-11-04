import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { executeGoogleChatEdit, executeGoogleChatOAuth, listGoogleChatSpaces } from "./google-chat-oauth";
import { NodeFailure } from "./node-failure";
import { getOperationMetadata } from "@workflow/contracts";

test("Google Chat mock validates destination without reading credentials", async () => {
  const mock = await executeGoogleChatOAuth({ space: "spaces/abc", message: "Hello" }, "mock", "workspace", { readGoogleForExecution: () => { throw new Error("unexpected credential read"); } } as never);
  assert.equal(mock.output.delivered, true);
  await assert.rejects(executeGoogleChatOAuth({ space: "https://example.com", message: "Hello" }, "mock", "workspace", {} as never));
});

test("Google Chat simulated send and reply expose the live receipt fields", async () => {
  const mockCredentials = new Proxy({}, { get() { throw new Error("Mock must not read credentials"); } }) as never;
  const liveCredentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) } as never;
  const config = { credentialId: "connection", space: "spaces/abc", message: "Example", threadName: "spaces/abc/threads/thread1" };
  for (const [variant, type] of [["legacy", "action.google-chat.oauth"], ["send", "action.google-chat.oauth.v2"], ["reply", "action.google-chat.reply"]] as const) {
    const transport = async () => Response.json({ name: "spaces/abc/messages/message1", thread: { name: config.threadName } });
    const mock = await executeGoogleChatOAuth(config, "mock", "workspace", mockCredentials, transport, variant);
    const live = await executeGoogleChatOAuth(config, "live", "workspace", liveCredentials, transport, variant);
    const metadata = getOperationMetadata(type);
    assert.ok(metadata && "knownFields" in metadata.output);
    for (const field of metadata.output.knownFields) {
      assert.ok(Object.hasOwn(mock.output, field), `${variant} mock is missing ${field}`);
      assert.ok(Object.hasOwn(live.output, field), `${variant} live receipt is missing ${field}`);
    }
    assert.equal((mock.output as Record<string, unknown>).simulated, true);
  }
});

test("Google Chat edit requires verified management scope and confirms the same message", async () => {
  const token = "synthetic-token";
  const config = { credentialId: "connection", space: "spaces/abc", messageName: "spaces/abc/messages/msg1", message: "Updated" };
  let requests = 0;
  const credential = (scopes: string[]) => ({ readGoogleForExecution: async () => ({ accessToken: token, grantedScopes: scopes, scopeTokenHash: createHash("sha256").update(token).digest("hex") }) });
  const transport = async (url: string, init: RequestInit = {}) => {
    requests++;
    assert.equal(url, "https://chat.googleapis.com/v1/spaces/abc/messages/msg1?updateMask=text");
    assert.equal(init.method, "PATCH");
    assert.deepEqual(JSON.parse(String(init.body)), { text: "Updated" });
    return Response.json({ name: config.messageName });
  };
  await assert.rejects(executeGoogleChatEdit(config, "live", "workspace", credential(["https://www.googleapis.com/auth/chat.messages.create"]) as never, transport), (error: unknown) => error instanceof NodeFailure && error.code === "GOOGLE_CHAT_SCOPE_MISSING");
  assert.equal(requests, 0);
  const result = await executeGoogleChatEdit(config, "live", "workspace", credential(["https://www.googleapis.com/auth/chat.messages"]) as never, transport);
  assert.equal(result.output.updated, true);
  assert.equal(result.output.messageId, config.messageName);
  await assert.rejects(executeGoogleChatEdit(config, "live", "workspace", credential(["https://www.googleapis.com/auth/chat.messages"]) as never, async () => Response.json({ name: "spaces/other/messages/msg1" })), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable);
  await assert.rejects(executeGoogleChatEdit(config, "live", "workspace", credential(["https://www.googleapis.com/auth/chat.messages"]) as never, async () => new Response(null, { status: 503 })), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable);
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

test("thread-aware Google Chat sends expose the thread while legacy output stays compatible", async () => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) };
  const config = { credentialId: "connection", space: "spaces/abc", message: "Hello" };
  const transport = async () => Response.json({ name: "spaces/abc/messages/msg1", thread: { name: "spaces/abc/threads/thread1" } });
  const legacy = await executeGoogleChatOAuth(config, "live", "workspace", credentials as never, transport);
  const send = await executeGoogleChatOAuth(config, "live", "workspace", credentials as never, transport, "send");
  assert.equal("threadName" in legacy.output, false);
  assert.equal("threadName" in send.output && send.output.threadName, "spaces/abc/threads/thread1");
  const noThread = await executeGoogleChatOAuth(config, "live", "workspace", credentials as never, async () => Response.json({ name: "spaces/abc/messages/msg1" }), "send");
  assert.equal("threadName" in noThread.output && noThread.output.threadName, null);
});

test("Google Chat replies target the selected thread without falling back to a new one", async () => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) };
  const config = { credentialId: "connection", space: "spaces/abc", threadName: "spaces/abc/threads/thread1", message: "Reply" };
  let writes = 0;
  const reply = await executeGoogleChatOAuth(config, "live", "workspace", credentials as never, async (url, init) => {
    writes += 1;
    assert.equal(url, "https://chat.googleapis.com/v1/spaces/abc/messages?messageReplyOption=REPLY_MESSAGE_OR_FAIL");
    assert.deepEqual(JSON.parse(String(init?.body)), { text: "Reply", thread: { name: config.threadName } });
    return Response.json({ name: "spaces/abc/messages/msg2", thread: { name: config.threadName } });
  }, "reply");
  assert.equal(writes, 1);
  assert.equal("threadName" in reply.output && reply.output.threadName, config.threadName);
  await assert.rejects(executeGoogleChatOAuth({ ...config, threadName: "spaces/other/threads/thread1" }, "live", "workspace", credentials as never, async () => { throw new Error("unexpected write"); }, "reply"), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
  for (const thread of [undefined, { name: "spaces/abc/threads/other" }, { name: "spaces/other/threads/thread1" }]) {
    await assert.rejects(executeGoogleChatOAuth(config, "live", "workspace", credentials as never, async () => Response.json({ name: "spaces/abc/messages/msg2", ...(thread ? { thread } : {}) }), "reply"), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && error.retryable === false);
  }
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

test("Google Chat discovery redacts access tokens even across the name boundary", async () => {
  const result = await listGoogleChatSpaces("synthetic-token", async () => Response.json({ spaces: [
    { name: "spaces/abc", displayName: `${"x".repeat(155)}synthetic-token` },
    { name: "spaces/synthetic-token", displayName: "Unsafe identifier" },
  ] }));
  assert.equal(result.spaces.length, 1);
  assert.ok(!JSON.stringify(result).includes("synthetic-token"));
  assert.ok(!result.spaces[0]!.name.includes("synth"));
});

test("Google Chat does not claim success for a receipt in another space or containing the credential", async () => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) };
  for (const name of ["spaces/other/messages/msg1", "spaces/abc/messages/synthetic-token"]) {
    await assert.rejects(executeGoogleChatOAuth({ credentialId: "connection", space: "spaces/abc", message: "Hello" }, "live", "workspace", credentials as never, async () => Response.json({ name })), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && error.retryable === false && !error.message.includes("synthetic-token"));
  }
});

test("Google Chat OAuth writes permit only known 429 retries and send once per attempt", async (t) => {
  const credentials = { readGoogleForExecution: async () => ({ accessToken: "synthetic-token" }) };
  for (const status of [307, 308, 400, 401, 403, 408, 429, 500, 502, 503]) {
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
        assert.equal(error.code, status < 400 || status === 408 || status >= 500 ? "DELIVERY_UNCERTAIN" : "GOOGLE_CHAT_ERROR");
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
