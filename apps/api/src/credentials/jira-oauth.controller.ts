import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AuthService } from "../auth/auth.service";
import { CredentialService } from "./credential.service";
import { JiraOAuthStateService } from "./jira-oauth-state.service";
import { exchangeJiraToken, identifyJiraAuthorization, jiraOAuthConfig, jiraScopes } from "./jira-oauth";
@Controller()
export class JiraOAuthController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService, @Inject(JiraOAuthStateService) private readonly states: JiraOAuthStateService, @Inject(AuthService) private readonly auth: AuthService) {}
  @Get("workspaces/:workspaceId/credentials/jira/connect")
  @UseGuards(AuthenticationGuard)
  async connect(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("credentialId") credentialId?: string, @Query("permissions") permissions?: string) {
    response.setHeader("Cache-Control", "no-store");
    const userId = request.currentUser?.id; if (!userId) throw new Error("Authentication required");
    await this.credentials.requireOwner(workspaceId, userId);
    if (credentialId !== undefined) { if (!/^[A-Za-z0-9_-]{1,128}$/.test(credentialId)) return failure(response, "invalid", workspaceId); await this.credentials.requireJiraReconnectTarget(workspaceId, userId, credentialId); }
    if (permissions !== undefined && permissions !== "events") return failure(response, "invalid", workspaceId);
    if (permissions === "events" && process.env.JIRA_WEBHOOK_AUTOMATION_ENABLED !== "true") return failure(response, "unavailable", workspaceId);
    try {
      const previousScopes = credentialId ? await this.credentials.jiraReconnectScopes(workspaceId, userId, credentialId) : [];
      const webhookAccess = permissions === "events" || previousScopes.includes("manage:jira-webhook");
      const config = jiraOAuthConfig(), issued = await this.states.issue({ workspaceId, userId, credentialId, webhookAccess }, request, response);
      const url = new URL("https://auth.atlassian.com/authorize");
      url.search = new URLSearchParams({ audience: "api.atlassian.com", client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", prompt: "consent", scope: webhookAccess ? `${jiraScopes} manage:jira-webhook` : jiraScopes, state: issued.state }).toString();
      return response.redirect(url.href);
    } catch { return failure(response, "unavailable", workspaceId); }
  }
  @Get("oauth/jira/callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Query("error") providerError: string | undefined, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer");
    let workspaceId: string | undefined;
    try {
      const session = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("workflow_session="))?.slice("workflow_session=".length);
      const user = await this.auth.getCurrentUser(session ? decodeURIComponent(session) : undefined);
      if (typeof state !== "string" || state.length > 4096) throw new Error("Invalid state");
      const { state: consumed } = await this.states.consume(state, request, response);
      if (consumed.userId !== user.id) throw new Error("Invalid state");
      workspaceId = consumed.workspaceId; await this.credentials.requireOwner(workspaceId, user.id);
      if (consumed.credentialId) await this.credentials.requireJiraReconnectTarget(workspaceId, user.id, consumed.credentialId);
      if (providerError) return failure(response, "denied", workspaceId);
      if (typeof code !== "string" || !code || code.length > 4096) return failure(response, "invalid", workspaceId);
      const authorization = await identifyJiraAuthorization(await exchangeJiraToken({ code }), consumed.webhookAccess === true);
      await this.credentials.saveJiraOAuth(workspaceId, user.id, authorization, consumed.credentialId);
      const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
      target.searchParams.set("workspace", workspaceId); target.searchParams.set("connected", "jira"); return response.redirect(target.href);
    } catch { return failure(response, "failed", workspaceId); }
  }
}
function failure(response: Response, reason: string, workspaceId?: string) {
  const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  target.searchParams.set("jira_oauth", reason); if (workspaceId) target.searchParams.set("workspace", workspaceId); return response.redirect(target.href);
}
