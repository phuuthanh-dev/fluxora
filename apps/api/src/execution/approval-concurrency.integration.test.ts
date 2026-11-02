import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { ExecutionService } from "./execution.service";

test("concurrent decisions resolve an approval once and a terminal approval completes", { skip: process.env.FLUXORA_APPROVAL_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Approval integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `approval-user-${suffix}`, workspaceId = `approval-workspace-${suffix}`, workflowId = `approval-workflow-${suffix}`;
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => {} } as never);
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `approval-${suffix}` } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    const makeWaiting = async (version: number, withSuccessor: boolean) => {
      const versionId = `approval-version-${version}-${suffix}`, executionId = `approval-execution-${version}-${suffix}`, approvalId = `approval-request-${version}-${suffix}`;
      const graph = { nodes: [
        { id: "approval", type: "approval.request", position: { x: 0, y: 0 }, config: {} },
        ...(withSuccessor ? [{ id: "next", type: "condition.if", position: { x: 1, y: 0 }, config: { left: "yes", operator: "equals", right: "yes" } }] : []),
      ], edges: withSuccessor ? [{ id: "edge", source: "approval", target: "next", kind: "success" }] : [] };
      await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version, status: "PUBLISHED", graph } });
      await prisma.execution.create({ data: { id: executionId, workflowVersionId: versionId, mode: "MOCK", status: "WAITING_APPROVAL", startedAt: new Date() } });
      await prisma.nodeExecution.create({ data: { executionId, nodeId: "approval", status: "WAITING" } });
      await prisma.approvalRequest.create({ data: { id: approvalId, executionId, tokenHash: `synthetic-${version}-${suffix}`, expiresAt: new Date(Date.now() + 60_000) } });
      return { executionId, approvalId };
    };
    const race = await makeWaiting(1, true);
    const decisions = await Promise.allSettled([service.resolveApproval(race.approvalId, userId, "approved"), service.resolveApproval(race.approvalId, userId, "rejected")]);
    assert.equal(decisions.filter((result) => result.status === "fulfilled").length, 1);
    const approval = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: race.approvalId } });
    const execution = await prisma.execution.findUniqueOrThrow({ where: { id: race.executionId } });
    const node = await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: race.executionId, nodeId: "approval" } } });
    if (approval.status === "APPROVED") {
      assert.equal(execution.status, "QUEUED"); assert.equal(node.status, "SUCCEEDED");
      assert.ok(execution.resumeToken);
      assert.deepEqual(execution.resumeNodeIds, ["next"]);
      await service.run(race.executionId, "mock", ["approval"]);
      assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: race.executionId } })).status, "QUEUED");
    }
    else { assert.equal(approval.status, "REJECTED"); assert.equal(execution.status, "FAILED"); assert.equal(node.status, "FAILED"); }
    const terminal = await makeWaiting(2, false);
    const result = await service.resolveApproval(terminal.approvalId, userId, "approved");
    assert.equal(result.resumed, false);
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: terminal.executionId } })).status, "SUCCEEDED");
    const continuation = await makeWaiting(3, true);
    const accepted = await service.resolveApproval(continuation.approvalId, userId, "approved");
    assert.ok(accepted.resumeToken);
    await service.run(continuation.executionId, "mock", ["approval"]);
    await service.run(continuation.executionId, "mock", ["approval"], undefined, false, "stale-token");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: continuation.executionId } })).status, "QUEUED");
    // The persisted node list, not a queue-supplied list, selects the successor.
    await service.run(continuation.executionId, "mock", ["approval"], undefined, false, accepted.resumeToken);
    const finished = await prisma.execution.findUniqueOrThrow({ where: { id: continuation.executionId } });
    assert.equal(finished.status, "SUCCEEDED");
    assert.equal(finished.resumeToken, null);
    assert.equal((await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: continuation.executionId, nodeId: "next" } } })).status, "SUCCEEDED");

    // A node completion that arrives while cancellation holds the execution
    // lock must observe the committed cancellation before touching the node.
    const versionId = `approval-version-4-${suffix}`, executionId = `approval-execution-4-${suffix}`;
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 4, status: "PUBLISHED", graph: { nodes: [], edges: [] } } });
    await prisma.execution.create({ data: { id: executionId, workflowVersionId: versionId, mode: "MOCK", status: "RUNNING", startedAt: new Date(), runToken: "current-phase" } });
    await prisma.nodeExecution.create({ data: { executionId, nodeId: "in-flight", status: "RUNNING" } });
    const runner = service as unknown as {
      updateNodeWhileRunning: (id: string, runToken: string, nodeId: string, data: { status: "SUCCEEDED" }) => Promise<boolean>;
      renewLease: (id: string, runToken: string) => Promise<boolean>;
      finishRunning: (id: string, runToken: string, data: { status: "SUCCEEDED" }, event: "execution.succeeded") => Promise<unknown>;
    };
    assert.equal(await runner.updateNodeWhileRunning(executionId, "previous-phase", "in-flight", { status: "SUCCEEDED" }), false);
    assert.equal((await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId, nodeId: "in-flight" } } })).status, "RUNNING");
    assert.equal(await runner.renewLease(executionId, "previous-phase"), false);
    await runner.finishRunning(executionId, "previous-phase", { status: "SUCCEEDED" }, "execution.succeeded");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: executionId } })).status, "RUNNING");
    let completion: Promise<boolean> | undefined;
    let completionSettled = false;
    await prisma.$transaction(async (tx) => {
      await tx.execution.update({ where: { id: executionId }, data: { status: "CANCELLED", completedAt: new Date() } });
      await tx.nodeExecution.updateMany({ where: { executionId, status: "RUNNING" }, data: { status: "SKIPPED", completedAt: new Date() } });
      completion = runner.updateNodeWhileRunning(executionId, "current-phase", "in-flight", { status: "SUCCEEDED" });
      void completion.then(() => { completionSettled = true; }, () => { completionSettled = true; });
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      assert.equal(completionSettled, false);
    });
    assert.equal(await completion!, false);
    assert.equal((await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId, nodeId: "in-flight" } } })).status, "SKIPPED");
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
