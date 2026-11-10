import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AuthService } from "../auth/auth.service";
import { CredentialService } from "./credential.service";
import { NotionOAuthStateService } from "./notion-oauth-state.service";
import { exchangeNotionToken, notionOAuthConfig } from "./notion-oauth";

@Controller()
export class NotionOAuthController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService, @Inject(NotionOAuthStateService) private readonly states: NotionOAuthStateService, @Inject(AuthService) private readonly auth: AuthService) {}

  @Get("workspaces/:workspaceId/credentials/notion/connect")
  @UseGuards(AuthenticationGuard)
  async connect(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("credentialId") credentialId?: string) {
    response.setHeader("Cache-Control", "no-store");
    const userId = request.currentUser?.id;
    if (!userId) throw new Error("Authentication required");
    await this.credentials.requireOwner(workspaceId, userId);
    if (credentialId !== undefined) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(credentialId)) return failure(response, "invalid", workspaceId);
      await this.credentials.requireNotionReconnectTarget(workspaceId, userId, credentialId);
    }
    try {
      const config = notionOAuthConfig();
      const issued = await this.states.issue({ workspaceId, userId, credentialId }, request, response);
      const url = new URL("https://api.notion.com/v1/oauth/authorize");
      url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", owner: "user", state: issued.state }).toString();
      return response.redirect(url.href);
    } catch { return failure(response, "unavailable", workspaceId); }
  }

  @Get("oauth/notion/callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Query("error") providerError: string | undefined, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    let workspaceId: string | undefined;
    try {
      const session = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("workflow_session="))?.slice("workflow_session=".length);
      const user = await this.auth.getCurrentUser(session ? decodeURIComponent(session) : undefined);
      if (typeof state !== "string" || state.length > 4096) throw new Error("Invalid state");
      const { state: consumed } = await this.states.consume(state, request, response);
      if (consumed.userId !== user.id) throw new Error("Invalid state");
      workspaceId = consumed.workspaceId;
      await this.credentials.requireOwner(workspaceId, user.id);
      if (consumed.credentialId) await this.credentials.requireNotionReconnectTarget(workspaceId, user.id, consumed.credentialId);
      if (providerError) return failure(response, "denied", workspaceId);
      if (typeof code !== "string" || !code || code.length > 4096) return failure(response, "invalid", workspaceId);
      const data = await exchangeNotionToken({ code });
      await this.credentials.saveNotionOAuth(workspaceId, user.id, data, consumed.credentialId);
      const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
      target.searchParams.set("workspace", workspaceId); target.searchParams.set("connected", "notion");
      return response.redirect(target.href);
    } catch { return failure(response, "failed", workspaceId); }
  }
}
function failure(response: Response, reason: string, workspaceId?: string) {
  const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  target.searchParams.set("notion_oauth", reason); if (workspaceId) target.searchParams.set("workspace", workspaceId);
  return response.redirect(target.href);
}
