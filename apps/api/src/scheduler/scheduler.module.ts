import { Module } from "@nestjs/common";
import { ExecutionModule } from "../execution/execution.module";
import { CronSchedulerService } from "./cron-scheduler.service";

@Module({ imports: [ExecutionModule], providers: [CronSchedulerService] })
export class SchedulerModule {}
