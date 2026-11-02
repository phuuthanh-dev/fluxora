import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionStatus } from "@prisma/client";
import { ExecutionService } from "./execution.service";
import { NodeFailure } from "./node-failure";

process.env.OUTBOUND_ALLOWED_HOSTNAMES = "api.github.com,example.test";

async function runAction(type: string, config: Record<string, unknown>, errorBranch = false, credentialError?: NodeFailure, mode: "mock" | "live" = "live") {
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
  let transactionPrisma: unknown;
  const prisma = {
    execution: {
      findUnique: async () => execution,
      findUniqueOrThrow: async () => execution,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { executionUpdates.push(data); return { count: 1 }; },
      update: async ({ data }: { data: Record<string, unknown> }) => { executionUpdates.push(data); return { ...execution, ...data }; },
    },
    nodeExecution: {
      upsert: async () => ({}), updateMany: async () => ({ count: 0 }),
      update: async ({ where, data }: { where: { executionId_nodeId: { nodeId: string } }; data: Record<string, unknown> }) => {
        nodeUpdates.push({ nodeId: where.executionId_nodeId.nodeId, data }); return {};
      },
    },
    $transaction: async (operations: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(operations) ? Promise.all(operations) : operations(transactionPrisma),
  };
  transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: executionUpdates[0]?.runToken }] };
  const service = new ExecutionService(prisma as never, { readForExecution: read, readGoogleForExecution: read } as never, { publish: () => undefined } as never);
  await service.run(execution.id, mode);
  return { nodeUpdates, executionUpdates, credentialReads };
}

test("a cancelled execution does not retry a failed node", async () => {
  let credentialReads = 0;
  const events: string[] = [];
  const execution = {
    id: "cancel-retry", status: ExecutionStatus.QUEUED as ExecutionStatus, startedAt: null, resumeToken: null,
    triggerData: {}, nodeExecutions: [], workflowVersion: { workflow: { workspaceId: "test-workspace" }, graph: {
      nodes: [
        { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
        { id: "action", type: "action.github", position: { x: 1, y: 0 }, config: { credentialId: "synthetic", repository: "example/repo", title: "Test", retryAttempts: 2 } },
      ], edges: [{ id: "edge", source: "manual", target: "action", kind: "success" }],
    } },
  };
  let transactionPrisma: unknown;
  let activeRunToken: string | undefined;
  const prisma = {
    execution: {
      findUnique: async () => execution,
      findUniqueOrThrow: async () => execution,
      updateMany: async ({ where, data }: { where: { status: ExecutionStatus; runToken?: string }; data: { status?: ExecutionStatus; runToken?: string | null } }) => {
        if (where.status !== execution.status || (where.runToken && where.runToken !== activeRunToken)) return { count: 0 };
        if (data.runToken !== undefined) activeRunToken = data.runToken ?? undefined;
        if (data.status) execution.status = data.status;
        return { count: 1 };
      },
    },
    nodeExecution: { upsert: async () => ({}), update: async () => ({}), updateMany: async () => ({ count: 0 }) },
    $transaction: async (operations: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(operations) ? Promise.all(operations) : operations(transactionPrisma),
  };
  transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: execution.status, runToken: activeRunToken }] };
  const credentials = { readForExecution: async () => {
    credentialReads++;
    execution.status = ExecutionStatus.CANCELLED;
    throw new NodeFailure("NETWORK_ERROR", "Synthetic transient failure", true);
  } };
  const service = new ExecutionService(prisma as never, credentials as never, { publish: (_id: string, event: string) => { events.push(event); } } as never);
  const result = await service.run(execution.id, "live");
  assert.equal(result.status, ExecutionStatus.CANCELLED);
  assert.equal(credentialReads, 1);
  assert.equal(events.includes("execution.failed"), false);
});

test("runner honors an adapter's explicit no-retry even for legacy retryable status/code", async () => {
  for (const code of ["HTTP_ERROR", "NETWORK_ERROR", "TIMEOUT"]) {
    const result = await runAction("action.github", { repository: "example/repo", title: "Test", credentialId: "synthetic" }, false, new NodeFailure(code, "Sanitized failure", false, 503));
    assert.equal(result.credentialReads, 1);
    assert.equal(result.executionUpdates.at(-1)?.errorRetryable, false);
    assert.equal(result.nodeUpdates.filter((item) => item.nodeId === "action").at(-1)?.data.errorRetryable, false);
  }
});

test("Google writes do not follow redirects or retry ambiguous results", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [type, config] of [
      ["action.google-drive", { credentialId: "synthetic", operation: "uploadText", name: "test", text: "test" }],
      ["action.google-drive.v2", { credentialId: "synthetic", operation: "uploadText", name: "test", text: "test" }],
      ["action.google-sheets", { credentialId: "synthetic", operation: "append", spreadsheetId: "test", range: "A1", values: [["test"]] }],
    ] as Array<[string, Record<string, unknown>]>) {
      for (const status of [307, 308]) {
        let calls = 0;
        let redirectMode: RequestInit["redirect"];
        globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
          calls++;
          redirectMode = init?.redirect;
          return new Response(null, { status, headers: { location: "https://example.test/redirect" } });
        }) as typeof fetch;
        const result = await runAction(type, config);
        assert.equal(calls, 1);
        assert.equal(redirectMode, "manual");
        assert.equal(result.executionUpdates.at(-1)?.errorCode, "DELIVERY_UNCERTAIN");
        assert.equal(result.executionUpdates.at(-1)?.errorRetryable, false);
      }
    }
  } finally { globalThis.fetch = originalFetch; }
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

test("HTTP writes do not replay on same-origin 307 or 308 redirects", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [307, 308]) {
      let calls = 0;
      globalThis.fetch = (async () => { calls++; return new Response(null, { status, headers: { location: "https://example.test/other" } }); }) as typeof fetch;
      const result = await runAction("action.http-request", { url: "https://example.test/items", method: "POST" });
      assert.equal(calls, 1);
      assert.equal(result.executionUpdates.at(-1)?.errorCode, "DELIVERY_UNCERTAIN");
      assert.equal(result.executionUpdates.at(-1)?.errorRetryable, false);
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
    assert.deepEqual(methods, ["POST"], "a write redirect must not issue a second request");
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

test("Sheets read passes the visual tab range to Google and returns multiple rows", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), method: init?.method ?? "GET" });
      return Response.json({ range: "'Bob''s tab'!A1:CV3", values: [["Name", "Amount"], ["Alice", "1"], ["Bob", "2"]] });
    }) as typeof fetch;
    const result = await runAction("action.google-sheets", { credentialId: "synthetic", operation: "read", spreadsheetId: "test", range: "'Bob''s tab'!A:CV" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.method, "GET");
    assert.equal(decodeURIComponent(new URL(requests[0]!.url).pathname), "/v4/spreadsheets/test/values/'Bob''s tab'!A:CV");
    assert.equal(result.executionUpdates.at(-1)?.status, "SUCCEEDED");
    assert.deepEqual(result.nodeUpdates.filter((item) => item.nodeId === "action").at(-1)?.data.output, { operation: "read", range: "'Bob''s tab'!A1:CV3", values: [["Name", "Amount"], ["Alice", "1"], ["Bob", "2"]] });
  } finally { globalThis.fetch = originalFetch; }
});


test("Drive list/search pass a bounded continuation and persist it without exposing credentials", async () => {
  const originalFetch = globalThis.fetch;
  const urls: URL[] = [];
  try {
    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(new URL(String(url)));
      return Response.json({ files: [{ id: "file-1", name: "Report", accessToken: "private" }], nextPageToken: "page+/=2" });
    }) as typeof fetch;
    const first = await runAction("action.google-drive.v2", { credentialId: "synthetic", operation: "search", query: "name contains 'x'" });
    const firstOutput = first.nodeUpdates.filter((item) => item.nodeId === "action").at(-1)?.data.output;
    assert.deepEqual(firstOutput, { operation: "search", files: [{ id: "file-1", name: "Report", accessToken: "[REDACTED]" }], nextPageToken: "page+/=2" });
    assert.equal(urls[0]?.searchParams.get("pageSize"), "100");
    assert.equal(urls[0]?.searchParams.get("q"), "name contains 'x'");
    assert.equal(urls[0]?.searchParams.has("pageToken"), false);
    await runAction("action.google-drive.v2", { credentialId: "synthetic", operation: "search", query: "name contains 'x'", pageToken: "page+/=2" });
    assert.equal(urls[1]?.searchParams.get("pageToken"), "page+/=2");
    assert.equal(urls[1]?.searchParams.get("q"), urls[0]?.searchParams.get("q"));
    const invalid = await runAction("action.google-drive.v2", { credentialId: "synthetic", operation: "list", pageToken: "x".repeat(1025) });
    assert.equal(invalid.credentialReads, 0);
    assert.equal(invalid.executionUpdates.at(-1)?.errorCode, "INVALID_INPUT");
    assert.equal(urls.length, 2);
    globalThis.fetch = (async () => Response.json({ files: [], nextPageToken: "x".repeat(1025) })) as typeof fetch;
    const badResponse = await runAction("action.google-drive.v2", { credentialId: "synthetic", operation: "list" });
    assert.equal(badResponse.executionUpdates.at(-1)?.errorCode, "INVALID_PROVIDER_RESPONSE");
    assert.equal(badResponse.nodeUpdates.some((item) => item.nodeId === "action" && item.data.output), false);
    const mock = await runAction("action.google-drive.v2", { operation: "list" }, false, undefined, "mock");
    assert.equal(mock.credentialReads, 0);
    const mockOutput = mock.nodeUpdates.filter((item) => item.nodeId === "action").at(-1)?.data.output as Record<string, unknown>;
    assert.equal(mockOutput.operation, "list");
    assert.ok(Array.isArray(mockOutput.files));
    assert.equal(mockOutput.nextPageToken, null);
  } finally { globalThis.fetch = originalFetch; }
});
