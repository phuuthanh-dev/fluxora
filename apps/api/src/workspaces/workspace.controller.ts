import { BadRequestException, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { WorkspaceService } from "./workspace.service";

@Controller("workspaces")
@UseGuards(AuthenticationGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private readonly workspaces: WorkspaceService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return { workspaces: await this.workspaces.listForUser(requireUserId(request)) };
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest) {
    const name = readName(request.body);
    return { workspace: await this.workspaces.createForOwner(requireUserId(request), name) };
  }
}

function requireUserId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}

function readName(value: unknown) {
  const name = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).name : undefined;
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
    throw new BadRequestException({ code: "INVALID_INPUT", message: "Workspace name must be between 1 and 80 characters." });
  }
  return name.trim();
}
