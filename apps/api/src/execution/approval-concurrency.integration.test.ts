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
      await prisma.nodeExecution.create({ data: { executionId, nodeId: "approval", status: "WAITING", output: { approvalRequestId: approvalId } } });
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

    // Pending parallel work is retained across approval instead of disappearing.
    for (const [version, decision] of [[41, "approved"], [42, "rejected"]] as const) {
      const graph = { nodes: [
        { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
        { id: "approval", type: "approval.request", position: { x: 1, y: 0 }, config: {} },
        { id: "sibling", type: "action.http-request", position: { x: 1, y: 1 }, config: { url: "https://example.test/sibling" } },
        { id: "finish", type: "action.http-request", position: { x: 2, y: 0 }, config: { url: "https://example.test/{{ steps.sibling.output.status }}" } },
      ], edges: [
        { id: "a", source: "start", target: "approval", kind: "success" },
        { id: "b", source: "start", target: "sibling", kind: "success" },
        { id: "c", source: "approval", target: "finish", kind: "success" },
        { id: "d", source: "sibling", target: "finish", kind: "success" },
      ] };
      const versionId = `parallel-version-${version}-${suffix}`, executionId = `parallel-execution-${version}-${suffix}`;
      await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version, status: "PUBLISHED", graph } });
      await prisma.execution.create({ data: { id: executionId, workflowVersionId: versionId, mode: "MOCK" } });
      await service.run(executionId, "mock");
      const waiting = await prisma.execution.findUniqueOrThrow({ where: { id: executionId }, include: { approvalRequests: true } });
      assert.equal(waiting.status, "WAITING_APPROVAL");
      assert.deepEqual(waiting.resumeNodeIds, ["sibling"]);
      const result = await service.resolveApproval(waiting.approvalRequests[0]!.id, userId, decision);
      if (decision === "rejected") {
        assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: executionId } })).status, "FAILED");
        assert.equal((await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId, nodeId: "sibling" } } })).status, "SKIPPED");
      } else {
        assert.deepEqual(result.startNodeIds, ["sibling", "finish"]);
        assert.ok(result.resumeToken);
        await service.run(executionId, "mock", undefined, undefined, false, result.resumeToken);
        const finished = await prisma.execution.findUniqueOrThrow({ where: { id: executionId }, include: { nodeExecutions: true } });
        assert.equal(finished.status, "SUCCEEDED");
        assert.equal(finished.nodeExecutions.find((node) => node.nodeId === "sibling")?.status, "SUCCEEDED");
        const finish = finished.nodeExecutions.find((node) => node.nodeId === "finish");
        assert.equal(finish?.status, "SUCCEEDED");
        assert.equal((finish?.output as { body?: { url?: string } })?.body?.url, "https://example.test/200");
      }
    }

    // A bad queue payload must not turn a saved mock run into a live send or
    // consume the claim needed by the correct job. The credential service is
    // intentionally empty; no real provider is contacted by either call.
    const modeVersionId = `mode-version-${suffix}`, modeExecutionId = `mode-execution-${suffix}`;
    const modeGraph = { nodes: [
      { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
      { id: "send", type: "action.telegram.message", position: { x: 1, y: 0 }, config: { credentialId: "synthetic", chatId: "123", text: "synthetic" } },
    ], edges: [{ id: "edge", source: "start", target: "send", kind: "success" }] };
    await prisma.workflowVersion.create({ data: { id: modeVersionId, workflowId, version: 40, status: "PUBLISHED", graph: modeGraph } });
    await prisma.execution.create({ data: { id: modeExecutionId, workflowVersionId: modeVersionId, mode: "MOCK" } });
    await service.run(modeExecutionId, "live");
    const stillQueued = await prisma.execution.findUniqueOrThrow({ where: { id: modeExecutionId }, include: { nodeExecutions: true } });
    assert.equal(stillQueued.status, "QUEUED");
    assert.equal(stillQueued.startedAt, null);
    assert.equal(stillQueued.nodeExecutions.length, 0);
    await service.run(modeExecutionId, "mock");
    const mockFinished = await prisma.execution.findUniqueOrThrow({ where: { id: modeExecutionId }, include: { nodeExecutions: true } });
    assert.equal(mockFinished.status, "SUCCEEDED");
    assert.equal(mockFinished.nodeExecutions.find((node) => node.nodeId === "send")?.status, "SUCCEEDED");

    // Hold the approval row until after its deadline. The request must have
    // acquired the execution and node locks before reaching the locked
    // approval row, otherwise the intended lock-wait race is not tested.
    const expiring = await makeWaiting(5, true);
    const deadline = new Date(Date.now() + 4_000);
    await prisma.approvalRequest.update({ where: { id: expiring.approvalId }, data: { expiresAt: deadline } });
    let entered = () => {};
    const reachedApprovalLock = new Promise<void>((resolve) => { entered = resolve; });
    const observedPrisma = {
      approvalRequest: prisma.approvalRequest,
      nodeExecution: prisma.nodeExecution,
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
        return prisma.$transaction(async (transaction) => callback(new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === "$queryRaw") return (strings: TemplateStringsArray, ...values: unknown[]) => {
              if (strings.join("").includes('FROM "ApprovalRequest"')) entered();
              return target.$queryRaw(strings, ...values);
            };
            return Reflect.get(target, property, receiver);
          },
        })));
      },
    };
    const expiryEvents: string[] = [];
    const gatedService = new ExecutionService(observedPrisma as never, {} as never, { publish: (_id: string, event: string) => { expiryEvents.push(event); } } as never);
    let outcome: Promise<{ ok: boolean }> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ApprovalRequest" WHERE id = ${expiring.approvalId} FOR UPDATE`;
      outcome = gatedService.resolveApproval(expiring.approvalId, userId, "approved").then(() => ({ ok: true }), () => ({ ok: false }));
      await Promise.race([reachedApprovalLock, outcome.then(() => { throw new Error("Decision ended before reaching the blocked approval lock."); })]);
      const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
      assert.ok(clock[0]!.now < deadline, "the decision must reach the locked approval before expiry");
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, deadline.getTime() - Date.now() + 100)));
    }, { timeout: 10_000 });
    assert.equal((await outcome!).ok, false, "a decision waiting past expiry must not be accepted");
    assert.equal((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: expiring.approvalId } })).status, "EXPIRED");
    const expiredExecution = await prisma.execution.findUniqueOrThrow({ where: { id: expiring.executionId } });
    assert.equal(expiredExecution.status, "FAILED");
    assert.equal(expiredExecution.errorCode, "APPROVAL_EXPIRED");
    assert.equal((await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: expiring.executionId, nodeId: "approval" } } })).status, "FAILED");
    assert.deepEqual(expiryEvents, ["execution.failed"]);
    const alreadyExpired = await makeWaiting(6, false);
    await prisma.approvalRequest.update({ where: { id: alreadyExpired.approvalId }, data: { expiresAt: new Date("2020-01-01T00:00:00Z") } });
    await assert.rejects(service.resolveApproval(alreadyExpired.approvalId, userId, "approved"), /Approval request has expired/);
    assert.equal((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: alreadyExpired.approvalId } })).status, "EXPIRED");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: alreadyExpired.executionId } })).errorCode, "APPROVAL_EXPIRED");

    // Maintenance uses the same execution-first lock as an owner's decision.
    // Its database clock check prevents an early scan from expiring a request.
    const scanned = await makeWaiting(7, true);
    const maintenanceEvents: string[] = [];
    const maintenanceService = new ExecutionService(prisma as never, {} as never, { publish: (_id: string, event: string) => { maintenanceEvents.push(event); } } as never);
    assert.equal(await maintenanceService.expireApprovalFromMaintenance(scanned.approvalId, scanned.executionId), false);
    await prisma.approvalRequest.update({ where: { id: scanned.approvalId }, data: { expiresAt: new Date("2020-01-01T00:00:00Z") } });
    const scans = await Promise.all([
      maintenanceService.expireApprovalFromMaintenance(scanned.approvalId, scanned.executionId),
      maintenanceService.expireApprovalFromMaintenance(scanned.approvalId, scanned.executionId),
    ]);
    assert.deepEqual(scans.sort(), [false, true]);
    assert.equal((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: scanned.approvalId } })).status, "EXPIRED");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: scanned.executionId } })).errorCode, "APPROVAL_EXPIRED");
    assert.equal((await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: scanned.executionId, nodeId: "approval" } } })).status, "FAILED");
    assert.deepEqual(maintenanceEvents, ["execution.failed"]);

    const ambiguous = await makeWaiting(8, true);
    await prisma.approvalRequest.update({ where: { id: ambiguous.approvalId }, data: { expiresAt: new Date("2020-01-01T00:00:00Z") } });
    await prisma.nodeExecution.create({ data: { executionId: ambiguous.executionId, nodeId: "extra-waiting", status: "WAITING" } });
    assert.equal(await maintenanceService.expireApprovalFromMaintenance(ambiguous.approvalId, ambiguous.executionId), false);
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: ambiguous.executionId } })).status, "WAITING_APPROVAL");
    assert.equal((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: ambiguous.approvalId } })).status, "PENDING");

    const mismatched = await makeWaiting(10, true);
    await prisma.approvalRequest.update({ where: { id: mismatched.approvalId }, data: { expiresAt: new Date("2020-01-01T00:00:00Z") } });
    await prisma.nodeExecution.update({ where: { executionId_nodeId: { executionId: mismatched.executionId, nodeId: "approval" } }, data: { output: { approvalRequestId: "other" } } });
    assert.equal(await maintenanceService.expireApprovalFromMaintenance(mismatched.approvalId, mismatched.executionId), false);
    await assert.rejects(service.resolveApproval(mismatched.approvalId, userId, "approved"), /not waiting on an approval node/);
    assert.equal((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: mismatched.approvalId } })).status, "PENDING");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: mismatched.executionId } })).status, "WAITING_APPROVAL");

    // The preliminary lookup may see an old committed output while another
    // transaction changes it. The locked recheck must observe the new value.
    const changing = await makeWaiting(11, true);
    let reachedNode = () => {};
    const reachedNodeLock = new Promise<void>((resolve) => { reachedNode = resolve; });
    const changingPrisma = {
      approvalRequest: prisma.approvalRequest,
      nodeExecution: prisma.nodeExecution,
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => prisma.$transaction(async (transaction) => callback(new Proxy(transaction, {
        get(target, property, receiver) {
          if (property === "$queryRaw") return (strings: TemplateStringsArray, ...values: unknown[]) => {
            if (strings.join("").includes('FROM "NodeExecution"')) reachedNode();
            return target.$queryRaw(strings, ...values);
          };
          return Reflect.get(target, property, receiver);
        },
      }))),
    };
    const changingService = new ExecutionService(changingPrisma as never, {} as never, { publish: (_id: string, event: string) => { maintenanceEvents.push(event); } } as never);
    let changingDecision: Promise<boolean> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.nodeExecution.update({ where: { executionId_nodeId: { executionId: changing.executionId, nodeId: "approval" } }, data: { output: { approvalRequestId: "other" } } });
      changingDecision = changingService.resolveApproval(changing.approvalId, userId, "approved").then(() => true, () => false);
      await Promise.race([reachedNodeLock, changingDecision.then(() => { throw new Error("Decision ended before waiting on node lock."); })]);
    });
    assert.equal(await changingDecision!, false);
    assert.equal((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: changing.approvalId } })).status, "PENDING");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: changing.executionId } })).status, "WAITING_APPROVAL");
    assert.deepEqual(maintenanceEvents, ["execution.failed"]);

    const rollback = await makeWaiting(9, true);
    await prisma.approvalRequest.update({ where: { id: rollback.approvalId }, data: { expiresAt: new Date("2020-01-01T00:00:00Z") } });
    const failingMaintenancePrisma = {
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => prisma.$transaction(async (transaction) => callback(new Proxy(transaction, {
        get(target, property, receiver) {
          if (property === "nodeExecution") return new Proxy(target.nodeExecution, {
            get(nodeTarget, nodeProperty, nodeReceiver) {
              if (nodeProperty === "update") return async (args: Parameters<typeof target.nodeExecution.update>[0]) => {
                await target.nodeExecution.update(args);
                throw new Error("synthetic failure after node update");
              };
              return Reflect.get(nodeTarget, nodeProperty, nodeReceiver);
            },
          });
          return Reflect.get(target, property, receiver);
        },
      }))),
    };
    const failingMaintenance = new ExecutionService(failingMaintenancePrisma as never, {} as never, { publish: (_id: string, event: string) => { maintenanceEvents.push(event); } } as never);
    await assert.rejects(failingMaintenance.expireApprovalFromMaintenance(rollback.approvalId, rollback.executionId), /synthetic failure/);
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: rollback.executionId } })).status, "WAITING_APPROVAL");
    assert.equal((await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: rollback.executionId, nodeId: "approval" } } })).status, "WAITING");
    assert.equal((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: rollback.approvalId } })).status, "PENDING");
    assert.deepEqual(maintenanceEvents, ["execution.failed"]);

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

test("expired execution and node transitions roll back together on database failure", { skip: process.env.FLUXORA_APPROVAL_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Lease integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `lease-user-${suffix}`, workspaceId = `lease-workspace-${suffix}`, workflowId = `lease-workflow-${suffix}`, versionId = `lease-version-${suffix}`, executionId = `lease-execution-${suffix}`;
  const events: string[] = [];
  const service = new ExecutionService(prisma as never, {} as never, { publish: (_id: string, event: string) => { events.push(event); } } as never);
  const failingPrisma = {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => prisma.$transaction(async (transaction) => callback({
      execution: transaction.execution,
      nodeExecution: { updateMany: async (args: Parameters<typeof transaction.nodeExecution.updateMany>[0]) => {
        await transaction.nodeExecution.updateMany(args);
        throw new Error("synthetic failure after node update");
      } },
    })),
  };
  const failingService = new ExecutionService(failingPrisma as never, {} as never, { publish: (_id: string, event: string) => { events.push(event); } } as never);
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `lease-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, graph: { nodes: [], edges: [] } } });
    await prisma.execution.create({ data: { id: executionId, workflowVersionId: versionId, mode: "MOCK", status: "RUNNING", startedAt: new Date(), leaseExpiresAt: new Date("2020-01-01T00:00:00Z"), runToken: "synthetic-phase" } });
    await prisma.nodeExecution.createMany({ data: [{ executionId, nodeId: "running", status: "RUNNING" }, { executionId, nodeId: "pending", status: "PENDING" }] });
    await assert.rejects(failingService.failFromMaintenance(executionId, "TEST", "Synthetic"), /synthetic failure/);
    const unchanged = await prisma.execution.findUniqueOrThrow({ where: { id: executionId }, include: { nodeExecutions: true } });
    assert.equal(unchanged.status, "RUNNING");
    assert.equal(unchanged.runToken, "synthetic-phase");
    assert.deepEqual(unchanged.nodeExecutions.map((node) => node.status).sort(), ["PENDING", "RUNNING"]);
    assert.deepEqual(events, []);

    await prisma.execution.update({ where: { id: executionId }, data: { leaseExpiresAt: new Date(Date.now() + 60_000) } });
    assert.equal(await service.failFromMaintenance(executionId, "TEST", "Synthetic"), false);
    assert.deepEqual(events, []);
    await prisma.execution.update({ where: { id: executionId }, data: { leaseExpiresAt: new Date("2020-01-01T00:00:00Z") } });
    assert.equal(await service.failFromMaintenance(executionId, "TEST", "Synthetic"), true);
    assert.equal(await service.failFromMaintenance(executionId, "TEST", "Synthetic"), false);
    const finished = await prisma.execution.findUniqueOrThrow({ where: { id: executionId }, include: { nodeExecutions: true } });
    assert.equal(finished.status, "FAILED");
    assert.equal(finished.runToken, null);
    assert.equal(finished.recoveryCount, 1);
    assert.deepEqual(finished.nodeExecutions.map((node) => node.status).sort(), ["FAILED", "SKIPPED"]);
    assert.deepEqual(events, ["execution.failed"]);
  } finally {
    await prisma.execution.deleteMany({ where: { id: executionId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
