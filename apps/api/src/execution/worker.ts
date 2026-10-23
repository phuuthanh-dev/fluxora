import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { AppModule } from "../app.module";
import { ExecutionService } from "./execution.service";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const executions = app.get(ExecutionService);
  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const worker = new Worker<{ executionId: string; mode: "mock" | "live" }>("workflow-executions", async (job) => {
    await executions.run(job.data.executionId, job.data.mode);
  }, { connection });

  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    await app.close();
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}

void bootstrap();
