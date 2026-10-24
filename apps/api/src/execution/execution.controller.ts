import { BadRequestException, Controller, Get, Inject, Param, Post, Req, Sse, UseGuards } from "@nestjs/common";
import { from, switchMap } from "rxjs";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { ExecutionService } from "./execution.service";
import { ExecutionQueueService } from "./execution-queue.service";
import { ExecutionEventsService } from "./execution-events.service";

@Controller()
@UseGuards(AuthenticationGuard)
export class ExecutionController {
  constructor(@Inject(ExecutionService) private readonly executions: ExecutionService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService, @Inject(ExecutionEventsService) private readonly events: ExecutionEventsService) {}

  @Post("workflows/:workflowId/executions")
  async startManual(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const mock = body.mock !== false;
    if (!mock && body.confirmLive !== true) throw new BadRequestException({ code: "LIVE_CONFIRMATION_REQUIRED", message: "Confirm live execution before running providers." });
    const execution = await this.executions.createManualExecution(workflowId, requireUserId(request), mock, body.triggerData ?? {});
    await this.queue.dispatch({ executionId: execution.id, mode: mock ? "mock" : "live" });
    return { execution: await this.executions.get(execution.id, requireUserId(request)) };
  }

  @Get("executions/:executionId")
  async get(@Param("executionId") executionId: string, @Req() request: AuthenticatedRequest) {
    return { execution: await this.executions.get(executionId, requireUserId(request)) };
  }

  @Post("executions/:executionId/cancel")
  async cancel(@Param("executionId") executionId: string, @Req() request: AuthenticatedRequest) {
    return { execution: await this.executions.cancel(executionId, requireUserId(request)) };
  }

  @Sse("executions/:executionId/events")
  eventsForExecution(@Param("executionId") executionId: string, @Req() request: AuthenticatedRequest) {
    return from(this.executions.get(executionId, requireUserId(request))).pipe(switchMap(() => this.events.stream(executionId)));
  }
}

function requireUserId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}
