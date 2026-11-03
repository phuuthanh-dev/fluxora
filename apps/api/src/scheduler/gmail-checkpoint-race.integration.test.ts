import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { GmailTriggerService } from "./gmail-trigger.service";
import { NodeFailure } from "../execution/node-failure";

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
