import { BadRequestException, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";

@Controller("approvals")
@UseGuards(AuthenticationGuard)
export class ApprovalController {
  constructor(@Inject(ExecutionService) private readonly executions: ExecutionService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {}

  @Get(":approvalId")
  async get(@Param("approvalId") approvalId: string, @Req() request: AuthenticatedRequest) {
    return { approval: await this.executions.getApproval(approvalId, userId(request)) };
  }

  @Post(":approvalId/resolve")
  async resolve(@Param("approvalId") approvalId: string, @Req() request: AuthenticatedRequest) {
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const decision = body.decision;
    if (decision !== "approved" && decision !== "rejected") throw new BadRequestException({ code: "INVALID_INPUT", message: "Decision must be approved or rejected." });
    const result = await this.executions.resolveApproval(approvalId, userId(request), decision);
    let dispatchStatus: "not_required" | "submitted" | "unconfirmed" = "not_required";
    if (result.resumed) {
      try {
        if (!result.resumeToken) throw new Error("Missing continuation phase");
        await this.queue.ensureDispatched({ executionId: result.executionId, mode: result.mode, resumeToken: result.resumeToken });
        dispatchStatus = "submitted";
      } catch {
        // The approval is already committed. Redis may have accepted the job
        // despite an error, and inline execution may also have started; never
        // claim it failed or ask the owner to submit the decision again.
        dispatchStatus = "unconfirmed";
      }
    }
    return { approval: { id: approvalId, decision, executionId: result.executionId, resumed: result.resumed, dispatchStatus } };
  }
}

function userId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}
