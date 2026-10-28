import { Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { GitHubResourceService } from "./github-resource.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/github")
@UseGuards(AuthenticationGuard)
export class GitHubResourceController {
  constructor(@Inject(GitHubResourceService) private readonly resources: GitHubResourceService) {}

  @Get("repositories")
  async repositories(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    return this.resources.listRepositories(workspaceId, credentialId, request.currentUser.id);
  }
}
