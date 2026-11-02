import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionStatus } from "@prisma/client";
import { ExecutionService } from "./execution.service";
import { NodeFailure } from "./node-failure";

process.env.OUTBOUND_ALLOWED_HOSTNAMES = "api.github.com,example.test";

async function runAction(type: string, config: Record<string, unknown>, errorBranch = false, credentialError?: NodeFailure) {
  const nodeUpdates: Array<{ nodeId: string; data: Record<string, unknown> }> = [];
  const executionUpdates: Array<Record<string, unknown>> = [];
  let credentialReads = 0;
  const execution = {
    id: "delivery-safety", status: ExecutionStatus.QUEUED, triggerData: {}, nodeExecutions: [],
    workflowVersion: {
      workflow: { workspaceId: "test-workspace" },
      graph: {
        nodes: [
          { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
          { id: "action", type, position: { x: 200, y: 0 }, config: { retryAttempts: 2, ...config } },
          ...(errorBranch ? [{ id: "recover", type: "action.http-request", position: { x: 400, y: 0 }, config: { url: "https://example.test/recover" } }] : []),
        ],
        edges: [
          { id: "start", source: "manual", target: "action", kind: "success" },
          ...(errorBranch ? [{ id: "error", source: "action", target: "recover", kind: "error" }] : []),
        ],
      },
    },
  };
  const read = async () => {
    credentialReads++;
    if (credentialError) throw credentialError;
    return { token: "synthetic-token", accessToken: "synthetic-access-token" };
  };
  const service = new ExecutionService({
    execution: {
      findUnique: async () => execution,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: { data: Record<string, unknown> }) => { executionUpdates.push(data); return { ...execution, ...data }; },
    },
    nodeExecution: {
      upsert: async () => ({}), updateMany: async () => ({ count: 0 }),
      update: async ({ where, data }: { where: { executionId_nodeId: { nodeId: string } }; data: Record<string, unknown> }) => {
        nodeUpdates.push({ nodeId: where.executionId_nodeId.nodeId, data }); return {};
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  } as never, { readForExecution: read, readGoogleForExecution: read } as never, { publish: () => undefined } as never);
  await service.run(execution.id, "live");
  return { nodeUpdates, executionUpdates, credentialReads };
}

test("runner honors an adapter's explicit no-retry even for legacy retryable status/code", async () => {
  for (const code of ["HTTP_ERROR", "NETWORK_ERROR", "TIMEOUT"]) {
    const result = await runAction("action.github", { repository: "example/repo", title: "Test", credentialId: "synthetic" }, false, new NodeFailure(code, "Sanitized failure", false, 503));
    assert.equal(result.credentialReads, 1);
    assert.equal(result.executionUpdates.at(-1)?.errorRetryable, false);
    assert.equal(result.nodeUpdates.filter((item) => item.nodeId === "action").at(-1)?.data.errorRetryable, false);
  }
});

test("ambiguous writes call providers once, persist uncertainty, and do not replay automatically", async () => {
  const originalFetch = globalThis.fetch;
  const actions: Array<[string, Record<string, unknown>]> = [
    ["action.http-request", { url: "https://example.test/items", method: "POST" }],
    ["action.google-drive", { credentialId: "synthetic", operation: "uploadText", name: "Test", text: "Test" }],
    ["action.google-sheets", { credentialId: "synthetic", operation: "append", spreadsheetId: "test", range: "A1", values: [["Test"]] }],
    ["action.github", { credentialId: "synthetic", repository: "example/repo", title: "Test" }],
    ["action.github.add-comment", { credentialId: "synthetic", repository: "example/repo", issueNumber: 1, body: "Test" }],
  ];
  try {
    for (const [type, config] of actions) {
      for (const failure of ["server", "network", "receipt", "malformed", "oversized"] as const) {
        // Generic HTTP intentionally supports raw text instead of requiring JSON.
        if (failure === "malformed" && type === "action.http-request") continue;
        let calls = 0;
        let cancelled = false;
        globalThis.fetch = (async () => {
          calls++;
          if (failure === "network") throw new Error("sensitive provider details");
          if (failure === "receipt") return new Response(new ReadableStream({ start(controller) { controller.error(new Error("sensitive stream details")); } }));
          if (failure === "malformed") return new Response("{broken-sensitive-json");
          if (failure === "oversized") return new Response(new ReadableStream({
            pull(controller) { controller.enqueue(new Uint8Array(600_000)); },
            cancel() { cancelled = true; },
          }));
          return new Response("sensitive provider details", { status: 503 });
        }) as typeof fetch;
        const result = await runAction(type, config);
        assert.equal(calls, 1, `${type}: ${failure}`);
        const final = result.executionUpdates.at(-1)!;
        assert.equal(final.status, "FAILED");
        assert.equal(final.errorCode, "DELIVERY_UNCERTAIN");
        assert.equal(final.errorRetryable, false);
        if (failure === "oversized") assert.equal(cancelled, true);
        assert.ok(!JSON.stringify(result).includes("sensitive"));
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("known 429 rejection and read-only 503 retain retries, and uncertain writes follow their error branch once", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [method, status] of [["POST", 429], ["GET", 503]] as const) {
      let calls = 0;
      globalThis.fetch = (async () => ++calls === 1 ? new Response(null, { status }) : Response.json({ ok: true })) as typeof fetch;
      const result = await runAction("action.http-request", { url: "https://example.test/items", method });
      assert.equal(calls, 2);
      assert.equal(result.executionUpdates.at(-1)?.status, "SUCCEEDED");
    }
    const urls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return String(url).endsWith("/recover") ? Response.json({ recovered: true }) : new Response(null, { status: 503 });
    }) as typeof fetch;
    const result = await runAction("action.http-request", { url: "https://example.test/items", method: "POST" }, true);
    assert.deepEqual(urls, ["https://example.test/items", "https://example.test/recover"]);
    assert.equal(result.executionUpdates.at(-1)?.status, "SUCCEEDED");
    assert.equal(result.nodeUpdates.filter((item) => item.nodeId === "action").at(-1)?.data.errorRetryable, false);
    const methods: string[] = [];
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      methods.push(init?.method ?? "GET");
      return methods.length === 1
        ? new Response(null, { status: 303, headers: { location: "/receipt" } })
        : new Response(null, { status: 429 });
    }) as typeof fetch;
    const redirected = await runAction("action.http-request", { url: "https://example.test/items", method: "POST" });
    assert.deepEqual(methods, ["POST", "GET"], "a redirected rejection must not repeat the original POST");
    assert.equal(redirected.executionUpdates.at(-1)?.errorCode, "DELIVERY_UNCERTAIN");
    assert.equal(redirected.executionUpdates.at(-1)?.errorRetryable, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("HTTP, Drive and Sheets stop oversized reads before persisting payloads", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [type, config] of [
      ["action.http-request", { url: "https://example.test/items" }],
      ["action.google-drive", { credentialId: "synthetic", operation: "downloadText", fileId: "test" }],
      ["action.google-drive", { credentialId: "synthetic", operation: "list" }],
      ["action.google-sheets", { credentialId: "synthetic", operation: "read", spreadsheetId: "test", range: "A1" }],
    ] as Array<[string, Record<string, unknown>]>) {
      let cancelled = false;
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        return new Response(new ReadableStream({
          pull(controller) { controller.enqueue(new Uint8Array(600_000)); },
          cancel() { cancelled = true; },
        }), { headers: { "content-length": "1" } });
      }) as typeof fetch;
      const result = await runAction(type, config);
      assert.equal(calls, 1, type);
      assert.equal(cancelled, true, type);
      assert.equal(result.executionUpdates.at(-1)?.errorCode, "RESPONSE_TOO_LARGE");
      assert.equal(result.nodeUpdates.some((item) => item.nodeId === "action" && item.data.output), false);
    }
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    const empty = await runAction("action.http-request", { url: "https://example.test/items", method: "DELETE" });
    assert.equal(empty.executionUpdates.at(-1)?.status, "SUCCEEDED");
    assert.deepEqual(empty.nodeUpdates.filter((item) => item.nodeId === "action").at(-1)?.data.output, { status: 204, body: "" });
    globalThis.fetch = (async () => new Response(null, { headers: { "content-length": "9000000" } })) as typeof fetch;
    const head = await runAction("action.http-request", { url: "https://example.test/items", method: "HEAD" });
    assert.equal(head.executionUpdates.at(-1)?.status, "SUCCEEDED");
  } finally { globalThis.fetch = originalFetch; }
});
