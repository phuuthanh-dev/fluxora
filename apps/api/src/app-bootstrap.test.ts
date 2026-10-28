import assert from "node:assert/strict";
import test from "node:test";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { GitHubWebhookAdapter } from "./webhooks/github-webhook-adapter";

const isolatedBootstrapEnvironment = {
  PROCESS_ROLE: "worker",
  EXECUTION_QUEUE_MODE: "inline",
  EXECUTION_MAINTENANCE_ENABLED: "false",
  SCHEDULER_ENABLED: "false",
  GITHUB_WEBHOOK_AUTOMATION_ENABLED: "false",
} as const;

test("application bootstrap resolves the GitHub webhook adapter without external I/O", async () => {
  const previous = new Map(Object.keys(isolatedBootstrapEnvironment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, isolatedBootstrapEnvironment);
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    assert.ok(app.get(GitHubWebhookAdapter) instanceof GitHubWebhookAdapter);
  } finally {
    await app?.close();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
