import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { RuntimeHealthService } from "./platform/runtime-health.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(RuntimeHealthService) private readonly health: RuntimeHealthService) {}

  @Get()
  getHealth() {
    return {
      service: "workflow-api",
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness(@Res({ passthrough: true }) response: Response) {
    const readiness = await this.health.readiness();
    if (readiness.status !== "ready") response.status(503);
    return readiness;
  }
}
