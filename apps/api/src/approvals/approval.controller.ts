import { BadRequestException, Controller, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";

@Controller("approvals")
@UseGuards(AuthenticationGuard)
export class ApprovalController {
  constructor(@Inject(ExecutionService) private readonly executions: ExecutionService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {}

  @Post(":approvalId/resolve")
  async resolve(@Param("approvalId") approvalId: string, @Req() request: AuthenticatedRequest) {
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const decision = body.decision;
    if (decision !== "approved" && decision !== "rejected") throw new BadRequestException({ code: "INVALID_INPUT", message: "Decision must be approved or rejected." });
    const result = await this.executions.resolveApproval(approvalId, userId(request), decision);
    if (result.resumed) await this.queue.dispatch({ executionId: result.executionId, mode: result.mode, startNodeIds: result.startNodeIds });
    return { approval: { id: approvalId, decision, executionId: result.executionId, resumed: result.resumed } };
  }
}

function userId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}
