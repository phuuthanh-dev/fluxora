import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ProviderPollService } from "./provider-poll.service";
import { providerPollTargets } from "./provider-poll-target";
import { driveChanges, driveStartCursor } from "./drive-trigger-protocol";
import { WorkflowService } from "../workflows/workflow.service";
import { NodeFailure } from "../execution/node-failure";

test("Drive trigger commits cursor and execution together, deduplicates and can recover after expiry", { skip: process.env.FLUXORA_RSS_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Provider poll integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID(), userId = `poll-user-${suffix}`, workspaceId = `poll-space-${suffix}`, workflowId = `poll-flow-${suffix}`, versionId = `poll-version-${suffix}`, credentialId = `poll-credential-${suffix}`;
  const graph = { nodes: [{ id: "drive", type: "trigger.google-drive.file" as const, position: { x: 0, y: 0 }, config: { credentialId, resourceId: "folder", resourceType: "folder", event: "created", pollMinutes: "5" } }], edges: [] };
  let expire = false;
  let page: Awaited<ReturnType<typeof driveChanges>> = { cursor: "next", hasMore: false, changes: [] };
  class Fixture extends ProviderPollService {
    protected override readonly driveCursor: typeof driveStartCursor = async () => "start";
    protected override readonly drivePage: typeof driveChanges = async () => { if (expire) throw new NodeFailure("DRIVE_CHECKPOINT_EXPIRED", "Expired", false); return page; };
  }
  const dispatched: string[] = [];
  const scheduler = new Fixture(prisma as never, { readGoogleForExecution: async () => ({ accessToken: "synthetic" }) } as never, { ensureDispatched: async ({ executionId }: { executionId: string }) => { dispatched.push(executionId); await prisma.execution.update({ where: { id: executionId }, data: { status: "RUNNING", startedAt: new Date() } }); } } as never);
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `poll-${suffix}` } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    await prisma.credential.create({ data: { id: credentialId, workspaceId, provider: "GOOGLE", label: "Synthetic", encryptedData: "synthetic" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    const workflows = new WorkflowService(prisma as never, {} as never, undefined, undefined, undefined, scheduler);
    await workflows.activate(workflowId, userId);
    const target = providerPollTargets(workflowId, versionId, workspaceId, graph)[0]!;
    const timestamp = new Date(Date.now() + 2_000).toISOString();
    page = { cursor: "next", hasMore: false, changes: [{ file: { id: "file1", name: "Example", parents: ["folder"], createdTime: timestamp, modifiedTime: timestamp, version: "1" } }] };
    await Promise.all([scheduler.poll(target), scheduler.poll(target)]);
    let checkpoint = await prisma.providerPollCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId, nodeId: "drive" } } });
    assert.equal(checkpoint.cursor, "next"); assert.equal(dispatched.length, 1);
    await prisma.providerPollCheckpoint.update({ where: { workflowId_nodeId: { workflowId, nodeId: "drive" } }, data: { nextPollAt: null } });
    page = { ...page, cursor: "next2" };
    await scheduler.poll(target);
    assert.equal(dispatched.length, 1);
    await prisma.providerPollCheckpoint.update({ where: { workflowId_nodeId: { workflowId, nodeId: "drive" } }, data: { nextPollAt: null } });
    expire = true; await scheduler.poll(target);
    checkpoint = await prisma.providerPollCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId, nodeId: "drive" } } });
    assert.equal(checkpoint.state, "ERROR"); assert.equal(checkpoint.cursor, "next2");
    await workflows.deactivate(workflowId, userId);
    await assert.rejects(workflows.resetProviderPoll(workflowId, userId, false));
    expire = false; await workflows.resetProviderPoll(workflowId, userId, true);
    checkpoint = await prisma.providerPollCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId, nodeId: "drive" } } });
    assert.equal(checkpoint.cursor, "start"); assert.equal(checkpoint.state, "READY");
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
