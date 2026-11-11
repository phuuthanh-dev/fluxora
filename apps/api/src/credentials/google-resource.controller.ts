import { BadRequestException, Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { GoogleResourceService } from "./google-resource.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/google")
@UseGuards(AuthenticationGuard)
export class GoogleResourceController {
  constructor(@Inject(GoogleResourceService) private readonly resources: GoogleResourceService) {}

  @Get("files")
  @Header("Cache-Control", "no-store")
  async files(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("kind") kind?: string, @Query("pageToken") pageToken?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    if (kind !== undefined && kind !== "file" && kind !== "spreadsheet" && kind !== "folder" && kind !== "all") throw new BadRequestException({ code: "INVALID_INPUT", message: "Unsupported file type." });
    if (pageToken !== undefined && (pageToken.length > 2048 || !/^[\x21-\x7e]+$/.test(pageToken))) throw new BadRequestException({ code: "INVALID_INPUT", message: "Invalid page token." });
    return this.resources.listFiles(workspaceId, credentialId, request.currentUser.id, kind === "spreadsheet" || kind === "folder" || kind === "all" ? kind : "file", pageToken);
  }

  @Get("sheets/tabs")
  @Header("Cache-Control", "no-store")
  async tabs(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("spreadsheetId") spreadsheetId?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    return this.resources.listSheetTabs(workspaceId, credentialId, request.currentUser.id, spreadsheetId);
  }

  @Get("sheets/headers")
  @Header("Cache-Control", "no-store")
  async headers(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("spreadsheetId") spreadsheetId?: string, @Query("sheet") sheet?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    return this.resources.getSheetHeaders(workspaceId, credentialId, request.currentUser.id, spreadsheetId, sheet);
  }
}
