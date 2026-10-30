import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { AuthenticationGuard } from "./authentication.guard";
import { AuthService } from "./auth.service";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { AccountMailService } from "./account-mail.service";
import { AccountRequestGuard } from "./account-request.guard";
import { CredentialVaultService } from "../credentials/credential-vault.service";

@Module({
  controllers: [AuthController, AccountController],
  providers: [AuthService, AuthenticationGuard, AuthRateLimitGuard, AccountService, AccountMailService, AccountRequestGuard, CredentialVaultService],
  exports: [AuthService, AuthenticationGuard],
})
export class AuthModule {}
