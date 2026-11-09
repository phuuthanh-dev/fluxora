import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { ExecutionMaintenanceService } from "../execution/execution-maintenance.service";
import { ExecutionService } from "../execution/execution.service";
import { TrelloDeliveryRecoveryService } from "./trello-delivery-recovery.service";
import { SlackDeliveryRecoveryService } from "./slack-delivery-recovery.service";
import { SentryDeliveryRecoveryService } from "./sentry-delivery-recovery.service";

test("Trello, Sentry and Slack deliveries are deduplicated and fenced by workflow and endpoint state", { skip: process.env.FLUXORA_PROVIDER_DELIVERY_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Provider delivery integration requires a disposable local fluxora_*test* database.");
  const previousKey = process.env.APP_ENCRYPTION_KEY;
  const previousMax = process.env.EXECUTION_RETENTION_MAX_COUNT;
  process.env.EXECUTION_RETENTION_MAX_COUNT = "1";
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `provider-user-${suffix}`, workspaceId = `provider-workspace-${suffix}`;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `provider-${suffix}` } });
    const service = new ExecutionService(prisma as never, {} as never, {} as never);
    const credentialId = `slack-credential-${suffix}`;
    await prisma.credential.create({ data: { id: credentialId, workspaceId, provider: "SLACK_OAUTH", label: "Synthetic", encryptedData: "unused-test-fixture" } });
    const scenarios = [
      { provider: "slack", type: "trigger.slack.event", config: { credentialId, channel: "CEXAMPLE", event: "app_mention" }, firstKey: "EvFirst", secondKey: "EvSecond", thirdKey: "EvThird" },
      { provider: "trello", type: "trigger.trello.board-action", config: { boardId: "4d5ea62fd76aa1136000000c", action: "all" }, firstKey: "5d5ea62fd76aa1136000000c", secondKey: "6d5ea62fd76aa1136000000c", thirdKey: "7d5ea62fd76aa1136000000c" },
      { provider: "sentry", type: "trigger.sentry.issue-created", config: { installationId: "64bf2cf2-37ee-46ae-a093-b7a52bd41a2a", project: "web" }, firstKey: "64bf2cf2-37ee-46ae-a093-b7a52bd41a2a:1", secondKey: "64bf2cf2-37ee-46ae-a093-b7a52bd41a2a:2", thirdKey: "64bf2cf2-37ee-46ae-a093-b7a52bd41a2a:3" },
    ] as const;
    for (const scenario of scenarios) {
      const workflowId = `${scenario.provider}-flow-${suffix}`, versionId = `${scenario.provider}-version-${suffix}`, endpointId = `${scenario.provider}-endpoint-${suffix}`, path = `${scenario.provider}-${suffix}`;
      await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
      await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph: { nodes: [{ id: "trigger", type: scenario.type, position: { x: 0, y: 0 }, config: scenario.config }], edges: [] } } });
      await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
      await prisma.webhookEndpoint.create({ data: { id: endpointId, path, workflowId, workflowVersionId: versionId, secretHash: "synthetic-hash" } });
      const create = scenario.provider === "trello" ? service.createTrelloScheduledExecution.bind(service) : scenario.provider === "slack" ? service.createSlackScheduledExecution.bind(service) : service.createSentryScheduledExecution.bind(service);
      // Receive the later synthetic identity first. Delivery identities are
      // independent; an earlier event must not be dropped when it arrives late.
      const input = { workflowId, workflowVersionId: versionId, endpointId, path, secretHash: "synthetic-hash", deliveryKey: scenario.secondKey, payload: { source: scenario.provider, event: "example", password: "synthetic-secret" } };
      const [first, duplicate] = await Promise.all([create(input), create(input)]);
      assert.equal(first.id, duplicate.id, scenario.provider);
      assert.ok(!first.idempotencyKey?.includes(scenario.secondKey));
      assert.ok(!JSON.stringify(first.triggerData).includes("synthetic-secret"));
      await assert.rejects(create({ ...input, payload: { ...input.payload, event: "different" } }), (error: unknown) => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "WEBHOOK_DELIVERY_CONFLICT");
      const next = await create({ ...input, deliveryKey: scenario.firstKey });
      assert.notEqual(next.id, first.id);
      assert.equal((await create({ ...input, deliveryKey: scenario.firstKey })).id, next.id);
      await prisma.execution.updateMany({ where: { id: { in: [first.id, next.id] } }, data: { createdAt: new Date(Date.now() - 3 * 60_000) } });
      const scoped = { execution: { findMany: (args: Prisma.ExecutionFindManyArgs) => prisma.execution.findMany({ ...args, where: { AND: [args.where ?? {}, { workflowVersionId: versionId }] } }) } };
      const jobs: Array<{ executionId: string; mode: string; initialOnly: boolean }> = [];
      const queue = { ensureDispatched: async (job: { executionId: string; mode: string; initialOnly: boolean }) => { jobs.push(job); } };
      const recovery = scenario.provider === "trello" ? new TrelloDeliveryRecoveryService(scoped as never, queue as never) : scenario.provider === "slack" ? new SlackDeliveryRecoveryService(scoped as never, queue as never) : new SentryDeliveryRecoveryService(scoped as never, queue as never);
      await recovery.recover();
      assert.deepEqual(jobs.map((job) => job.executionId).sort(), [first.id, next.id].sort());
      assert.ok(jobs.every((job) => job.mode === "live" && job.initialOnly));
      await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: false } });
      await assert.rejects(create({ ...input, deliveryKey: scenario.thirdKey }));
      assert.equal(await prisma.execution.count({ where: { workflowVersionId: versionId } }), 2);
      await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: true } });
      await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { secretHash: "rotated" } });
      await assert.rejects(create({ ...input, deliveryKey: scenario.thirdKey }));
      assert.notEqual((await create({ ...input, secretHash: "rotated", deliveryKey: scenario.thirdKey })).id, first.id);
      const now = new Date();
      await prisma.execution.updateMany({ where: { workflowVersionId: versionId }, data: { status: "SUCCEEDED", completedAt: now } });
      await prisma.execution.createMany({ data: [0, 1].map(() => ({ workflowVersionId: versionId, mode: "MOCK", status: "SUCCEEDED", completedAt: now })) });
      const maintenance = { execution: {
        deleteMany: (args: { where: Prisma.ExecutionWhereInput }) => prisma.execution.deleteMany({ where: { AND: [args.where, { workflowVersionId: versionId }] } }),
        findMany: scoped.execution.findMany,
      } };
      await new ExecutionMaintenanceService(maintenance as never, service).pruneFinished(now);
      assert.ok(await prisma.execution.findUnique({ where: { id: first.id } }), `${scenario.provider} replay identity survives early pruning`);
      await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: null } });
      await assert.rejects(create({ ...input, secretHash: "rotated", deliveryKey: scenario.thirdKey }));
    }
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflow: { workspaceId } } } });
    await prisma.workflow.deleteMany({ where: { workspaceId } });
    await prisma.credential.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    if (previousMax === undefined) delete process.env.EXECUTION_RETENTION_MAX_COUNT; else process.env.EXECUTION_RETENTION_MAX_COUNT = previousMax;
    if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previousKey;
  }
});
