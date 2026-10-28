import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProviderWebhookState } from "@prisma/client";
import { ProviderWebhookStateStore } from "./provider-webhook-state";

function memoryTable() {
  const row: { id: string; operationId: string; state: ProviderWebhookState; remoteHookId: bigint | null; updatedAt: Date } = { id: "one", operationId: "create-1", state: ProviderWebhookState.CREATING, remoteHookId: null, updatedAt: new Date("2026-01-01T00:00:00Z") };
  const table = {
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      if (where.id !== row.id || where.operationId !== row.operationId || where.state !== row.state) return { count: 0 };
      if (where.remoteHookId && row.remoteHookId === null) return { count: 0 };
      if (where.updatedAt && !(row.updatedAt < (where.updatedAt as { lt: Date }).lt)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };
  return { row, store: new ProviderWebhookStateStore(table) };
}

test("creation records the known remote identity only once and ignores stale replies", async () => {
  const { row, store } = memoryTable();
  const results = await Promise.all([store.finishCreate("one", "create-1", { kind: "created", hookId: 42 }), store.finishCreate("one", "create-1", { kind: "uncertain" })]);
  assert.deepEqual(results, [true, false]);
  assert.equal(row.state, "ACTIVE");
  assert.equal(row.remoteHookId, 42n);
  assert.equal(await store.finishCreate("one", "old", { kind: "created", hookId: 99 }), false);
  await assert.rejects(store.finishCreate("one", "old", { kind: "created", hookId: -1 }));
});

test("expired writes become uncertain, never eligible for automatic recreation or deletion", async () => {
  const { row, store } = memoryTable();
  assert.equal(await store.recoverExpired("one", "create-1", "create", new Date("2025-01-01")), false);
  assert.equal(await store.recoverExpired("one", "create-1", "create", new Date("2027-01-01")), true);
  assert.equal(row.state, "CREATE_UNCERTAIN");
  assert.equal(await store.finishCreate("one", "create-1", { kind: "created", hookId: 42 }), false);
  assert.equal(await store.beginDelete("one", "create-1", "delete-1"), false);
});

test("deletion requires a recorded active identity and makes ambiguous outcomes uncertain", async () => {
  const { row, store } = memoryTable();
  await store.finishCreate("one", "create-1", { kind: "created", hookId: 42 });
  assert.equal(await store.beginDelete("one", "create-1", "delete-1"), true);
  assert.equal(await store.beginDelete("one", "create-1", "delete-2"), false);
  assert.equal(await store.finishDelete("one", "create-1", "removed"), false);
  assert.equal(await store.finishDelete("one", "delete-1", "uncertain"), true);
  assert.equal(row.state, "DELETE_UNCERTAIN");
  assert.equal(row.remoteHookId, 42n);
  assert.equal(await store.beginDelete("one", "delete-1", "delete-2"), false);
});

test("definitive delete rejection retains ownership; explicit success records removal", async () => {
  const { row, store } = memoryTable();
  await store.finishCreate("one", "create-1", { kind: "created", hookId: 42 });
  await store.beginDelete("one", "create-1", "delete-1");
  assert.equal(await store.finishDelete("one", "delete-1", "rejected"), true);
  assert.equal(row.state, "ACTIVE");
  await store.beginDelete("one", "delete-1", "delete-2");
  assert.equal(await store.finishDelete("one", "delete-2", "removed"), true);
  assert.equal(row.state, "REMOVED");
  assert.equal(row.remoteHookId, 42n);
});
