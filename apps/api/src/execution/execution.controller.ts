import { BadRequestException, Controller, Delete, Get, Inject, Param, Post, Query, Req, Sse, UseGuards } from "@nestjs/common";
import { from, switchMap } from "rxjs";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { ExecutionService, type ExecutionTriageFilter } from "./execution.service";
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
    const debugNodeId = typeof body.nodeId === "string" && body.nodeId.trim() ? body.nodeId.trim() : undefined;
    if (!mock && body.confirmLive !== true) throw new BadRequestException({ code: "LIVE_CONFIRMATION_REQUIRED", message: "Confirm live execution before running providers." });
    if (debugNodeId && !mock) throw new BadRequestException({ code: "NODE_DEBUG_MOCK_ONLY", message: "Node debug is available only as a safe mock run." });
    const execution = debugNodeId
      ? await this.executions.createManualExecution(workflowId, requireUserId(request), mock, body.triggerData ?? {}, debugNodeId)
      : await this.executions.createManualExecution(workflowId, requireUserId(request), mock, body.triggerData ?? {});
    await this.queue.dispatch({ executionId: execution.id, mode: mock ? "mock" : "live", ...(debugNodeId ? { debugNodeId } : {}) });
    return { execution: await this.executions.get(execution.id, requireUserId(request)) };
  }

  @Get("executions/:executionId")
  async get(@Param("executionId") executionId: string, @Req() request: AuthenticatedRequest) {
    return { execution: await this.executions.get(executionId, requireUserId(request)) };
  }

  @Get("executions/:executionId/diagnostic")
  async diagnostic(@Param("executionId") executionId: string, @Req() request: AuthenticatedRequest) {
    return { diagnostic: await this.executions.getDiagnostic(executionId, requireUserId(request)) };
  }

  @Post("executions/:executionId/retry")
  async retry(@Param("executionId") executionId: string, @Req() request: AuthenticatedRequest) {
    const userId = requireUserId(request);
    const source = await this.executions.get(executionId, userId);
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    if (source.mode === "live" && body.confirmLive !== true) throw new BadRequestException({ code: "LIVE_RETRY_CONFIRMATION_REQUIRED", message: "Confirm the live retry before calling providers again." });
    const execution = await this.executions.retry(executionId, userId);
    await this.queue.dispatch({ executionId: execution.id, mode: execution.mode === "LIVE" ? "live" : "mock" });
    return { execution: await this.executions.get(execution.id, userId) };
  }

  @Get("workspaces/:workspaceId/executions")
  async listForWorkspace(@Param("workspaceId") workspaceId: string, @Query("cursor") cursor: string | undefined, @Query("limit") limit: string | undefined, @Req() request: AuthenticatedRequest, @Query("filter") filter?: string) {
    const selectedFilter = readExecutionFilter(filter);
    const page = selectedFilter === "ALL" ? await this.executions.listForWorkspace(workspaceId, requireUserId(request), readExecutionLimit(limit), cursor) : await this.executions.listForWorkspace(workspaceId, requireUserId(request), readExecutionLimit(limit), cursor, selectedFilter);
    return page;
  }

  @Get("workspaces/:workspaceId/execution-activity")
  async activityForWorkspace(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    return { activity: await this.executions.activityForWorkspace(workspaceId, requireUserId(request)) };
  }

  @Get("workspaces/:workspaceId/execution-retention")
  async retention(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    return { retention: await this.executions.retentionForWorkspace(workspaceId, requireUserId(request)) };
  }

  @Get("workspaces/:workspaceId/execution-views")
  async savedViews(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    return { views: await this.executions.savedViews(workspaceId, requireUserId(request)) };
  }

  @Post("workspaces/:workspaceId/execution-views")
  async createSavedView(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) throw new BadRequestException({ code: "INVALID_INPUT", message: "View name must contain 1 to 80 characters." });
    if (typeof body.filter !== "string") throw new BadRequestException({ code: "INVALID_FILTER", message: "Select an execution filter." });
    return { view: await this.executions.createSavedView(workspaceId, requireUserId(request), body.name.trim(), readExecutionFilter(body.filter)) };
  }

  @Delete("workspaces/:workspaceId/execution-views/:viewId")
  async deleteSavedView(@Param("workspaceId") workspaceId: string, @Param("viewId") viewId: string, @Req() request: AuthenticatedRequest) {
    return this.executions.deleteSavedView(workspaceId, requireUserId(request), viewId);
  }

  @Get("workflows/:workflowId/live-readiness")
  async liveReadiness(@Param("workflowId") workflowId: string, @Req() request: AuthenticatedRequest) {
    return { readiness: await this.executions.getLiveReadiness(workflowId, requireUserId(request)) };
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

function readExecutionFilter(value: string | undefined): ExecutionTriageFilter {
  if (!value || value === "ALL") return "ALL";
  if (value === "ATTENTION" || value === "IN_PROGRESS" || value === "FAILED" || value === "SUCCEEDED") return value;
  throw new BadRequestException({ code: "INVALID_FILTER", message: "Execution filter is not supported." });
}

function requireUserId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}

function readExecutionLimit(value: string | undefined) {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) throw new BadRequestException({ code: "INVALID_LIMIT", message: "Execution limit must be an integer between 1 and 50." });
  return parsed;
}
