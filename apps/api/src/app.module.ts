import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [ConfigModule.forRoot({ envFilePath: resolve(__dirname, "../../../.env"), isGlobal: true }), PrismaModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
