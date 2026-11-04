import type { PrismaService } from "../database/prisma.service";
import { NodeFailure } from "./node-failure";
import { parseRetryAfter } from "./retry-policy";

// All Riot calls share one advisory transaction lock. This deliberately favors
// compliance and predictable limits over parallel throughput in the MVP.
const riotLock = 703127093581n;
const riotBucket = "riot-global";
const indefinite = new Date("9999-12-31T00:00:00.000Z");

export async function withRiotRateGuard(prisma: PrismaService, request: () => Promise<Response>) {
  const outcome = await prisma.$transaction(async (tx) => {
    const locks = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(${riotLock}::bigint) AS acquired`;
    if (!locks[0]?.acquired) return { kind: "busy" as const };
    const existing = await tx.riotApiGuard.findUnique({ where: { id: riotBucket } });
    if (existing && existing.blockedUntil.getTime() > Date.now()) return { kind: "blocked" as const, until: existing.blockedUntil };
    const response = await request();
    if (response.status === 429) {
      const delay = parseRetryAfter(response.headers.get("retry-after"));
      const candidate = delay !== undefined && Number.isFinite(delay) && delay >= 0 ? Date.now() + delay : Number.POSITIVE_INFINITY;
      const blockedUntil = candidate < indefinite.getTime() ? new Date(candidate) : indefinite;
      await tx.riotApiGuard.upsert({ where: { id: riotBucket }, create: { id: riotBucket, blockedUntil }, update: { blockedUntil } });
    }
    return { kind: "response" as const, response };
  }, { timeout: 22_000, maxWait: 5_000 });
  if (outcome.kind === "busy") throw new NodeFailure("RIOT_BUSY", "Another Riot request is in progress. Try again after it completes.", false);
  if (outcome.kind === "blocked") throw new NodeFailure("RIOT_RATE_LIMITED", "Riot requests are paused after rate limiting. Try again after the provider's Retry-After period.", false, 429);
  return outcome.response;
}
