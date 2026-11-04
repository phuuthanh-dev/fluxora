import assert from "node:assert/strict";
import test from "node:test";
import { PrismaService } from "../database/prisma.service";
import { NodeFailure } from "./node-failure";
import { withRiotRateGuard } from "./riot-rate-guard";

test("Riot cooldown and serialization persist across separate database clients", { skip: process.env.FLUXORA_RIOT_INTEGRATION !== "1" }, async () => {
  const first = new PrismaService();
  const second = new PrismaService();
  await first.$connect();
  await second.$connect();
  try {
    await first.riotApiGuard.deleteMany({ where: { id: "riot-global" } });
    let release!: () => void;
    let entered!: () => void;
    const running = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const request = withRiotRateGuard(first, async () => { entered(); await gate; return new Response(null, { status: 429, headers: { "Retry-After": "120" } }); });
    await running;
    await assert.rejects(() => withRiotRateGuard(second, async () => { throw new Error("unexpected request"); }), (reason: unknown) => reason instanceof NodeFailure && reason.code === "RIOT_BUSY");
    release();
    assert.equal((await request).status, 429);
    await assert.rejects(() => withRiotRateGuard(second, async () => { throw new Error("unexpected request"); }), (reason: unknown) => reason instanceof NodeFailure && reason.code === "RIOT_RATE_LIMITED");
  } finally {
    await first.riotApiGuard.deleteMany({ where: { id: "riot-global" } });
    await first.$disconnect();
    await second.$disconnect();
  }
});
