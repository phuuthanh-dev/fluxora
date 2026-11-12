import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountRequestGuard } from "../auth/account-request.guard";
import { WorkspaceModule } from "../workspaces/workspace.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({ imports: [AuthModule, WorkspaceModule], controllers: [BillingController], providers: [BillingService, AccountRequestGuard] })
export class BillingModule {}
