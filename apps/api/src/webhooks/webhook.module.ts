import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CredentialModule } from "../credentials/credential.module";
import { ExecutionModule } from "../execution/execution.module";
import { WebhookController } from "./webhook.controller";
import { WebhookService } from "./webhook.service";
import { ProviderWebhookRecoveryService } from "./provider-webhook-recovery.service";
import { GitHubWebhookAdapter, GITHUB_WEBHOOK_FETCH } from "./github-webhook-adapter";
import { GitHubWebhookManagementService } from "./github-webhook-management.service";
import { KumaDeliveryRecoveryService } from "./kuma-delivery-recovery.service";
import { TelegramDeliveryRecoveryService } from "./telegram-delivery-recovery.service";
import { VercelDeliveryRecoveryService } from "./vercel-delivery-recovery.service";
import { TrelloDeliveryRecoveryService } from "./trello-delivery-recovery.service";
import { SentryDeliveryRecoveryService } from "./sentry-delivery-recovery.service";

@Module({
  imports: [AuthModule, CredentialModule, ExecutionModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    ProviderWebhookRecoveryService,
    KumaDeliveryRecoveryService,
    TelegramDeliveryRecoveryService,
    VercelDeliveryRecoveryService,
    TrelloDeliveryRecoveryService,
    SentryDeliveryRecoveryService,
    { provide: GITHUB_WEBHOOK_FETCH, useValue: globalThis.fetch },
    GitHubWebhookAdapter,
    GitHubWebhookManagementService,
  ],
})
export class WebhookModule {}
