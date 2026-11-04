import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
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
import { ApprovalModule } from "./approvals/approval.module";
import { RuntimeHealthService } from "./platform/runtime-health.service";
import { RequestDrainInterceptor } from "./platform/request-drain.interceptor";

@Module({
  imports: [ConfigModule.forRoot({ envFilePath: resolve(__dirname, "../../../.env"), isGlobal: true }), PrismaModule, AuthModule, WorkspaceModule, WorkflowModule, CredentialModule, ExecutionModule, SchedulerModule, WebhookModule, ApprovalModule],
  controllers: [HealthController],
  providers: [RuntimeHealthService, RequestDrainInterceptor, { provide: APP_INTERCEPTOR, useExisting: RequestDrainInterceptor }],
})
export class AppModule {}
