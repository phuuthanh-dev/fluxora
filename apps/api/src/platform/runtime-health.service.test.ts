import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeHealthService } from "./runtime-health.service";

test("readiness reports database and inline execution queue availability", async () => {
  const health = new RuntimeHealthService(
    { $queryRawUnsafe: async () => [{ "?column?": 1 }] } as never,
    { health: async () => ({ status: "ready", mode: "inline", waiting: 0, active: 0, delayed: 0, failed: 0 }) } as never,
  );
  const result = await health.readiness();
  assert.equal(result.status, "ready");
  assert.equal(result.checks.database, "ready");
  assert.equal(result.checks.queue.mode, "inline");
});

test("readiness degrades when Redis or PostgreSQL is unavailable", async () => {
  const redisUnavailable = new RuntimeHealthService(
    { $queryRawUnsafe: async () => [{ "?column?": 1 }] } as never,
    { health: async () => ({ status: "unavailable", mode: "redis", waiting: 0, active: 0, delayed: 0, failed: 0 }) } as never,
  );
  assert.equal((await redisUnavailable.readiness()).status, "degraded");

  const databaseUnavailable = new RuntimeHealthService(
    { $queryRawUnsafe: async () => { throw new Error("database unavailable"); } } as never,
    { health: async () => ({ status: "ready", mode: "redis", waiting: 2, active: 1, delayed: 0, failed: 0 }) } as never,
  );
  const result = await databaseUnavailable.readiness();
  assert.equal(result.status, "degraded");
  assert.equal(result.checks.database, "unavailable");
  assert.equal(result.checks.queue.active, 1);
});
