import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { GitHubResourceService } from "./github-resource.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/github")
@UseGuards(AuthenticationGuard)
export class GitHubResourceController {
  constructor(@Inject(GitHubResourceService) private readonly resources: GitHubResourceService) {}

  @Get("repositories")
  async repositories(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("page") page?: string, @Query("owner") owner?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    if (page !== undefined && (!/^[1-9]\d{0,3}$/.test(page) || Number(page) > 1000)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Page must be between 1 and 1000." });
    if (owner !== undefined && !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(owner.trim())) throw new BadRequestException({ code: "INVALID_INPUT", message: "Repository owner must be a valid GitHub login." });
    return this.resources.listRepositories(workspaceId, credentialId, request.currentUser.id, page === undefined ? 1 : Number(page), owner);
  }
}
