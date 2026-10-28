import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { GoogleResourceService } from "./google-resource.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/google")
@UseGuards(AuthenticationGuard)
export class GoogleResourceController {
  constructor(@Inject(GoogleResourceService) private readonly resources: GoogleResourceService) {}

  @Get("files")
  async files(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("kind") kind?: string, @Query("pageToken") pageToken?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    if (kind !== undefined && kind !== "file" && kind !== "spreadsheet") throw new BadRequestException({ code: "INVALID_INPUT", message: "Unsupported file type." });
    if (pageToken !== undefined && (pageToken.length > 512 || !/^[\x21-\x7e]+$/.test(pageToken))) throw new BadRequestException({ code: "INVALID_INPUT", message: "Invalid page token." });
    return this.resources.listFiles(workspaceId, credentialId, request.currentUser.id, kind === "spreadsheet" ? "spreadsheet" : "file", pageToken);
  }
}
