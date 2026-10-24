import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { AuthenticationGuard } from "./authentication.guard";
import { AuthService } from "./auth.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthenticationGuard, AuthRateLimitGuard],
  exports: [AuthService, AuthenticationGuard],
})
export class AuthModule {}
