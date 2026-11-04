import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { ExecutionService } from "../execution/execution.service";
import { LegacyDeliveryRecoveryService } from "./legacy-delivery-recovery.service";

test("legacy webhook acceptance fences lifecycle, endpoint and credential changes", { skip: process.env.FLUXORA_LEGACY_WEBHOOK_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname)) throw new Error("Webhook integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient(), suffix = randomUUID();
  const userId = `hook-owner-${suffix}`, workspaceId = `hook-space-${suffix}`, workflowId = `hook-flow-${suffix}`, firstId = `hook-v1-${suffix}`, secondId = `hook-v2-${suffix}`, endpointId = `hook-endpoint-${suffix}`, credentialId = `hook-credential-${suffix}`, path = `hook-${suffix}`;
  const graph = { nodes: [{ id: "github", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { credentialId, event: "push" } }], edges: [] };
  const input = { workflowId, workflowVersionId: firstId, endpointId, path, secretHash: null, encryptedSigningSecret: null, credentialSnapshot: { id: credentialId, encryptedData: "synthetic-ciphertext-v1" }, payload: { action: "push" } };
  let release: (() => void) | undefined;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `hook-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    await prisma.workflowVersion.createMany({ data: [{ id: firstId, workflowId, version: 1, status: "PUBLISHED", graph }, { id: secondId, workflowId, version: 2, status: "PUBLISHED", graph }] });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: firstId } });
    await prisma.credential.create({ data: { id: credentialId, workspaceId, provider: "GITHUB", label: "Synthetic", encryptedData: input.credentialSnapshot.encryptedData } });
    await prisma.webhookEndpoint.create({ data: { id: endpointId, workflowId, workflowVersionId: firstId, path } });
    const service = new ExecutionService(prisma as never, {} as never, {} as never);
    const accepted = { ...input, idempotencyKey: `webhook:${suffix}:accepted` };
    const [first, duplicate] = await Promise.all([service.createLegacyWebhookExecution(accepted), service.createLegacyWebhookExecution(accepted)]);
    assert.equal(first.id, duplicate.id);
    assert.equal(await prisma.execution.count({ where: { idempotencyKey: accepted.idempotencyKey } }), 1);
    await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { encryptedSigningSecret: "synthetic-registration" } });
    const managed = await service.createLegacyWebhookExecution({ ...input, encryptedSigningSecret: "synthetic-registration", credentialSnapshot: undefined, idempotencyKey: `webhook:${suffix}:registered` });
    assert.equal(managed.status, "QUEUED");
    const old = new Date(Date.now() - 180_000);
    await prisma.execution.update({ where: { id: first.id }, data: { createdAt: old } });
    await prisma.execution.update({ where: { id: managed.id }, data: { createdAt: old, startedAt: old } });
    const recovered: unknown[] = [];
    const recovery = new LegacyDeliveryRecoveryService({ execution: { findMany: (query: Parameters<typeof prisma.execution.findMany>[0]) => prisma.execution.findMany({ ...query, where: { AND: [query?.where ?? {}, { workflowVersionId: firstId }] } }) } } as never, { ensureDispatched: async (job: unknown) => { recovered.push(job); } } as never);
    await recovery.recover();
    assert.deepEqual(recovered, [{ executionId: first.id, mode: "live", initialOnly: true }]);

    for (const change of ["deactivate", "republish", "endpoint", "secret", "credential"] as const) {
      await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: true, publishedVersionId: firstId } });
      await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { secretHash: null, encryptedSigningSecret: null } });
      await prisma.credential.update({ where: { id: credentialId }, data: { encryptedData: input.credentialSnapshot.encryptedData } });
      let loaded!: () => void;
      const snapshotLoaded = new Promise<void>((resolve) => { loaded = resolve; });
      const resume = new Promise<void>((resolve) => { release = resolve; });
      const wrapped = {
        workflowVersion: { findUnique: async (args: Parameters<typeof prisma.workflowVersion.findUnique>[0]) => { const snapshot = await prisma.workflowVersion.findUnique(args); loaded(); await resume; return snapshot; } },
        credential: prisma.credential,
        $transaction: prisma.$transaction.bind(prisma),
      };
      const delayed = new ExecutionService(wrapped as never, {} as never, {} as never);
      const stale = { ...input, idempotencyKey: `webhook:${suffix}:${change}` };
      const pending = delayed.createLegacyWebhookExecution(stale);
      await snapshotLoaded;
      if (change === "deactivate") await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: false } });
      else if (change === "republish") await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: secondId } });
      else if (change === "endpoint") await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { encryptedSigningSecret: "new-synthetic-ciphertext" } });
      else if (change === "secret") await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { secretHash: "new-synthetic-hash" } });
      else await prisma.credential.update({ where: { id: credentialId }, data: { encryptedData: "synthetic-ciphertext-v2" } });
      release!(); release = undefined;
      await assert.rejects(pending, (error: any) => error.response?.code === "WEBHOOK_NOT_FOUND");
      assert.equal(await prisma.execution.count({ where: { idempotencyKey: stale.idempotencyKey } }), 0);
    }
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: first.id } })).status, "QUEUED");
  } finally {
    release?.();
    await prisma.execution.deleteMany({ where: { workflowVersionId: { in: [firstId, secondId] } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.credential.deleteMany({ where: { id: credentialId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
