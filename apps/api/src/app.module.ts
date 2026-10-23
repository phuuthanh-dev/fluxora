import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthController } from "./health.controller";
import { WorkspaceModule } from "./workspaces/workspace.module";
import { WorkflowModule } from "./workflows/workflow.module";
import { ExecutionModule } from "./execution/execution.module";
import { CredentialModule } from "./credentials/credential.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { WebhookModule } from "./webhooks/webhook.module";

@Module({
  imports: [ConfigModule.forRoot({ envFilePath: resolve(__dirname, "../../../.env"), isGlobal: true }), PrismaModule, AuthModule, WorkspaceModule, WorkflowModule, CredentialModule, ExecutionModule, SchedulerModule, WebhookModule],
  controllers: [HealthController],
})
export class AppModule {}
