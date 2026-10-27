import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import IORedis from "ioredis";
import { Subject, filter } from "rxjs";
import { resolveQueueMode } from "./execution-queue.config";

export type ExecutionEvent = { data: { executionId: string; kind: string } };
const defaultChannel = "workflow-execution-events";

@Injectable()
export class ExecutionEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionEventsService.name);
  private readonly events = new Subject<ExecutionEvent>();
  private readonly mode = resolveQueueMode();
  private readonly channel = process.env.EXECUTION_EVENTS_CHANNEL?.trim() || defaultChannel;
  private publisher: IORedis | null = null;
  private subscriber: IORedis | null = null;

  async onModuleInit() {
    if (this.mode !== "redis") return;
    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    this.publisher = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.subscriber = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.publisher.on("error", () => this.logger.error("Execution event publisher is unavailable."));
    this.subscriber.on("error", () => this.logger.error("Execution event subscriber is unavailable."));
    this.subscriber.on("message", (channel, payload) => {
      if (channel !== this.channel) return;
      const event = parseExecutionEvent(payload);
      if (event) this.events.next(event);
    });
    await this.subscriber.subscribe(this.channel);
  }

  stream(executionId: string) {
    return this.events.pipe(filter((event) => event.data.executionId === executionId));
  }

  publish(executionId: string, kind: string) {
    const event: ExecutionEvent = { data: { executionId, kind } };
    if (this.mode === "inline") {
      this.events.next(event);
      return;
    }
    if (!this.publisher) {
      this.logger.error("Execution event publisher was not initialized.");
      return;
    }
    void this.publisher.publish(this.channel, JSON.stringify(event)).catch(() => {
      this.logger.error("Execution event could not be published.");
    });
  }

  async onModuleDestroy() {
    this.events.complete();
    await Promise.allSettled([
      this.subscriber?.unsubscribe(this.channel),
      this.publisher?.quit(),
      this.subscriber?.quit(),
    ].filter((operation): operation is Promise<unknown> => Boolean(operation)));
    this.publisher = null;
    this.subscriber = null;
  }
}

function parseExecutionEvent(payload: string): ExecutionEvent | null {
  try {
    const event = JSON.parse(payload) as unknown;
    if (!event || typeof event !== "object" || !("data" in event)) return null;
    const data = (event as { data?: unknown }).data;
    if (!data || typeof data !== "object") return null;
    const executionId = (data as { executionId?: unknown }).executionId;
    const kind = (data as { kind?: unknown }).kind;
    if (typeof executionId !== "string" || !executionId || typeof kind !== "string" || !kind) return null;
    return { data: { executionId, kind } };
  } catch {
    return null;
  }
}
