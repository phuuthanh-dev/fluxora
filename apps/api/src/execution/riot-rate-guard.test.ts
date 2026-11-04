import assert from "node:assert/strict";
import test from "node:test";
import { withRiotRateGuard } from "./riot-rate-guard";
import { NodeFailure } from "./node-failure";

function fixture() {
  let blockedUntil: Date | undefined;
  let locked = false;
  const tx = {
    $queryRaw: async () => [{ acquired: !locked }],
    riotApiGuard: {
      findUnique: async () => blockedUntil ? { blockedUntil } : null,
      upsert: async ({ create }: { create: { blockedUntil: Date } }) => { blockedUntil = create.blockedUntil; },
    },
  };
  const prisma = { $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as never;
  return { prisma, lock: () => { locked = true; }, blocked: () => blockedUntil };
}

test("Riot guard stops additional requests after Retry-After and when another worker holds the lock", async () => {
  const gate = fixture();
  const before = Date.now();
  const response = await withRiotRateGuard(gate.prisma, async () => new Response(null, { status: 429, headers: { "retry-after": "120" } }));
  assert.equal(response.status, 429);
  assert.ok(gate.blocked()!.getTime() >= before + 120_000);
  await assert.rejects(() => withRiotRateGuard(gate.prisma, async () => { throw new Error("must not call provider"); }), (reason: unknown) => reason instanceof NodeFailure && reason.code === "RIOT_RATE_LIMITED" && !reason.retryable);
  const busy = fixture(); busy.lock();
  await assert.rejects(() => withRiotRateGuard(busy.prisma, async () => { throw new Error("must not call provider"); }), (reason: unknown) => reason instanceof NodeFailure && reason.code === "RIOT_BUSY" && !reason.retryable);
});

test("Riot guard fails closed if Retry-After is missing or invalid", async () => {
  const gate = fixture();
  await withRiotRateGuard(gate.prisma, async () => new Response(null, { status: 429 }));
  assert.equal(gate.blocked()?.toISOString(), "9999-12-31T00:00:00.000Z");
});
