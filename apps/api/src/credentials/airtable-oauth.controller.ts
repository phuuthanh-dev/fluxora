import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AuthService } from "../auth/auth.service";
import { CredentialService } from "./credential.service";
import { AirtableOAuthStateService } from "./airtable-oauth-state.service";
import { airtableOAuthConfig, exchangeAirtableToken, identifyAirtable } from "./airtable-oauth";

@Controller()
export class AirtableOAuthController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService, @Inject(AirtableOAuthStateService) private readonly states: AirtableOAuthStateService, @Inject(AuthService) private readonly auth: AuthService) {}

  @Get("workspaces/:workspaceId/credentials/airtable/connect")
  @UseGuards(AuthenticationGuard)
  async connect(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("credentialId") credentialId?: string) {
    response.setHeader("Cache-Control", "no-store");
    const userId = request.currentUser?.id; if (!userId) throw new Error("Authentication required");
    await this.credentials.requireOwner(workspaceId, userId);
    if (credentialId !== undefined) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(credentialId)) return failure(response, "invalid", workspaceId);
      await this.credentials.requireAirtableReconnectTarget(workspaceId, userId, credentialId);
    }
    try {
      const config = airtableOAuthConfig();
      const issued = await this.states.issue({ workspaceId, userId, credentialId }, request, response);
      const url = new URL("https://airtable.com/oauth2/v1/authorize");
      url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "data.records:read data.records:write schema.bases:read", state: issued.state, code_challenge: issued.challenge, code_challenge_method: "S256" }).toString();
      return response.redirect(url.href);
    } catch { return failure(response, "unavailable", workspaceId); }
  }

  @Get("oauth/airtable/callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Query("error") providerError: string | undefined, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    let workspaceId: string | undefined;
    try {
      const session = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("workflow_session="))?.slice("workflow_session=".length);
      const user = await this.auth.getCurrentUser(session ? decodeURIComponent(session) : undefined);
      if (typeof state !== "string" || state.length > 4096) throw new Error("Invalid state");
      const { state: consumed, verifier } = await this.states.consume(state, request, response);
      if (consumed.userId !== user.id) throw new Error("Invalid state");
      workspaceId = consumed.workspaceId; await this.credentials.requireOwner(workspaceId, user.id);
      if (consumed.credentialId) await this.credentials.requireAirtableReconnectTarget(workspaceId, user.id, consumed.credentialId);
      if (providerError) return failure(response, "denied", workspaceId);
      if (typeof code !== "string" || !code || code.length > 4096) return failure(response, "invalid", workspaceId);
      const token = await exchangeAirtableToken({ code, verifier });
      const airtableUserId = await identifyAirtable(token.accessToken);
      await this.credentials.saveAirtableOAuth(workspaceId, user.id, { ...token, airtableUserId, authType: "oauth" }, consumed.credentialId);
      const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
      target.searchParams.set("workspace", workspaceId); target.searchParams.set("connected", "airtable"); return response.redirect(target.href);
    } catch { return failure(response, "failed", workspaceId); }
  }
}
function failure(response: Response, reason: string, workspaceId?: string) {
  const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  target.searchParams.set("airtable_oauth", reason); if (workspaceId) target.searchParams.set("workspace", workspaceId); return response.redirect(target.href);
}
