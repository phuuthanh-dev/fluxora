import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ProviderWebhookState } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { BackgroundWork } from "../platform/background-work";

// Longer than the provider's 15-second request timeout. An expired operation
// is uncertain, never silently retried or assumed to have failed.
const STALE_AFTER_MS = 5 * 60_000;
const INTERVAL_MS = 60_000;

@Injectable()
export class ProviderWebhookRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderWebhookRecoveryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly background = new BackgroundWork();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    // The automatic webhook feature is not exposed yet; enable recovery only
    // alongside its future lifecycle API and after the migration is applied.
    if (process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED !== "true" || process.env.PROCESS_ROLE === "worker") return;
    const scan = () => this.background.start(() => this.tick(), () => this.logger.error("Provider webhook recovery failed."));
    scan();
    this.timer = setInterval(scan, INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.background.drain();
  }

  async recover(now = new Date()) {
    if (!Number.isFinite(now.getTime())) throw new Error("A valid recovery time is required");
    const before = new Date(now.getTime() - STALE_AFTER_MS);
    return {
      create: await this.markExpired(ProviderWebhookState.CREATE_DISPATCHING, ProviderWebhookState.CREATE_UNCERTAIN, before),
      delete: await this.markExpired(ProviderWebhookState.DELETING, ProviderWebhookState.DELETE_UNCERTAIN, before),
    };
  }

  private async markExpired(state: ProviderWebhookState, uncertain: ProviderWebhookState, before: Date) {
    const records = await this.prisma.providerWebhookRegistration.findMany({ where: { state, updatedAt: { lt: before } }, select: { id: true }, orderBy: { updatedAt: "asc" }, take: 100 });
    if (!records.length) return 0;
    // Repeat the state and cutoff predicates so a concurrently completed or
    // refreshed operation cannot be overwritten after the read.
    const result = await this.prisma.providerWebhookRegistration.updateMany({ where: { id: { in: records.map((record) => record.id) }, state, updatedAt: { lt: before } }, data: { state: uncertain } });
    return result.count;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.recover(); }
    catch { this.logger.error("Provider webhook recovery failed; it will be retried."); }
    finally { this.running = false; }
  }
}
