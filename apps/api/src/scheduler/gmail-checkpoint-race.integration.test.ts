import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { GmailTriggerService } from "./gmail-trigger.service";
import { NodeFailure } from "../execution/node-failure";
import { WorkflowService } from "../workflows/workflow.service";

test("late Gmail history responses and failures cannot alter an inactive checkpoint", { skip: process.env.FLUXORA_GMAIL_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Gmail race test requires a local disposable fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `gmail-race-user-${suffix}`;
  const workspaceId = `gmail-race-workspace-${suffix}`;
  const workflowId = `gmail-race-flow-${suffix}`;
  const versionId = `gmail-race-version-${suffix}`;
  let release = () => {};
  let pending: Promise<void> | undefined;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, name: "Synthetic", slug: `gmail-race-${suffix}`, ownerId: userId } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph: { nodes: [], edges: [] } } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    await prisma.gmailTriggerCheckpoint.create({ data: { workflowVersionId: versionId, nodeId: "mail", historyId: "100", mailboxHash: "synthetic" } });
    const service = new GmailTriggerService(prisma as never, { readGoogleForExecution: async () => ({ accessToken: "synthetic" }) } as never, {} as never, {} as never);
    for (const fail of [false, true]) {
      await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: true } });
      let entered = () => {};
      const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      Object.defineProperty(service, "provider", { configurable: true, value: {
        getGmailHistoryBaseline: async () => ({ historyId: "100", mailboxHash: "synthetic" }),
        getGmailHistoryPage: async () => { entered(); await gate; if (fail) throw new NodeFailure("GMAIL_HISTORY_EXPIRED", "expired", false); return { historyId: "200", messageIds: [], nextPageToken: null }; },
      } });
      pending = service.poll(versionId, workflowId, workspaceId, "mail", { credentialId: "synthetic" });
      await Promise.race([enteredPromise, pending.then(() => { throw new Error("Poll ended before the mocked history request."); })]);
      await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: false } });
      release();
      await pending;
      pending = undefined;
      const checkpoint = await prisma.gmailTriggerCheckpoint.findUniqueOrThrow({ where: { workflowVersionId_nodeId: { workflowVersionId: versionId, nodeId: "mail" } } });
      assert.equal(checkpoint.historyId, "100");
      assert.equal(checkpoint.state, "READY");
      assert.equal(checkpoint.lastErrorCode, null);
      assert.equal(checkpoint.leaseToken, null);
    }
  } finally {
    release();
    await pending?.catch(() => undefined);
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

test("a late Gmail queue acknowledgement cannot overwrite an owner-confirmed reset", { skip: process.env.FLUXORA_GMAIL_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Gmail race test requires a local disposable fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `gmail-reset-user-${suffix}`, workspaceId = `gmail-reset-workspace-${suffix}`, workflowId = `gmail-reset-flow-${suffix}`, versionId = `gmail-reset-version-${suffix}`;
  let release = () => {};
  let pending: Promise<void> | undefined;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, name: "Synthetic", slug: `gmail-reset-${suffix}`, ownerId: userId, members: { create: { userId, role: "OWNER" } } } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    const graph = { nodes: [{ id: "mail", type: "trigger.gmail", position: { x: 0, y: 0 }, config: { credentialId: "synthetic" } }], edges: [] };
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    await prisma.gmailTriggerCheckpoint.create({ data: { workflowVersionId: versionId, nodeId: "mail", historyId: "100", mailboxHash: "synthetic" } });
    let entered = () => {};
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const execution = { createGmailScheduledExecution: async () => {
      const created = await prisma.execution.create({ data: { workflowVersionId: versionId, mode: "LIVE" } });
      await prisma.gmailTriggerDelivery.update({ where: { workflowVersionId_nodeId_messageId: { workflowVersionId: versionId, nodeId: "mail", messageId: "message-1" } }, data: { executionId: created.id } });
      return { execution: created, alreadyDispatched: false };
    } };
    const service = new GmailTriggerService(prisma as never, { readGoogleForExecution: async () => ({ accessToken: "synthetic" }) } as never, execution as never, { dispatch: async () => { entered(); await gate; } } as never);
    Object.defineProperty(service, "provider", { value: {
      getGmailHistoryBaseline: async () => ({ historyId: "200", mailboxHash: "synthetic" }),
      getGmailHistoryPage: async () => ({ historyId: "200", messageIds: ["message-1"], nextPageToken: null }),
      getGmailMessage: async () => ({ labels: ["INBOX"], from: "sender@example.test", subject: "Synthetic" }),
    } });
    pending = service.poll(versionId, workflowId, workspaceId, "mail", { credentialId: "synthetic" });
    await Promise.race([enteredPromise, pending.then(() => { throw new Error("Poll ended before queue dispatch."); })]);
    await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: false } });
    const workflows = new WorkflowService(prisma as never, {} as never, service);
    await workflows.resetGmailTrigger(workflowId, userId, true);
    const key = { workflowVersionId_nodeId_messageId: { workflowVersionId: versionId, nodeId: "mail", messageId: "message-1" } };
    const reset = await prisma.gmailTriggerDelivery.findUniqueOrThrow({ where: key });
    assert.equal(reset.skipReason, "owner_confirmed_checkpoint_reset");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: reset.executionId! } })).status, "CANCELLED");
    release();
    await pending;
    pending = undefined;
    const after = await prisma.gmailTriggerDelivery.findUniqueOrThrow({ where: key });
    assert.equal(after.skipReason, reset.skipReason);
    assert.equal(after.dispatchedAt?.getTime(), reset.dispatchedAt?.getTime());
    assert.equal((await prisma.gmailTriggerCheckpoint.findUniqueOrThrow({ where: { workflowVersionId_nodeId: { workflowVersionId: versionId, nodeId: "mail" } } })).historyId, "200");
  } finally {
    release();
    await pending?.catch(() => undefined);
    await prisma.execution.deleteMany({ where: { workflowVersionId: versionId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

test("a stale Gmail poll cannot reserve a delivery after an owner-confirmed reset", { skip: process.env.FLUXORA_GMAIL_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Gmail race test requires a local disposable fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `gmail-reserve-user-${suffix}`, workspaceId = `gmail-reserve-workspace-${suffix}`, workflowId = `gmail-reserve-flow-${suffix}`, versionId = `gmail-reserve-version-${suffix}`;
  let release = () => {};
  let pending: Promise<void> | undefined;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, name: "Synthetic", slug: `gmail-reserve-${suffix}`, ownerId: userId, members: { create: { userId, role: "OWNER" } } } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    const graph = { nodes: [{ id: "mail", type: "trigger.gmail", position: { x: 0, y: 0 }, config: { credentialId: "synthetic" } }], edges: [] };
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    await prisma.gmailTriggerCheckpoint.create({ data: { workflowVersionId: versionId, nodeId: "mail", historyId: "100", mailboxHash: "synthetic" } });
    let entered = () => {};
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let paused = false;
    const wrappedPrisma = {
      workflow: prisma.workflow,
      gmailTriggerCheckpoint: {
        findUniqueOrThrow: prisma.gmailTriggerCheckpoint.findUniqueOrThrow.bind(prisma.gmailTriggerCheckpoint),
        updateMany: async (args: Parameters<typeof prisma.gmailTriggerCheckpoint.updateMany>[0]) => {
          const result = await prisma.gmailTriggerCheckpoint.updateMany(args);
          if (!paused && result.count === 1 && args.where?.leaseToken && args.data.leaseExpiresAt instanceof Date) {
            paused = true;
            entered();
            await gate;
          }
          return result;
        },
      },
      $transaction: prisma.$transaction.bind(prisma),
    };
    let reads = 0;
    const service = new GmailTriggerService(wrappedPrisma as never, { readGoogleForExecution: async () => ({ accessToken: "synthetic" }) } as never, {} as never, {} as never);
    Object.defineProperty(service, "provider", { value: {
      getGmailHistoryBaseline: async () => ({ historyId: "200", mailboxHash: "synthetic" }),
      getGmailHistoryPage: async () => ({ historyId: "200", messageIds: ["message-1"], nextPageToken: null }),
      getGmailMessage: async () => { reads++; throw new Error("stale poll must not read a message"); },
    } });
    pending = service.poll(versionId, workflowId, workspaceId, "mail", { credentialId: "synthetic" });
    await Promise.race([enteredPromise, pending.then(() => { throw new Error("Poll ended before the lease renewal."); })]);
    await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: false } });
    await new WorkflowService(prisma as never, {} as never, service).resetGmailTrigger(workflowId, userId, true);
    release();
    await pending;
    pending = undefined;
    const receipt = await prisma.gmailTriggerDelivery.findUnique({ where: { workflowVersionId_nodeId_messageId: { workflowVersionId: versionId, nodeId: "mail", messageId: "message-1" } } });
    assert.equal(receipt, null);
    assert.equal(reads, 0);
    const checkpoint = await prisma.gmailTriggerCheckpoint.findUniqueOrThrow({ where: { workflowVersionId_nodeId: { workflowVersionId: versionId, nodeId: "mail" } } });
    assert.equal(checkpoint.historyId, "200");
    assert.equal(checkpoint.leaseToken, null);
  } finally {
    release();
    await pending?.catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
