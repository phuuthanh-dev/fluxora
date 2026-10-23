import { Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { ExecutionService } from "./execution.service";
import { ExecutionQueueService } from "./execution-queue.service";

@Controller()
@UseGuards(AuthenticationGuard)
export class ExecutionController {
  constructor(@Inject(ExecutionService) private readonly executions: ExecutionService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {}

  @Post("workflows/:workflowId/executions")
  async startManual(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const mock = body.mock !== false;
    const execution = await this.executions.createManualExecution(workflowId, requireUserId(request), mock, body.triggerData ?? {});
    await this.queue.dispatch({ executionId: execution.id, mode: mock ? "mock" : "live" });
    return { execution: await this.executions.get(execution.id, requireUserId(request)) };
  }

  @Get("executions/:executionId")
  async get(@Param("executionId") executionId: string, @Req() request: AuthenticatedRequest) {
    return { execution: await this.executions.get(executionId, requireUserId(request)) };
  }
}

function requireUserId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}
