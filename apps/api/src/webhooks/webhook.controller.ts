import { BadRequestException, Controller, Get, Headers, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { WebhookService } from "./webhook.service";

@Controller()
export class WebhookController {
  constructor(@Inject(WebhookService) private readonly webhooks: WebhookService) {}

  @Get("workflows/:workflowId/webhook-endpoint")
  @UseGuards(AuthenticationGuard)
  async get(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { endpoint: await this.webhooks.getEndpoint(workflowId, userId(request)) };
  }

  @Post("workflows/:workflowId/webhook-endpoint")
  @UseGuards(AuthenticationGuard)
  async create(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    const body = readObject(request.body);
    const path = readPath(body.path);
    const secretRequired = body.secretRequired !== false;
    return { endpoint: await this.webhooks.createEndpoint(workflowId, userId(request), path, secretRequired) };
  }

  @Post("webhooks/:path")
  async receive(@Param("path") path: string, @Headers("x-workflow-secret") secret: string | undefined, @Req() request: AuthenticatedRequest) {
    return this.webhooks.receive(path, secret, request.body);
  }
}

function userId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_INPUT", message: "A JSON object is required." });
  return value as Record<string, unknown>;
}

function readPath(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{2,80}$/i.test(value)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Webhook path must be 3–81 letters, numbers, or hyphens." });
  return value;
}
