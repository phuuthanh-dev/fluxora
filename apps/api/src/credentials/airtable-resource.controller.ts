import { BadRequestException, Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { AuthenticationGuard } from "../auth/authentication.guard";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { airtableResources } from "../execution/airtable";
import { CredentialService } from "./credential.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/airtable")
@UseGuards(AuthenticationGuard)
export class AirtableResourceController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("bases")
  @Header("Cache-Control", "no-store")
  async bases(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication required");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const token = await this.credentials.airtableAccessToken(credentialId, workspaceId);
    try { return await airtableResources(token, "bases"); }
    catch { throw new BadRequestException({ code: "AIRTABLE_BASES_UNAVAILABLE", message: "Bases could not be loaded. Check Airtable access and connection." }); }
  }

  @Get("tables")
  @Header("Cache-Control", "no-store")
  async tables(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Query("baseId") baseId: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication required");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const token = await this.credentials.airtableAccessToken(credentialId, workspaceId);
    try { return await airtableResources(token, "tables", baseId); }
    catch { throw new BadRequestException({ code: "AIRTABLE_TABLES_UNAVAILABLE", message: "Tables could not be loaded. Check Airtable base access and connection." }); }
  }

  @Get(":kind")
  @Header("Cache-Control", "no-store")
  async children(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Param("kind") kind: string, @Query("baseId") baseId: string | undefined, @Query("tableId") tableId: string | undefined, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication required");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    if (kind !== "fields" && kind !== "records") throw new BadRequestException({ code: "INVALID_INPUT", message: "Choose a supported Airtable resource." });
    const token = await this.credentials.airtableAccessToken(credentialId, workspaceId);
    try { return await airtableResources(token, kind, baseId, tableId); }
    catch { throw new BadRequestException({ code: "AIRTABLE_RESOURCES_UNAVAILABLE", message: "Resources could not be loaded. Check Airtable access and connection." }); }
  }
}
