import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import type { WorkflowNode } from "@workflow/contracts";
import { historicalDeduplicate } from "./historical-deduplication-store";

function disposable(): boolean {
  try { const url = new URL(process.env.DATABASE_URL ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname); } catch { return false; }
}

test("historical deduplication serializes concurrent runs, fences recovery and isolates mock runs", { skip: !disposable() }, async () => {
  const db = new PrismaClient(), suffix = randomUUID(), previousKey = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const userId = `dedup-user-${suffix}`, workspaceId = `dedup-workspace-${suffix}`, workflowId = `dedup-workflow-${suffix}`, versionId = `dedup-version-${suffix}`;
  const executions = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => `dedup-execution-${index}-${suffix}`);
  const node: WorkflowNode = { id: "unique", type: "action.remove-duplicates", position: { x: 0, y: 0 }, config: { operation: "history", historyFields: "id", historyMode: "new" } };
  const input = [{ json: { id: "private-test-value" } }];
  try {
    await db.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await db.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Dedup test", slug: `dedup-${suffix}` } });
    await db.workflow.create({ data: { id: workflowId, workspaceId, name: "Dedup test" } });
    await db.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, graph: { nodes: [], edges: [] } } });
    for (const id of executions) await db.execution.create({ data: { id, workflowVersionId: versionId, status: "RUNNING", runToken: id } });
    const run = (id: string, testNode = node, mock = false) => historicalDeduplicate(db as never, workflowId, id, id, testNode, input, mock);
    const results = await Promise.all([run(executions[0]!), run(executions[1]!)]);
    assert.deepEqual(results.map((result) => result?.length).sort(), [0, 1]);
    assert.deepEqual(await run(executions[0]!), results[0], "a resumed execution must use its original receipt");
    assert.equal((await run(executions[2]!, node, true))?.length, 1, "mock runs use independent ephemeral history");
    assert.equal(await historicalDeduplicate(db as never, workflowId, executions[2]!, "stale-token", node, input, false), null);
    const stored = await db.deduplicationHistory.findFirstOrThrow({ where: { workflowId } });
    assert.doesNotMatch(stored.encryptedState, /private-test-value/);
    const clear = { ...node, config: { operation: "clear" } };
    assert.equal((await run(executions[2]!, clear))?.length, 1);
    assert.equal((await run(executions[3]!))?.length, 1, "clear removes the chosen node history");
    assert.equal((await run(executions[4]!, { ...node, id: "other" }))?.length, 1, "node scopes do not share history");
    const shared = { ...node, config: { ...node.config, historyScope: "workflow" } };
    assert.equal((await run(executions[5]!, shared))?.length, 1);
    assert.equal((await run(executions[6]!, { ...shared, id: "other" }))?.length, 0, "workflow scope is shared between nodes");
    await assert.rejects(() => run(executions[5]!, { ...shared, config: { ...shared.config, historyMode: "higher" } }), { code: "DEDUP_REPLAY_INVALID" });
    assert.equal((await run(executions[7]!, { ...shared, config: { operation: "clear", historyScope: "workflow" } }))?.length, 1);
    const atomicNode = { ...node, id: "atomic" };
    const atomic = () => historicalDeduplicate(db as never, workflowId, executions[8]!, executions[8]!, atomicNode, input, false, true);
    await assert.rejects(atomic, "missing node execution must roll back its history and receipt");
    assert.equal(await db.deduplicationHistory.count({ where: { workflowId, scopeKey: "node:atomic" } }), 0);
    assert.equal(await db.deduplicationReceipt.count({ where: { executionId: executions[8]! } }), 0);
    await db.nodeExecution.create({ data: { executionId: executions[8]!, nodeId: "atomic", status: "PENDING" } });
    assert.equal((await atomic())?.length, 1);
    const completed = await db.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: executions[8]!, nodeId: "atomic" } }, include: { items: true } });
    assert.equal(completed.status, "SUCCEEDED");
    assert.equal(completed.items.length, 1);
    assert.equal((await atomic())?.length, 1, "a repeated delivery returns its committed receipt");
  } finally {
    await db.execution.deleteMany({ where: { workflowVersionId: versionId } });
    await db.workflowVersion.deleteMany({ where: { id: versionId } });
    await db.workflow.deleteMany({ where: { id: workflowId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
    if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previousKey;
  }
});
