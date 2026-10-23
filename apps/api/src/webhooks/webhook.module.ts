import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExecutionModule } from "../execution/execution.module";
import { WebhookController } from "./webhook.controller";
import { WebhookService } from "./webhook.service";

@Module({ imports: [AuthModule, ExecutionModule], controllers: [WebhookController], providers: [WebhookService] })
export class WebhookModule {}
