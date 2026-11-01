import { BadRequestException, Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";
import { CredentialProvider } from "@prisma/client";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { getGmailJson } from "../execution/gmail-read";
import { NodeFailure } from "../execution/node-failure";
import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { CredentialService } from "./credential.service";

@Controller("workspaces/:workspaceId/credentials/:credentialId/gmail")
@UseGuards(AuthenticationGuard)
export class GmailResourceController {
  protected readonly getLabels = (token: string) => getGmailJson("https://gmail.googleapis.com/gmail/v1/users/me/labels", token, fetchSafeOutbound);
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("labels")
  async labels(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GMAIL);
    let data: Record<string, unknown>;
    try { data = await this.getLabels(typeof credential.accessToken === "string" ? credential.accessToken : ""); }
    catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
    if (data.labels !== undefined && !Array.isArray(data.labels)) throw new BadRequestException({ code: "INVALID_RESPONSE", message: "Gmail returned an invalid label list." });
    const all = Array.isArray(data.labels) ? data.labels : [];
    const labels = all.slice(0, 100).flatMap((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const label = value as Record<string, unknown>;
      if (typeof label.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(label.id)) return [];
      return [{ id: label.id, name: typeof label.name === "string" && label.name.trim() ? label.name.slice(0, 200) : label.id }];
    });
    return { labels, hasMore: all.length > 100 };
  }
}
