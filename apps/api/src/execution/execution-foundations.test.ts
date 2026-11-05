import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { ExecutionService, executeNode } from "./execution.service";
import { resolveExpressions } from "./expression";
import { nodeFailureFromExecutionError } from "./node-failure";
import { redactValue } from "./redaction";
import { isRetryableFailure, parseRetryAfter, retryDelayMs } from "./retry-policy";

test("resolves safe expressions without evaluating JavaScript", () => {
  const context = { steps: { steam: { output: { profile: { personaname: "Thanh" }, summary: { topGames: [{ name: "Hades" }] } } } } };
  assert.equal(resolveExpressions("Hello {{ upper(steps.steam.output.profile.personaname) }}", context), "Hello THANH");
  assert.equal(resolveExpressions("{{ steps.steam.output.profile.personaname }}", context), "Thanh");
  assert.equal(resolveExpressions("{{ steps.steam.output.summary.topGames[0].name }}", context), "Hades");
  assert.equal(resolveExpressions("{{ steps.steam-account.output.profile.personaname }}", { steps: { "steam-account": { output: { profile: { personaname: "Thanh" } } } } }), "Thanh");
  assert.throws(() => resolveExpressions("{{ process.exit() }}", context), BadRequestException);
});

test("resolves generated output paths with hyphenated keys", () => {
  const context = { steps: { "node-example": { output: { "request-id": "abc" } } } };
  assert.equal(resolveExpressions("{{ steps.node-example.output.request-id }}", context), "abc");
});

test("persisted redactions cannot silently become expression values", () => {
  const context = { trigger: { secret: "[REDACTED]", label: "ok" }, steps: {
    old: { output: { name: "saved", secret: "[REDACTED]", gmailText: "hello [redacted]", items: [{ url: "https://example.test/bot[REDACTED]/send" }] } },
    fresh: { output: { text: "[REDACTED]", gmailText: "hello [redacted]" } },
  } };
  const options = { restoredSteps: new Set(["old"]), persistedTrigger: true };
  for (const expression of [
    "{{ steps.old.output.secret }}", "prefix {{ upper(steps.old.output.secret) }}",
    "{{ default(steps.old.output.secret.child, 'fallback') }}", "{{ steps.old.output.items }}",
    "{{ steps.old.output.gmailText }}", "{{ steps.old.output }}", "{{ steps }}", "{{ trigger.secret }}", "{{ trigger }}",
  ]) assert.throws(() => resolveExpressions(expression, context, options), (error: unknown) => nodeFailureFromExecutionError(error).code === "REDACTED_INPUT_UNAVAILABLE", expression);
  assert.equal(resolveExpressions("{{ steps.old.output.name }}", context, options), "saved");
  assert.equal(resolveExpressions("{{ trigger.label }}", context, options), "ok");
  assert.equal(resolveExpressions("{{ steps.fresh.output.text }}", context, options), "[REDACTED]");
  assert.equal(resolveExpressions("{{ steps.fresh.output.gmailText }}", context, options), "hello [redacted]");
  assert.equal(resolveExpressions("[REDACTED]", context, options), "[REDACTED]");
  assert.equal(resolveExpressions("{{ steps.old.output.secret }}", context), "[REDACTED]");
});

test("Supabase insert rejects unresolved interpolations before accessing a connection", async () => {
  const context = { steps: {} };
  const credentials = { readForExecution: () => { throw new Error("unexpected credential access"); } } as never;
  for (const value of ["Order {{ steps.missing.output.id }}", "{{ upper(steps.missing.output.name) }}", "{{ steps.missing.output.value }}"]) {
    const config = { credentialId: "connection", table: "items", fields: [{ column: "name", type: "text", value }] };
    const node = { id: "insert", type: "action.supabase.insert-row" as const, position: { x: 0, y: 0 }, config };
    await assert.rejects(() => executeNode(node, resolveExpressions(config, context) as Record<string, unknown>, context, "live", "workspace", credentials, "execution"), (error: unknown) => nodeFailureFromExecutionError(error).code === "INVALID_EXPRESSION");
  }
  assert.equal(resolveExpressions("Order {{ steps.missing.output.id }}", context), "Order ");
  assert.equal(resolveExpressions("{{ default(steps.missing.output.id, 'fallback') }}", context, { rejectMissing: true }), "fallback");
  const config = { table: "items", fields: [{ column: "name", type: "text", value: "Order {{ default(steps.missing.output.id, 'fallback') }}" }] };
  const node = { id: "insert", type: "action.supabase.insert-row" as const, position: { x: 0, y: 0 }, config };
  const result = await executeNode(node, resolveExpressions(config, context) as Record<string, unknown>, context, "mock", "workspace", credentials, "execution");
  assert.equal(result.status, "succeeded");
});

test("redacts nested provider secrets before execution data is persisted", () => {
  assert.deepEqual(redactValue({
    authorization: "Bearer secret",
    webhookUrl: "https://discord.com/api/webhooks/123/abc",
    nested: {
      apiKey: "abc",
      botToken: "123456:ABC-DEF",
      safe: "visible",
      url: "https://api.telegram.org/bot123456:ABC-DEF/sendMessage",
    },
  }), {
    authorization: "[REDACTED]",
    webhookUrl: "[REDACTED]",
    nested: {
      apiKey: "[REDACTED]",
      botToken: "[REDACTED]",
      safe: "visible",
      url: "https://api.telegram.org/bot[REDACTED]/sendMessage",
    },
  });
});

test("normalizes safe-expression errors into terminal node failures", () => {
  const failure = nodeFailureFromExecutionError(new BadRequestException({ code: "INVALID_EXPRESSION", message: "Only safe path access and approved helpers are supported." }));
  assert.deepEqual({ code: failure.code, message: failure.message, retryable: failure.retryable }, {
    code: "INVALID_EXPRESSION",
    message: "Only safe path access and approved helpers are supported.",
    retryable: false,
  });
});

test("stale initial-only jobs cannot claim an execution resumed after approval", async () => {
  const execution = {
    id: "approval-resume",
    mode: "LIVE",
    status: ExecutionStatus.QUEUED,
    startedAt: new Date("2026-11-01T00:00:00Z"),
    nodeExecutions: [],
    workflowVersion: { graph: { nodes: [], edges: [] }, workflow: { workspaceId: "workspace" } },
  };
  let claims = 0;
  const prisma = { execution: { findUnique: async () => execution, updateMany: async () => { claims++; return { count: 1 }; } } };
  const service = new ExecutionService(prisma as never, {} as never, {} as never);
  await service.run(execution.id, "live", undefined, undefined, true);
  assert.equal(claims, 0);
});

test("jobs with a mismatched execution mode cannot claim or call a provider", async () => {
  for (const [storedMode, jobMode] of [["MOCK", "live"], ["LIVE", "mock"], ["MOCK", "unexpected"]] as const) {
    const execution = { id: "mode-mismatch", mode: storedMode, status: ExecutionStatus.QUEUED, startedAt: null, resumeToken: null, nodeExecutions: [], workflowVersion: { workflow: { workspaceId: "workspace" }, graph: { nodes: [{ id: "send", type: "action.telegram.message", position: { x: 0, y: 0 }, config: { credentialId: "bot", text: "test" } }], edges: [] } } };
    let claims = 0;
    let credentialReads = 0;
    const prisma = { execution: { findUnique: async () => execution, updateMany: async () => { claims++; return { count: 1 }; } } };
    const service = new ExecutionService(prisma as never, { readForExecution: async () => { credentialReads++; throw new Error("unexpected credential read"); } } as never, {} as never);
    assert.equal(await service.run(execution.id, jobMode as "mock" | "live"), execution);
    assert.equal(claims, 0);
    assert.equal(credentialReads, 0);
  }
});

test("a previously queued live graph with an unavailable node fails before any provider action", async () => {
  const execution = { id: "legacy-planned", mode: "LIVE", status: ExecutionStatus.QUEUED, startedAt: null, resumeToken: null, triggerData: {}, nodeExecutions: [], workflowVersion: { workflow: { workspaceId: "space" }, graph: { nodes: [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "write", type: "action.telegram.message", position: { x: 1, y: 0 }, config: { credentialId: "bot", text: "hello" } },
    { id: "planned", type: "action.instagram", position: { x: 2, y: 0 }, config: {} },
  ], edges: [{ id: "one", source: "start", target: "write", kind: "success" }, { id: "two", source: "write", target: "planned", kind: "success" }] } } };
  const updates: Array<Record<string, unknown>> = [];
  let credentialReads = 0;
  let tx: unknown;
  const prisma = {
    execution: { findUnique: async () => execution, findUniqueOrThrow: async () => execution, updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 }; } },
    nodeExecution: { upsert: async () => ({}), updateMany: async () => ({ count: 1 }) },
    $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(tx),
  };
  tx = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: updates[0]?.runToken }] };
  const service = new ExecutionService(prisma as never, { readForExecution: async () => { credentialReads++; throw new Error("must not call provider"); } } as never, { publish: () => undefined } as never);
  await service.run(execution.id, "live", undefined, undefined, true);
  assert.equal(credentialReads, 0);
  assert.equal(updates.at(-1)?.status, ExecutionStatus.FAILED);
  assert.equal(updates.at(-1)?.errorCode, "NODE_UNAVAILABLE");
});

test("an initial-only claim remains conditional if the execution starts concurrently", async () => {
  const execution = {
    id: "racing-initial",
    mode: "LIVE",
    status: ExecutionStatus.QUEUED,
    startedAt: null,
    nodeExecutions: [],
    workflowVersion: { graph: { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] }, workflow: { workspaceId: "workspace" } },
  };
  let claimWhere: Record<string, unknown> | undefined;
  const prisma = { execution: { findUnique: async () => execution, updateMany: async ({ where }: { where: Record<string, unknown> }) => { claimWhere = where; return { count: 0 }; } } };
  const service = new ExecutionService(prisma as never, {} as never, {} as never);
  await service.run(execution.id, "live", undefined, undefined, true);
  assert.deepEqual(claimWhere, { id: execution.id, status: ExecutionStatus.QUEUED, mode: "LIVE", resumeToken: null, startedAt: null });
});

test("a stale job cannot claim a queued approval continuation", async () => {
  const execution = { id: "resume", mode: "LIVE", status: ExecutionStatus.QUEUED, startedAt: new Date(), resumeToken: "current-token", nodeExecutions: [], workflowVersion: { graph: { nodes: [], edges: [] }, workflow: { workspaceId: "workspace" } } };
  let claims = 0;
  const service = new ExecutionService({ execution: { findUnique: async () => execution, updateMany: async () => { claims++; return { count: 1 }; } } } as never, {} as never, {} as never);
  await service.run("resume", "live");
  await service.run("resume", "live", undefined, undefined, false, "old-token");
  assert.equal(claims, 0);
});

test("an initial worker error only marks an execution that has never started", async () => {
  let where: Record<string, unknown> | undefined;
  let published = 0;
  const prisma = { execution: { updateMany: async (input: { where: Record<string, unknown> }) => { where = input.where; return { count: 0 }; } } };
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => { published++; } } as never);
  await service.failUnstartedFromWorker("approval-resume");
  assert.deepEqual(where, { id: "approval-resume", status: ExecutionStatus.QUEUED, startedAt: null });
  assert.equal(published, 0);
});

test("invalid expressions fail the execution instead of leaving it running", async () => {
  const executionUpdates: Array<Record<string, unknown>> = [];
  const nodeUpdates: Array<Record<string, unknown>> = [];
  const execution = {
    id: "execution-expression-error",
    mode: "MOCK",
    status: ExecutionStatus.QUEUED,
    triggerData: {},
    nodeExecutions: [],
    workflowVersion: {
      graph: {
        nodes: [
          { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
          { id: "telegram", type: "action.telegram.message", position: { x: 200, y: 0 }, config: { text: "{{ process.exit() }}", credentialId: "" } },
        ],
        edges: [{ id: "manual-to-telegram", source: "manual", target: "telegram", kind: "success" }],
      },
      workflow: { workspaceId: "workspace-1" },
    },
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
      upsert: async () => ({}),
      update: async ({ data }: { data: Record<string, unknown> }) => { nodeUpdates.push(data); return {}; },
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (operations: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(operations) ? Promise.all(operations) : operations(transactionPrisma),
  };
  transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: executionUpdates[0]?.runToken }] };
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);

  await service.run(execution.id, "mock");

  assert.equal(executionUpdates.at(-1)?.status, ExecutionStatus.FAILED);
  assert.equal(executionUpdates.at(-1)?.errorCode, "INVALID_EXPRESSION");
  assert.equal(nodeUpdates.at(-1)?.status, "FAILED");
  assert.equal(nodeUpdates.at(-1)?.errorCode, "INVALID_EXPRESSION");
});

for (const redacted of ["[REDACTED]", "hello [redacted]"]) test(`resumed execution stops before accessing credentials for ${redacted}`, async () => {
  const updates: Array<Record<string, unknown>> = [];
  const nodeUpdates: Array<Record<string, unknown>> = [];
  let credentialReads = 0;
  const execution = {
    id: "redacted-resume", mode: "LIVE", status: ExecutionStatus.QUEUED,
    startedAt: new Date("2026-11-01T00:00:00Z"), resumeToken: "nonce", resumeNodeIds: ["send"], triggerData: {},
    nodeExecutions: [{ nodeId: "source", status: "SUCCEEDED", output: { apiKey: redacted } }],
    workflowVersion: { workflow: { workspaceId: "workspace" }, graph: { nodes: [
      { id: "source", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
      { id: "send", type: "action.telegram.message", position: { x: 1, y: 0 }, config: { credentialId: "bot", chatId: "123", text: "Value: {{ steps.source.output.apiKey }}" } },
    ], edges: [] } },
  };
  let transactionPrisma: unknown;
  const prisma = {
    execution: { findUnique: async () => execution, findUniqueOrThrow: async () => execution, updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 }; } },
    nodeExecution: { upsert: async () => ({}), update: async ({ data }: { data: Record<string, unknown> }) => { nodeUpdates.push(data); return {}; }, updateMany: async () => ({ count: 0 }) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(transactionPrisma),
  };
  transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: updates[0]?.runToken }] };
  const service = new ExecutionService(prisma as never, { readForExecution: async () => { credentialReads++; throw new Error("unexpected credential access"); } } as never, { publish: () => undefined } as never);
  await service.run(execution.id, "live", undefined, undefined, false, "nonce");
  assert.equal(credentialReads, 0);
  assert.equal(nodeUpdates.at(-1)?.errorCode, "REDACTED_INPUT_UNAVAILABLE");
  assert.equal(updates.at(-1)?.status, ExecutionStatus.FAILED);
  assert.equal(updates.at(-1)?.errorCode, "REDACTED_INPUT_UNAVAILABLE");
  assert.equal(updates.at(-1)?.errorRetryable, false);
});

test("trigger output retains redaction provenance without blocking unrelated values", async () => {
  for (const [field, expected] of [["secret", "FAILED"], ["safe", "SUCCEEDED"]] as const) {
    const updates: Array<Record<string, unknown>> = [];
    const nodeUpdates: Array<Record<string, unknown>> = [];
    const execution = {
      id: `trigger-redaction-${field}`, mode: "MOCK", status: ExecutionStatus.QUEUED,
      startedAt: null, resumeToken: null, triggerData: { secret: "[REDACTED]", safe: "hello" }, nodeExecutions: [],
      workflowVersion: { workflow: { workspaceId: "workspace" }, graph: { nodes: [
        { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
        { id: "send", type: "action.telegram.message", position: { x: 1, y: 0 }, config: { chatId: "123", text: `{{ steps.manual.output.received.${field} }}` } },
      ], edges: [{ id: "start", source: "manual", target: "send", kind: "success" }] } },
    };
    let transactionPrisma: unknown;
    const prisma = {
      execution: { findUnique: async () => execution, findUniqueOrThrow: async () => execution, updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 }; } },
      nodeExecution: { upsert: async () => ({}), update: async ({ data }: { data: Record<string, unknown> }) => { nodeUpdates.push(data); return {}; }, updateMany: async () => ({ count: 0 }) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(transactionPrisma),
    };
    transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: updates[0]?.runToken }] };
    const credentials = { readForExecution: () => { throw new Error("mock must not access credentials"); } };
    const service = new ExecutionService(prisma as never, credentials as never, { publish: () => undefined } as never);
    await service.run(execution.id, "mock");
    assert.equal(updates.at(-1)?.status, expected);
    if (field === "secret") assert.equal(nodeUpdates.at(-1)?.errorCode, "REDACTED_INPUT_UNAVAILABLE");
    else assert.equal(nodeUpdates.at(-1)?.status, "SUCCEEDED");
  }
});

test("AI schema descriptions are literal while unresolved whole-schema expressions fail closed", async () => {
  for (const configuredSchema of [
    { type: "object", description: "Example {{ process.exit() }} is literal", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
    "{{ steps.missing.output.schema }}",
  ]) {
    const updates: Array<Record<string, unknown>> = [];
    const execution = { id: "schema-run", mode: "MOCK", status: ExecutionStatus.QUEUED, triggerData: {}, nodeExecutions: [], workflowVersion: { workflow: { workspaceId: "workspace-1" }, graph: { nodes: [
      { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
      { id: "ai", type: "action.gemini", position: { x: 200, y: 0 }, config: { model: "gemini-2.5-flash", prompt: "Summarize", outputSchema: configuredSchema } },
    ], edges: [{ id: "start", source: "manual", target: "ai", kind: "success" }] } } };
    let transactionPrisma: unknown;
    const prisma = { execution: { findUnique: async () => execution, findUniqueOrThrow: async () => execution, updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 }; } }, nodeExecution: { upsert: async () => ({}), update: async () => ({}), updateMany: async () => ({ count: 0 }) }, $transaction: async (operations: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(operations) ? Promise.all(operations) : operations(transactionPrisma) };
    transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: updates[0]?.runToken }] };
    const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
    await service.run(execution.id, "mock");
    assert.equal(updates.at(-1)?.status, typeof configuredSchema === "string" ? ExecutionStatus.FAILED : ExecutionStatus.SUCCEEDED);
    if (typeof configuredSchema === "string") assert.equal(updates.at(-1)?.errorCode, "INVALID_INPUT");
  }
});

test("a stored .v2 action executes its existing handler without changing the graph", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const nodeUpdates: Array<Record<string, unknown>> = [];
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "read", type: "action.supabase.select.v2", nodeVersion: 1, position: { x: 200, y: 0 }, config: { table: "items", limit: 5, order: [{ column: "id", direction: "asc" }], offset: 5 } },
  ], edges: [{ id: "start", source: "manual", target: "read", kind: "success" }] };
  const original = structuredClone(graph);
  const execution = { id: "versioned-run", mode: "MOCK", status: ExecutionStatus.QUEUED, triggerData: {}, nodeExecutions: [], workflowVersion: { workflow: { workspaceId: "workspace" }, graph } };
  let transactionPrisma: unknown;
  const prisma = { execution: { findUnique: async () => execution, findUniqueOrThrow: async () => execution, updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 }; } }, nodeExecution: { upsert: async () => ({}), update: async ({ data }: { data: Record<string, unknown> }) => { nodeUpdates.push(data); return {}; }, updateMany: async () => ({ count: 0 }) }, $transaction: async (operations: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(operations) ? Promise.all(operations) : operations(transactionPrisma) };
  transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: updates[0]?.runToken }] };
  const credentials = { readForExecution: () => { throw new Error("mock accessed credentials"); } };
  const service = new ExecutionService(prisma as never, credentials as never, { publish: () => undefined } as never);
  await service.run(execution.id, "mock");
  assert.equal(updates.at(-1)?.status, ExecutionStatus.SUCCEEDED);
  assert.ok(nodeUpdates.some((update) => (update.output as { page?: { offset: number } } | undefined)?.page?.offset === 5));
  assert.deepEqual(graph, original);
});

test("node debug executes only the selected mock node and skips downstream nodes", async () => {
  const executionUpdates: Array<Record<string, unknown>> = [];
  const nodeUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const execution = {
    id: "execution-node-debug",
    mode: "MOCK",
    status: ExecutionStatus.QUEUED,
    triggerData: { source: "debug" },
    nodeExecutions: [],
    workflowVersion: {
      graph: {
        nodes: [
          { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
          { id: "http", type: "action.http-request", position: { x: 200, y: 0 }, config: { url: "https://example.com" } },
          { id: "downstream", type: "action.http-request", position: { x: 400, y: 0 }, config: { url: "https://example.com/next" } },
        ],
        edges: [
          { id: "manual-to-http", source: "manual", target: "http", kind: "success" },
          { id: "http-to-downstream", source: "http", target: "downstream", kind: "success" },
        ],
      },
      workflow: { workspaceId: "workspace-1" },
    },
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
      upsert: async () => ({}),
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => { nodeUpdates.push({ where, data }); return {}; },
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (operations: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(operations) ? Promise.all(operations) : operations(transactionPrisma),
  };
  transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: executionUpdates[0]?.runToken }] };
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);

  await service.run(execution.id, "mock", undefined, "http");

  assert.equal(executionUpdates.at(-1)?.status, ExecutionStatus.SUCCEEDED);
  assert.ok(nodeUpdates.some((update) => (update.where.executionId_nodeId as { nodeId: string }).nodeId === "http" && update.data.status === "RUNNING"));
  assert.equal(nodeUpdates.some((update) => (update.where.executionId_nodeId as { nodeId: string }).nodeId === "downstream"), false);
});

test("cancellation during a node is not replaced by a successful debug completion", async () => {
  const events: string[] = [];
  const execution = {
    id: "cancel-race", mode: "MOCK", status: ExecutionStatus.QUEUED as ExecutionStatus, startedAt: null, resumeToken: null,
    triggerData: {}, nodeExecutions: [],
    workflowVersion: { workflow: { workspaceId: "workspace-1" }, graph: { nodes: [
      { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    ], edges: [] } },
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
    nodeExecution: {
      upsert: async () => ({}), updateMany: async () => ({ count: 0 }),
      update: async ({ data }: { data: { status?: string } }) => {
        if (data.status === "SUCCEEDED") execution.status = ExecutionStatus.CANCELLED;
        return {};
      },
    },
    $transaction: async (operations: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(operations) ? Promise.all(operations) : operations(transactionPrisma),
  };
  transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: execution.status, runToken: activeRunToken }] };
  const service = new ExecutionService(prisma as never, {} as never, { publish: (_id: string, event: string) => { events.push(event); } } as never);
  await service.run(execution.id, "mock", undefined, "manual");
  assert.equal(execution.status, ExecutionStatus.CANCELLED);
  assert.equal(events.includes("execution.succeeded"), false);
});

test("an execution that lost its lease does not start another node", async () => {
  const events: string[] = [];
  let nodeUpdates = 0;
  let activeRunToken: string | undefined;
  let transactionPrisma: unknown;
  const execution = {
    id: "expired-run", mode: "MOCK", status: ExecutionStatus.QUEUED, startedAt: null, resumeToken: null,
    triggerData: {}, nodeExecutions: [],
    workflowVersion: { workflow: { workspaceId: "workspace-1" }, graph: { nodes: [
      { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    ], edges: [] } },
  };
  const prisma = {
    execution: {
      findUnique: async () => execution,
      findUniqueOrThrow: async () => ({ ...execution, status: ExecutionStatus.FAILED }),
      updateMany: async ({ where, data }: { where: { status: ExecutionStatus }; data: { runToken?: string } }) => { if (data.runToken) activeRunToken = data.runToken; return { count: where.status === ExecutionStatus.QUEUED ? 1 : 0 }; },
    },
    nodeExecution: { upsert: async () => ({}), update: async () => { nodeUpdates++; return {}; } },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(transactionPrisma),
  };
  transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: activeRunToken }] };
  const service = new ExecutionService(prisma as never, {} as never, { publish: (_id: string, event: string) => { events.push(event); } } as never);
  const result = await service.run(execution.id, "mock");
  assert.equal(result.status, ExecutionStatus.FAILED);
  assert.equal(nodeUpdates, 0);
  assert.equal(events.includes("execution.succeeded"), false);
});

test("approval is created only if the execution can atomically enter waiting state", async () => {
  for (const cancelBeforeApproval of [true, false]) {
    const events: string[] = [];
    const approvalOutputs: unknown[] = [];
    let approvalCount = 0;
    const execution = {
      id: "approval-race", mode: "MOCK", status: ExecutionStatus.QUEUED as ExecutionStatus, startedAt: null, resumeToken: null,
      triggerData: {}, nodeExecutions: [],
      workflowVersion: { workflow: { workspaceId: "workspace-1" }, graph: { nodes: [
        { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
        { id: "approval", type: "approval.request", position: { x: 1, y: 0 }, config: { message: "Review https://api.telegram.org/botexample-secret/sendMessage" } },
      ], edges: [{ id: "edge", source: "manual", target: "approval", kind: "success" }] } },
    };
    const nodeStates = new Map<string, string>();
    let transactionPrisma: unknown;
    let activeRunToken: string | undefined;
    const prisma = {
      execution: {
        findUnique: async () => execution,
        findUniqueOrThrow: async () => execution,
        updateMany: async ({ where, data }: { where: { status: ExecutionStatus; runToken?: string }; data: { status?: ExecutionStatus; runToken?: string | null } }) => {
          if (execution.status !== where.status || (where.runToken && where.runToken !== activeRunToken)) return { count: 0 };
          if (data.runToken !== undefined) activeRunToken = data.runToken ?? undefined;
          if (data.status) execution.status = data.status;
          return { count: 1 };
        },
      },
      nodeExecution: {
        upsert: async () => ({}),
        update: async ({ where, data }: { where: { executionId_nodeId: { nodeId: string } }; data: { status?: string } }) => {
          const nodeId = where.executionId_nodeId.nodeId;
          if (data.status) nodeStates.set(nodeId, data.status);
          if (cancelBeforeApproval && nodeId === "approval" && data.status === "WAITING") execution.status = ExecutionStatus.CANCELLED;
          return {};
        },
        updateMany: async ({ where, data }: { where: { nodeId?: string; status?: string }; data: { output?: unknown } }) => {
          if (where.nodeId === "approval" && data.output) approvalOutputs.push(data.output);
          return { count: typeof where.nodeId !== "string" || !where.status || nodeStates.get(where.nodeId) === where.status ? 1 : 0 };
        },
      },
      approvalRequest: { create: async () => { approvalCount++; return { id: "approval-request" }; } },
      $transaction: async (action: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(action) ? Promise.all(action) : action(transactionPrisma),
    };
    transactionPrisma = { ...prisma, $queryRaw: async () => [{ status: execution.status, runToken: activeRunToken }] };
    const service = new ExecutionService(prisma as never, {} as never, { publish: (_id: string, event: string) => { events.push(event); } } as never);
    await service.run(execution.id, "mock");
    assert.equal(execution.status, cancelBeforeApproval ? ExecutionStatus.CANCELLED : ExecutionStatus.WAITING_APPROVAL);
    assert.equal(approvalCount, cancelBeforeApproval ? 0 : 1);
    assert.equal(events.includes("execution.waiting_approval"), !cancelBeforeApproval);
    if (!cancelBeforeApproval) {
      assert.equal(approvalOutputs.length, 2);
      for (const output of approvalOutputs) {
        assert.equal(JSON.stringify(output).includes("example-secret"), false);
        assert.match(JSON.stringify(output), /\[REDACTED\]/);
      }
    }
  }
});

test("retry creates a new execution from the failed pinned version and original redacted trigger data", async () => {
  const created: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const source = {
    id: "execution-source",
    status: ExecutionStatus.FAILED,
    mode: "MOCK",
    workflowVersionId: "version-7",
    idempotencyRootId: null as string | null,
    triggerData: { event: "daily-report", authorization: "[REDACTED]" },
    workflowVersion: { version: 7, graph: { nodes: [], edges: [] }, workflow: { workspaceId: "workspace-1" } },
  };
  const prisma = {
    execution: {
      findFirst: async () => source,
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "execution-retry", ...data }; },
    },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return {}; } },
  };
  const service = new ExecutionService(prisma as never, {} as never, {} as never);

  const retry = await service.retry("execution-source", "user-1");

  assert.equal(retry.id, "execution-retry");
  assert.deepEqual(created, [{ workflowVersionId: "version-7", mode: "MOCK", triggerData: { event: "daily-report", authorization: "[REDACTED]" }, idempotencyRootId: "execution-source" }]);
  assert.deepEqual(audits[0]?.metadata, { sourceExecutionId: "execution-source", mode: "mock", workflowVersion: 7 });
  source.id = "execution-retry"; source.idempotencyRootId = "execution-source";
  await service.retry("execution-retry", "user-1");
  assert.equal(created[1]?.idempotencyRootId, "execution-source");
});

test("execution history uses an owner-scoped stable cursor page", async () => {
  const queries: unknown[] = [];
  const item = (id: string, createdAt: string) => ({ id, status: ExecutionStatus.SUCCEEDED, mode: "MOCK", createdAt: new Date(createdAt), startedAt: null, completedAt: null, errorCode: null, errorMessage: null, workflowVersion: { workflowId: "workflow-1", version: 3, workflow: { name: "Report" } } });
  const prisma = {
    workspaceMember: { findUnique: async () => ({ role: "OWNER" }) },
    execution: { findMany: async (query: unknown) => { queries.push(query); return [item("execution-2", "2026-10-25T10:31:00.000Z"), item("execution-1", "2026-10-25T10:30:00.000Z")]; } },
  };
  const service = new ExecutionService(prisma as never, {} as never, {} as never);

  const page = await service.listForWorkspace("workspace-1", "user-1", 1, "cursor-0");

  assert.equal(page.executions.length, 1);
  assert.equal(page.executions[0]?.id, "execution-2");
  assert.equal(page.nextCursor, "execution-2");
  assert.deepEqual(queries[0], {
    where: { workflowVersion: { workflow: { workspaceId: "workspace-1" } } },
    include: { workflowVersion: { include: { workflow: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 2,
    cursor: { id: "cursor-0" },
    skip: 1,
  });
});

test("execution triage applies status filter within the workspace query before pagination", async () => {
  let query: { where?: unknown; take?: number; cursor?: unknown } | undefined;
  const service = new ExecutionService({
    workspaceMember: { findUnique: async () => ({ role: "OWNER" }) },
    execution: { findMany: async (input: typeof query) => { query = input; return []; } },
  } as never, {} as never, {} as never);
  await service.listForWorkspace("workspace-1", "owner-1", 30, "cursor-1", "ATTENTION");
  assert.deepEqual(query?.where, { workflowVersion: { workflow: { workspaceId: "workspace-1" } }, status: { in: [ExecutionStatus.FAILED, ExecutionStatus.WAITING_APPROVAL] } });
  assert.equal(query?.take, 31);
  assert.deepEqual(query?.cursor, { id: "cursor-1" });
});

test("retention policy is available only to the workspace owner", async () => {
  const service = new ExecutionService({ workspaceMember: { findUnique: async () => null } } as never, {} as never, {} as never);
  await assert.rejects(() => service.retentionForWorkspace("workspace-1", "other-user"), (error: unknown) => Boolean(error && typeof error === "object" && "response" in error && (error.response as { code?: string }).code === "WORKSPACE_NOT_FOUND"));
  const ownerService = new ExecutionService({ workspaceMember: { findUnique: async () => ({ role: "OWNER" }) } } as never, {} as never, {} as never);
  const policy = await ownerService.retentionForWorkspace("workspace-1", "owner-1");
  assert.equal(policy.countScope, "system");
  assert.equal(typeof policy.successDays, "number");
});

test("saved execution views are scoped to the owner and workspace", async () => {
  const calls: Array<{ operation: string; query: unknown }> = [];
  const service = new ExecutionService({
    workspaceMember: { findUnique: async () => ({ role: "OWNER" }) },
    executionSavedView: {
      findMany: async (query: unknown) => { calls.push({ operation: "list", query }); return []; },
      count: async (query: unknown) => { calls.push({ operation: "count", query }); return 0; },
      create: async (query: unknown) => { calls.push({ operation: "create", query }); return { id: "view-1", name: "Failures", filter: "FAILED" }; },
      deleteMany: async (query: unknown) => { calls.push({ operation: "delete", query }); return { count: 1 }; },
    },
  } as never, {} as never, {} as never);
  await service.savedViews("workspace-1", "owner-1");
  await service.createSavedView("workspace-1", "owner-1", "Failures", "FAILED");
  await service.deleteSavedView("workspace-1", "owner-1", "view-1");
  assert.deepEqual((calls[0]?.query as { where: unknown }).where, { workspaceId: "workspace-1", userId: "owner-1" });
  assert.deepEqual((calls[2]?.query as { data: unknown }).data, { workspaceId: "workspace-1", userId: "owner-1", name: "Failures", filter: "FAILED" });
  assert.deepEqual((calls[3]?.query as { where: unknown }).where, { id: "view-1", workspaceId: "workspace-1", userId: "owner-1" });
  const outsider = new ExecutionService({ workspaceMember: { findUnique: async () => null } } as never, {} as never, {} as never);
  await assert.rejects(() => outsider.savedViews("workspace-1", "other-user"));
});

test("diagnostic snapshot is deterministic, owner-scoped, and excludes execution payload secrets", async () => {
  const queries: unknown[] = [];
  const execution = {
    id: "execution-diagnostic",
    status: ExecutionStatus.SUCCEEDED,
    mode: "LIVE",
    triggerData: { authorization: "Bearer must-not-leak" },
    errorCode: null,
    errorMessage: null,
    createdAt: new Date("2026-10-27T10:00:00.000Z"),
    startedAt: new Date("2026-10-27T10:00:01.000Z"),
    completedAt: new Date("2026-10-27T10:00:03.000Z"),
    recoveryCount: 0,
    workflowVersion: {
      workflowId: "workflow-1",
      version: 4,
      workflow: { id: "workflow-1" },
      graph: {
        nodes: [{ id: "notify", type: "action.discord.webhook", position: { x: 0, y: 0 }, config: { webhookUrl: "https://discord.com/api/webhooks/secret" } }],
        edges: [],
      },
    },
    nodeExecutions: [{
      nodeId: "notify",
      status: "SUCCEEDED",
      attempt: 1,
      input: { headers: { authorization: "Bearer must-not-leak" }, webhookUrl: "https://discord.com/api/webhooks/secret" },
      output: { delivered: true },
      errorCode: null,
      errorMessage: null,
      startedAt: new Date("2026-10-27T10:00:01.000Z"),
      completedAt: new Date("2026-10-27T10:00:03.000Z"),
    }],
  };
  const prisma = { execution: { findFirst: async (query: unknown) => { queries.push(query); return execution; } } };
  const service = new ExecutionService(prisma as never, {} as never, {} as never);

  const first = await service.getDiagnostic(execution.id, "owner-1");
  const second = await service.getDiagnostic(execution.id, "owner-1");

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, "fluxora.execution-diagnostic.v1");
  assert.equal(first.nodes[0]?.nodeType, "action.discord.webhook");
  assert.equal(first.nodes[0]?.durationMs, 2_000);
  assert.match(JSON.stringify(queries[0]), /owner-1/);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /must-not-leak|discord\.com|webhookUrl|headers|triggerData|input|output/);
});

test("execution detail explains error-branch handling and conservative skipped reasons", async () => {
  const execution = {
    id: "execution-error-branch",
    status: ExecutionStatus.SUCCEEDED,
    mode: "MOCK",
    triggerData: {},
    errorCode: null,
    errorMessage: null,
    createdAt: new Date("2026-10-27T10:00:00.000Z"),
    startedAt: new Date("2026-10-27T10:00:00.000Z"),
    completedAt: new Date("2026-10-27T10:00:02.000Z"),
    recoveryCount: 0,
    workflowVersion: {
      workflowId: "workflow-1",
      version: 1,
      workflow: { id: "workflow-1" },
      graph: {
        nodes: [
          { id: "request", type: "action.http-request", position: { x: 0, y: 0 }, config: {} },
          { id: "recover", type: "action.telegram.message", position: { x: 200, y: 0 }, config: {} },
          { id: "success-only", type: "action.google-chat.webhook", position: { x: 200, y: 100 }, config: {} },
        ],
        edges: [
          { id: "error", source: "request", target: "recover", kind: "error" },
          { id: "success", source: "request", target: "success-only", kind: "success" },
        ],
      },
    },
    nodeExecutions: [
      { nodeId: "request", status: "FAILED", attempt: 2, input: {}, output: null, errorCode: "NETWORK_ERROR", errorMessage: "Network unavailable", startedAt: new Date("2026-10-27T10:00:00.000Z"), completedAt: new Date("2026-10-27T10:00:01.000Z") },
      { nodeId: "recover", status: "SUCCEEDED", attempt: 1, input: {}, output: {}, errorCode: null, errorMessage: null, startedAt: new Date("2026-10-27T10:00:01.000Z"), completedAt: new Date("2026-10-27T10:00:02.000Z") },
      { nodeId: "success-only", status: "SKIPPED", attempt: 0, input: null, output: null, errorCode: null, errorMessage: null, startedAt: null, completedAt: new Date("2026-10-27T10:00:02.000Z") },
    ],
  };
  const service = new ExecutionService({ execution: { findFirst: async () => execution } } as never, {} as never, {} as never);

  const detail = await service.get(execution.id, "owner-1");

  assert.deepEqual(detail.nodeExecutions[0]?.failureHandling, { kind: "error_branch", targetNodeIds: ["recover"] });
  assert.equal(detail.nodeExecutions[0]?.error?.retryable, true);
  assert.equal(detail.nodeExecutions[2]?.skipReason, "branch_not_selected");
});

test("retries only transient failures with capped exponential backoff", () => {
  assert.equal(isRetryableFailure({ code: "NETWORK_ERROR" }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 503 }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 401 }), false);
  assert.equal(retryDelayMs(1), 500);
  assert.equal(retryDelayMs(8), 30_000);
  assert.equal(parseRetryAfter("3"), 3000);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2015 07:28:02 GMT", Date.parse("Wed, 21 Oct 2015 07:28:00 GMT")), 2000);
  assert.equal(parseRetryAfter("invalid"), undefined);
  assert.equal(retryDelayMs(1, 3000), 3000);
});
