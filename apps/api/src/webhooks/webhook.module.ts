import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CredentialModule } from "../credentials/credential.module";
import { ExecutionModule } from "../execution/execution.module";
import { WebhookController } from "./webhook.controller";
import { WebhookService } from "./webhook.service";
import { ProviderWebhookRecoveryService } from "./provider-webhook-recovery.service";
import { GitHubWebhookAdapter } from "./github-webhook-adapter";
import { GitHubWebhookManagementService } from "./github-webhook-management.service";

@Module({ imports: [AuthModule, CredentialModule, ExecutionModule], controllers: [WebhookController], providers: [WebhookService, ProviderWebhookRecoveryService, GitHubWebhookAdapter, GitHubWebhookManagementService] })
export class WebhookModule {}
