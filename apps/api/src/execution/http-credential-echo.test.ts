import assert from "node:assert/strict";
import test from "node:test";
import { executeHttpRequest } from "./http-request-adapter";
import { NodeFailure } from "./node-failure";
import { getConnectorExecutor } from "./connector-executors";

test("HTTP mock rejects invalid URL and headers without accessing credentials or the network", async () => {
  const execute = getConnectorExecutor("action.http-request")!;
  const credentials = { readForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  for (const config of [
    { url: "invalid" },
    { url: "https://" },
    { url: "https://example.test", headers: "not an object" },
    { url: "https://example.test", headers: { "X-Count": 1 } },
  ]) {
    await assert.rejects(execute({ config, mode: "mock", workspaceId: "workspace", credentials, executionId: "execution", nodeId: "http" }), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_CONFIGURATION");
  }
  const result = await execute({ config: { url: "https://example.test", headers: { "X-Example": "value" } }, mode: "mock", workspaceId: "workspace", credentials, executionId: "execution", nodeId: "http" });
  assert.equal(result.status, "succeeded");
});

test("HTTP reads reject a connection secret echoed in text, nested JSON, keys, or encoded query data", async () => {
  const cases: Array<{ credential: Record<string, unknown>; body: string }> = [
    { credential: { authType: "bearer", token: "synthetic-token" }, body: "prefix synthetic-token suffix" },
    { credential: { authType: "bearer", token: "synthetic-token" }, body: '{"result":"synthetic\\u002dtoken"}' },
    { credential: { authType: "headers", headers: { "X-Secret": "synthetic-header" } }, body: '{"synthetic-header":"value"}' },
    { credential: { authType: "headers", headers: { Authorization: "Bearer synthetic-token" } }, body: '{"value":"synthetic-token"}' },
    { credential: { authType: "basic", username: "synthetic-user", password: "synthetic-password" }, body: Buffer.from("synthetic-user:synthetic-password").toString("base64") },
    { credential: { authType: "apiKey", location: "query", value: "synthetic key/+" }, body: "synthetic+key%2F%2B" },
  ];
  for (const { credential, body } of cases) {
    await assert.rejects(executeHttpRequest({ url: "https://example.test" }, credential, async () => new Response(body)), (error: unknown) => error instanceof NodeFailure && error.code === "HTTP_RESPONSE_UNSAFE" && !error.retryable && !error.message.includes("synthetic"));
  }
});

test("HTTP writes with an unsafe receipt are uncertain and never retryable", async () => {
  let calls = 0;
  await assert.rejects(executeHttpRequest({ url: "https://example.test", method: "POST", body: "hello" }, { authType: "bearer", token: "synthetic-token" }, async () => { calls++; return Response.json({ arbitrary: "synthetic-token" }); }), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable && !error.message.includes("synthetic-token"));
  assert.equal(calls, 1);
});

test("HTTP output without a credential echo preserves its previous shape", async () => {
  const result = await executeHttpRequest({ url: "https://example.test" }, { authType: "bearer", token: "synthetic-token" }, async () => Response.json({ status: "ok", count: 1 }));
  assert.deepEqual(result, { status: "succeeded", output: { status: 200, body: { status: "ok", count: 1 } }, route: "success" });
});
