import { Module } from "@nestjs/common";
import { ExecutionModule } from "../execution/execution.module";
import { CredentialModule } from "../credentials/credential.module";
import { CronSchedulerService } from "./cron-scheduler.service";
import { GmailTriggerService } from "./gmail-trigger.service";
import { RssTriggerService } from "./rss-trigger.service";
import { CalendarTriggerService } from "./calendar-trigger.service";
import { JiraPrivacyReportingService } from "./jira-privacy-reporting.service";

@Module({ imports: [ExecutionModule, CredentialModule], providers: [CronSchedulerService, GmailTriggerService, RssTriggerService, CalendarTriggerService, JiraPrivacyReportingService], exports: [GmailTriggerService, RssTriggerService, CalendarTriggerService] })
export class SchedulerModule {}
