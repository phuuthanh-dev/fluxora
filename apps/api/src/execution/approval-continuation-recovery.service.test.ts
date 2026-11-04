import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionStatus } from "@prisma/client";
import { ApprovalContinuationRecoveryService } from "./approval-continuation-recovery.service";

test("approval recovery queues persisted continuations with their phase tokens", async () => {
  let where: Record<string, unknown> | undefined;
  const jobs: unknown[] = [];
  const prisma = { execution: { findMany: async (input: { where: Record<string, unknown> }) => { where = input.where; return [{ id: "run", mode: "MOCK", resumeToken: "phase" }]; } } };
  const service = new ApprovalContinuationRecoveryService(prisma as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never);
  const now = new Date("2026-11-03T12:00:00Z");
  await service.recover(now);
  assert.deepEqual(where, { status: ExecutionStatus.QUEUED, resumeToken: { not: null }, resumeQueuedAt: { lt: new Date(now.getTime() - 30_000) } });
  assert.deepEqual(jobs, [{ executionId: "run", mode: "mock", resumeToken: "phase" }]);
});
