import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
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
  protected readonly getDraftJson = (url: string, token: string) => getGmailJson(url, token, fetchSafeOutbound);
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("labels")
  async labels(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GMAIL);
    const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
    let data: Record<string, unknown>;
    try { data = await this.getLabels(token); }
    catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
    if (data.labels !== undefined && !Array.isArray(data.labels)) throw new BadRequestException({ code: "INVALID_RESPONSE", message: "Gmail returned an invalid label list." });
    const all = Array.isArray(data.labels) ? data.labels : [];
    const labels = all.slice(0, 100).flatMap((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const label = value as Record<string, unknown>;
      if (typeof label.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(label.id) || (token && label.id.includes(token))) return [];
      // Redact before truncating so a token straddling the 200-character
      // boundary cannot be returned partially through the resource picker.
      const name = typeof label.name === "string" ? (token ? label.name.split(token).join("[REDACTED]") : label.name).trim() : "";
      return [{ id: label.id, name: name ? name.slice(0, 200) : label.id }];
    });
    return { labels, hasMore: all.length > 100 };
  }

  @Get("drafts")
  async drafts(@Param("workspaceId") workspaceId: string, @Param("credentialId") credentialId: string, @Req() request: AuthenticatedRequest, @Query("pageToken") pageToken?: string) {
    if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
    if (pageToken !== undefined && !/^[\x21-\x7e]{1,1024}$/.test(pageToken)) throw new BadRequestException({ code: "INVALID_INPUT", message: "Invalid Gmail page token." });
    await this.credentials.requireOwner(workspaceId, request.currentUser.id);
    const credential = await this.credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GMAIL);
    const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
    if (!token || (pageToken && pageToken.includes(token))) throw new BadRequestException({ code: "INVALID_INPUT", message: "Invalid Gmail connection or page token." });
    const params = new URLSearchParams({ maxResults: "10" });
    if (pageToken) params.set("pageToken", pageToken);
    let list: Record<string, unknown>;
    try { list = await this.getDraftJson(`https://gmail.googleapis.com/gmail/v1/users/me/drafts?${params}`, token); }
    catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
    if (list.drafts !== undefined && !Array.isArray(list.drafts)) throw new BadRequestException({ code: "INVALID_RESPONSE", message: "Gmail returned an invalid draft list." });
    const refs = (Array.isArray(list.drafts) ? list.drafts : []).slice(0, 10).flatMap((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const id = (value as Record<string, unknown>).id;
      return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) && !id.includes(token) ? [id] : [];
    });
    let partial = false;
    const drafts = await Promise.all(refs.map(async (id: string) => {
      try {
        const result = await this.getDraftJson(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(id)}?format=metadata`, token);
        if (result.id !== id || !result.message || typeof result.message !== "object" || Array.isArray(result.message)) throw new Error();
        const message = result.message as Record<string, unknown>;
        const payload = message.payload && typeof message.payload === "object" && !Array.isArray(message.payload) ? message.payload as Record<string, unknown> : {};
        const headers = Array.isArray(payload.headers) ? payload.headers.slice(0, 200) : [];
        const subject = headers.find((header: unknown) => header && typeof header === "object" && !Array.isArray(header) && typeof (header as Record<string, unknown>).name === "string" && String((header as Record<string, unknown>).name).toLowerCase() === "subject") as Record<string, unknown> | undefined;
        const safe = typeof subject?.value === "string" ? subject.value.split(token).join("[REDACTED]").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 120) : "";
        return { id, name: `${safe || "Untitled draft"} · ${id}` };
      } catch { partial = true; return { id, name: `Draft · ${id}` }; }
    }));
    const next = typeof list.nextPageToken === "string" && /^[\x21-\x7e]{1,1024}$/.test(list.nextPageToken) && !list.nextPageToken.includes(token) ? list.nextPageToken : null;
    return { drafts, nextPageToken: next, hasMore: Boolean(list.nextPageToken), ...(partial || (list.nextPageToken && !next) ? { warning: "Some draft details or the next page are unavailable. You can enter a draft ID manually." } : {}) };
  }
}
