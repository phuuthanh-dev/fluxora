import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExecutionModule } from "../execution/execution.module";
import { SchedulerModule } from "../scheduler/scheduler.module";
import { WorkspaceModule } from "../workspaces/workspace.module";
import { WorkflowController } from "./workflow.controller";
import { WorkflowService } from "./workflow.service";

@Module({
  imports: [AuthModule, ExecutionModule, WorkspaceModule, SchedulerModule],
  controllers: [WorkflowController],
  providers: [WorkflowService],
})
export class WorkflowModule {}
