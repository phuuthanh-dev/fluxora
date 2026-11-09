import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import { AuthenticationGuard } from "../auth/authentication.guard";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { listSlackChannels } from "../execution/slack-oauth";
import { NodeFailure } from "../execution/node-failure";
import { CredentialService } from "./credential.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/slack")
@UseGuards(AuthenticationGuard)
export class SlackResourceController {
  protected readonly listChannels = listSlackChannels;
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("channels")
  async channels(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("cursor") cursor?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SLACK_OAUTH);
    try { return await this.listChannels(typeof credential.accessToken === "string" ? credential.accessToken : "", cursor); }
    catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
  }
}
