import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CredentialModule } from "../credentials/credential.module";
import { ExecutionController } from "./execution.controller";
import { ExecutionEventsService } from "./execution-events.service";
import { ExecutionQueueService } from "./execution-queue.service";
import { ExecutionService } from "./execution.service";

@Module({
  imports: [AuthModule, CredentialModule],
  controllers: [ExecutionController],
  providers: [ExecutionService, ExecutionQueueService, ExecutionEventsService],
  exports: [ExecutionService, ExecutionQueueService],
})
export class ExecutionModule {}
