import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AuthService } from "../auth/auth.service";
import { readBoundedProviderJson } from "../execution/provider-json";
import { CredentialService } from "./credential.service";
import { SlackOAuthStateService } from "./slack-oauth-state.service";

@Controller()
export class SlackOAuthController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService, @Inject(SlackOAuthStateService) private readonly states: SlackOAuthStateService, @Inject(AuthService) private readonly auth: AuthService) {}

  @Get("workspaces/:workspaceId/credentials/slack/connect")
  @UseGuards(AuthenticationGuard)
  async connect(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("credentialId") credentialId?: string, @Query("permissions") permissions?: string) {
    response.setHeader("Cache-Control", "no-store");
    const userId = request.currentUser?.id;
    if (!userId) throw new Error("Authentication guard did not attach a user.");
    await this.credentials.requireOwner(workspaceId, userId);
    if (credentialId !== undefined) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(credentialId)) return failure(response, "invalid", workspaceId);
      await this.credentials.requireSlackReconnectTarget(workspaceId, userId, credentialId);
    }
    if (permissions !== undefined && permissions !== "events") return failure(response, "invalid", workspaceId);
    try {
      const clientId = env("SLACK_CLIENT_ID"); const redirectUri = slackRedirectUri();
      const issued = await this.states.issue({ workspaceId, userId, credentialId, eventAccess: permissions === "events" }, request, response);
      const url = new URL("https://slack.com/oauth/v2/authorize");
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: permissions === "events" ? "channels:read,chat:write,channels:history,app_mentions:read" : "channels:read,chat:write", state: issued.state }).toString();
      return response.redirect(url.toString());
    } catch { return failure(response, "unavailable", workspaceId); }
  }

  @Get("oauth/slack/callback")
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
      if (consumed.credentialId) await this.credentials.requireSlackReconnectTarget(workspaceId, user.id, consumed.credentialId);
      if (providerError) return failure(response, "denied", workspaceId);
      if (typeof code !== "string" || !code || code.length > 4096) return failure(response, "invalid", workspaceId);
      const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", { method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env("SLACK_CLIENT_ID"), client_secret: env("SLACK_CLIENT_SECRET"), redirect_uri: slackRedirectUri() }), signal: AbortSignal.timeout(20_000) });
      if (!tokenResponse.ok) return failure(response, "token_failed", workspaceId);
      const raw = await readBoundedProviderJson(tokenResponse);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return failure(response, "token_failed", workspaceId);
      const data = raw as Record<string, unknown>; const team = data.team && typeof data.team === "object" && !Array.isArray(data.team) ? data.team as Record<string, unknown> : {};
      if (data.refresh_token !== undefined || data.expires_in !== undefined) return failure(response, "rotation_unsupported", workspaceId);
      if (data.is_enterprise_install === true || typeof data.app_id !== "string" || !/^[A-Z][A-Z0-9]{2,63}$/.test(data.app_id) || (process.env.SLACK_APP_ID && data.app_id !== process.env.SLACK_APP_ID)) return failure(response, "token_failed", workspaceId);
      const scopes = typeof data.scope === "string" ? new Set(data.scope.split(",")) : new Set<string>();
      if (data.ok !== true || typeof data.access_token !== "string" || typeof team.id !== "string" || typeof team.name !== "string" || !scopes.has("channels:read") || !scopes.has("chat:write")) return failure(response, "token_failed", workspaceId);
      if (consumed.eventAccess && (!scopes.has("channels:history") || !scopes.has("app_mentions:read"))) return failure(response, "token_failed", workspaceId);
      await this.credentials.saveSlackOAuth(workspaceId, user.id, { accessToken: data.access_token, appId: data.app_id, teamId: team.id, teamName: team.name, grantedScopes: [...scopes] }, consumed.credentialId);
      const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000"); target.searchParams.set("workspace", workspaceId); target.searchParams.set("connected", "slack");
      return response.redirect(target.toString());
    } catch { return failure(response, "failed", workspaceId); }
  }
}

function env(name: "SLACK_CLIENT_ID" | "SLACK_CLIENT_SECRET" | "SLACK_REDIRECT_URI") {
  const value = process.env[name];
  if (!value || value.length > 4096 || /\s/.test(value)) throw new Error("Slack OAuth is not configured");
  return value;
}
function slackRedirectUri() {
  const url = new URL(env("SLACK_REDIRECT_URI"));
  if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || url.protocol === "http:" && url.hostname === "localhost")) throw new Error("Invalid Slack callback");
  return url.href;
}
function failure(response: Response, reason: string, workspaceId?: string) {
  const target = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  target.searchParams.set("slack_oauth", reason); if (workspaceId) target.searchParams.set("workspace", workspaceId);
  return response.redirect(target.toString());
}
