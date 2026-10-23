import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthenticationGuard } from "./authentication.guard";
import { AuthService } from "./auth.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthenticationGuard],
  exports: [AuthService, AuthenticationGuard],
})
export class AuthModule {}
