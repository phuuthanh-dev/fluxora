import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { ExecutionService } from "./execution.service";
import { resolveExpressions } from "./expression";
import { nodeFailureFromExecutionError } from "./node-failure";
import { redactValue } from "./redaction";
import { isRetryableFailure, retryDelayMs } from "./retry-policy";

test("resolves safe expressions without evaluating JavaScript", () => {
  const context = { steps: { steam: { output: { profile: { personaname: "Thanh" }, summary: { topGames: [{ name: "Hades" }] } } } } };
  assert.equal(resolveExpressions("Hello {{ upper(steps.steam.output.profile.personaname) }}", context), "Hello THANH");
  assert.equal(resolveExpressions("{{ steps.steam.output.profile.personaname }}", context), "Thanh");
  assert.equal(resolveExpressions("{{ steps.steam.output.summary.topGames[0].name }}", context), "Hades");
  assert.equal(resolveExpressions("{{ steps.steam-account.output.profile.personaname }}", { steps: { "steam-account": { output: { profile: { personaname: "Thanh" } } } } }), "Thanh");
  assert.throws(() => resolveExpressions("{{ process.exit() }}", context), BadRequestException);
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

test("invalid expressions fail the execution instead of leaving it running", async () => {
  const executionUpdates: Array<Record<string, unknown>> = [];
  const nodeUpdates: Array<Record<string, unknown>> = [];
  const execution = {
    id: "execution-expression-error",
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
  const prisma = {
    execution: {
      findUnique: async () => execution,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: { data: Record<string, unknown> }) => { executionUpdates.push(data); return { ...execution, ...data }; },
    },
    nodeExecution: {
      upsert: async () => ({}),
      update: async ({ data }: { data: Record<string, unknown> }) => { nodeUpdates.push(data); return {}; },
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);

  await service.run(execution.id, "mock");

  assert.equal(executionUpdates.at(-1)?.status, ExecutionStatus.FAILED);
  assert.equal(executionUpdates.at(-1)?.errorCode, "INVALID_EXPRESSION");
  assert.equal(nodeUpdates.at(-1)?.status, "FAILED");
  assert.equal(nodeUpdates.at(-1)?.errorCode, "INVALID_EXPRESSION");
});

test("node debug executes only the selected mock node and skips downstream nodes", async () => {
  const executionUpdates: Array<Record<string, unknown>> = [];
  const nodeUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const execution = {
    id: "execution-node-debug",
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
  const prisma = {
    execution: {
      findUnique: async () => execution,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: { data: Record<string, unknown> }) => { executionUpdates.push(data); return { ...execution, ...data }; },
    },
    nodeExecution: {
      upsert: async () => ({}),
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => { nodeUpdates.push({ where, data }); return {}; },
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);

  await service.run(execution.id, "mock", undefined, "http");

  assert.equal(executionUpdates.at(-1)?.status, ExecutionStatus.SUCCEEDED);
  assert.ok(nodeUpdates.some((update) => (update.where.executionId_nodeId as { nodeId: string }).nodeId === "http" && update.data.status === "RUNNING"));
  assert.equal(nodeUpdates.some((update) => (update.where.executionId_nodeId as { nodeId: string }).nodeId === "downstream"), false);
});

test("retry creates a new execution from the failed pinned version and original redacted trigger data", async () => {
  const created: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const source = {
    id: "execution-source",
    status: ExecutionStatus.FAILED,
    mode: "MOCK",
    workflowVersionId: "version-7",
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
  assert.deepEqual(created, [{ workflowVersionId: "version-7", mode: "MOCK", triggerData: { event: "daily-report", authorization: "[REDACTED]" } }]);
  assert.deepEqual(audits[0]?.metadata, { sourceExecutionId: "execution-source", mode: "mock", workflowVersion: 7 });
});

test("trigger idempotency returns the existing pinned execution without creating another run", async () => {
  const created: Array<Record<string, unknown>> = [];
  const existing = { id: "execution-existing", workflowVersionId: "version-1", mode: "LIVE" };
  const prisma = {
    workflowVersion: { findUnique: async () => ({ id: "version-1", graph: { nodes: [], edges: [] }, workflow: { workspaceId: "workspace-1" } }) },
    execution: {
      findUnique: async () => existing,
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "execution-new", ...data }; },
    },
  };
  const service = new ExecutionService(prisma as never, {} as never, {} as never);

  const execution = await service.createScheduledExecution("version-1", { scheduledAt: "2026-10-25T10:30:00.000Z" }, "cron:version-1:cron:2026-10-25T10:30:00.000Z");

  assert.equal(execution.id, "execution-existing");
  assert.deepEqual(created, []);
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

test("retries only transient failures with capped exponential backoff", () => {
  assert.equal(isRetryableFailure({ code: "NETWORK_ERROR" }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 503 }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 401 }), false);
  assert.equal(retryDelayMs(1), 500);
  assert.equal(retryDelayMs(8), 30_000);
});
