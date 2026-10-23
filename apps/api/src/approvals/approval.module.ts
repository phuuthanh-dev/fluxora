import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExecutionModule } from "../execution/execution.module";
import { ApprovalController } from "./approval.controller";

@Module({ imports: [AuthModule, ExecutionModule], controllers: [ApprovalController] })
export class ApprovalModule {}
