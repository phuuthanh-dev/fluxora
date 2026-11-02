import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionStatus } from "@prisma/client";
import { KumaDeliveryRecoveryService } from "./kuma-delivery-recovery.service";
import { TelegramDeliveryRecoveryService } from "./telegram-delivery-recovery.service";

test("Kuma recovery only queues old, never-started deliveries with the initial-phase guard", async () => {
  let where: Record<string, unknown> | undefined;
  const jobs: unknown[] = [];
  const prisma = { execution: { findMany: async (input: { where: Record<string, unknown> }) => { where = input.where; return [{ id: "run-1" }]; } } };
  const service = new KumaDeliveryRecoveryService(prisma as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never);
  const now = new Date("2026-11-03T12:00:00Z");
  await service.recover(now);
  assert.deepEqual(where, { status: ExecutionStatus.QUEUED, mode: "LIVE", startedAt: null, idempotencyKey: { startsWith: "kuma-v2:" }, createdAt: { lt: new Date(now.getTime() - 120_000) } });
  assert.deepEqual(jobs, [{ executionId: "run-1", mode: "live", initialOnly: true }]);
});

test("a queue error does not prevent recovery of another accepted delivery", async () => {
  const jobs: string[] = [];
  const prisma = { execution: { findMany: async () => [{ id: "first" }, { id: "second" }] } };
  const service = new KumaDeliveryRecoveryService(prisma as never, { ensureDispatched: async (job: { executionId: string }) => { if (job.executionId === "first") throw new Error("offline"); jobs.push(job.executionId); } } as never);
  await service.recover();
  assert.deepEqual(jobs, ["second"]);
});

test("Telegram recovery reuses the initial-only fence with its own delivery prefix", async () => {
  let where: Record<string, unknown> | undefined;
  const jobs: unknown[] = [];
  const service = new TelegramDeliveryRecoveryService({ execution: { findMany: async (input: { where: Record<string, unknown> }) => { where = input.where; return [{ id: "telegram-run" }]; } } } as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never);
  await service.recover(new Date("2026-11-03T12:00:00Z"));
  assert.deepEqual(where?.idempotencyKey, { startsWith: "telegram-v1:" });
  assert.deepEqual(jobs, [{ executionId: "telegram-run", mode: "live", initialOnly: true }]);
});
