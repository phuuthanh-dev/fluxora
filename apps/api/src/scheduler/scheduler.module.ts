import { Module } from "@nestjs/common";
import { ExecutionModule } from "../execution/execution.module";
import { CredentialModule } from "../credentials/credential.module";
import { CronSchedulerService } from "./cron-scheduler.service";
import { GmailTriggerService } from "./gmail-trigger.service";

@Module({ imports: [ExecutionModule, CredentialModule], providers: [CronSchedulerService, GmailTriggerService], exports: [GmailTriggerService] })
export class SchedulerModule {}
