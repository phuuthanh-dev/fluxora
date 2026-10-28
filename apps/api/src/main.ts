import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./platform/api-exception.filter";
import { validateEnvironment } from "./platform/environment";

async function bootstrap() {
  validateEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.useSecurityHeaders();
  if (process.env.TRUST_PROXY === "true") app.set("trust proxy", "loopback");
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true });
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
