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

test("retries only transient failures with capped exponential backoff", () => {
  assert.equal(isRetryableFailure({ code: "NETWORK_ERROR" }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 503 }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 401 }), false);
  assert.equal(retryDelayMs(1), 500);
  assert.equal(retryDelayMs(8), 30_000);
});
