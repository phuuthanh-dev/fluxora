import { BadRequestException, Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AuthService } from "../auth/auth.service";
import { CredentialService } from "./credential.service";
import { GoogleOAuthStateService, GoogleOAuthStateUnavailableError } from "./google-oauth-state.service";
import { chatManageScope, googleAccount, googleConnectionPolicy, googleScopesGranted, googleScopeTokenHash, gmailScopesForCapabilities, googleConnectionScopesGranted, validGmailCapabilities, type GmailCapability, type GoogleConnectionKind } from "./google-oauth-policy";

@Controller()
export class GoogleOAuthController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService, @Inject(GoogleOAuthStateService) private readonly states: GoogleOAuthStateService, @Inject(AuthService) private readonly auth: AuthService) {}

  @Get("workspaces/:workspaceId/credentials/google/connect")
  @UseGuards(AuthenticationGuard)
  async connect(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("credentialId") credentialId?: string) {
    return this.begin(workspaceId, request, response, "google", credentialId);
  }

  @Get("workspaces/:workspaceId/credentials/google-chat/connect")
  @UseGuards(AuthenticationGuard)
  async connectChat(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("credentialId") credentialId?: string, @Query("manage") manage?: string) {
    if (manage !== undefined && manage !== "1" && manage !== "0") throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Google Chat permissions are invalid." });
    return this.begin(workspaceId, request, response, "chat", credentialId, undefined, manage === "1");
  }

  @Get("workspaces/:workspaceId/credentials/gmail/connect")
  @UseGuards(AuthenticationGuard)
  async connectGmail(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("credentialId") credentialId?: string, @Query("capabilities") capabilities?: string) {
    if (capabilities !== undefined && (typeof capabilities !== "string" || capabilities.length > 100)) throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Gmail permissions are invalid." });
    const selected = capabilities === undefined ? ["readonly"] : capabilities.split(",");
    if (!validGmailCapabilities(selected)) throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Select valid Gmail permissions, including read access." });
    return this.begin(workspaceId, request, response, "gmail", credentialId, selected);
  }

  @Get("workspaces/:workspaceId/credentials/google-calendar/connect")
  @UseGuards(AuthenticationGuard)
  async connectCalendar(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("credentialId") credentialId?: string) {
    return this.begin(workspaceId, request, response, "calendar", credentialId);
  }

  private async begin(workspaceId: string, request: AuthenticatedRequest, response: Response, kind: GoogleConnectionKind, credentialId?: string, gmailCapabilities?: GmailCapability[], chatManage?: boolean) {
    response.setHeader("Cache-Control", "no-store");
    const userId = requireUserId(request);
    await this.credentials.requireOwner(workspaceId, userId);
    if (credentialId !== undefined && (typeof credentialId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(credentialId))) throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Google connection ID is invalid." });
    if (credentialId !== undefined) await this.credentials.requireGoogleReconnectTarget(workspaceId, userId, kind, credentialId);
    let issued: { state: string; challenge: string };
    let clientId: string;
    let redirectUri: string;
    try {
      clientId = requiredEnv("GOOGLE_CLIENT_ID");
      redirectUri = requiredEnv("GOOGLE_REDIRECT_URI");
      issued = await this.states.issue({ workspaceId, userId, kind, credentialId, gmailCapabilities, chatManage }, request, response);
    } catch (error) { return redirectFailure(response, error instanceof GoogleOAuthStateUnavailableError ? "redis_unavailable" : "failed", { workspaceId, kind, credentialId, gmailCapabilities, chatManage }); }
    const { state, challenge } = issued;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", code_challenge: challenge, code_challenge_method: "S256", scope: ["openid", "email", ...(kind === "gmail" ? gmailScopesForCapabilities(gmailCapabilities ?? ["readonly"]) : googleConnectionPolicy[kind].scopes), ...(kind === "chat" && chatManage ? [chatManageScope] : [])].join(" "), state }).toString();
    response.redirect(url.toString());
  }

  @Get("oauth/google/callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Req() request: AuthenticatedRequest, @Res() response: Response, @Query("error") providerError?: string) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    let verified: { workspaceId: string; userId: string; kind: GoogleConnectionKind; credentialId?: string; gmailCapabilities?: GmailCapability[]; chatManage?: boolean } | undefined;
    try {
      const rawSession = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("workflow_session="))?.slice("workflow_session=".length);
      const user = await this.auth.getCurrentUser(rawSession ? decodeURIComponent(rawSession) : undefined);
      if (typeof state !== "string" || state.length > 4096) throw new Error("Invalid state");
      const consumed = await this.states.consume(state, request, response);
      verified = consumed.state;
      if (verified.userId !== user.id) { verified = undefined; throw new Error("Invalid state"); }
      await this.credentials.requireOwner(verified.workspaceId, verified.userId);
      if (verified.credentialId) await this.credentials.requireGoogleReconnectTarget(verified.workspaceId, verified.userId, verified.kind, verified.credentialId);
      if (providerError) return redirectFailure(response, "denied", verified);
      if (typeof code !== "string" || !code || code.length > 4096) return redirectFailure(response, "invalid_state", verified);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, code_verifier: consumed.verifier, client_id: requiredEnv("GOOGLE_CLIENT_ID"), client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"), redirect_uri: requiredEnv("GOOGLE_REDIRECT_URI"), grant_type: "authorization_code" }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!tokenResponse.ok) return redirectFailure(response, "token_failed", verified);
      const tokens = await tokenResponse.json() as Record<string, unknown>;
      if (typeof tokens.access_token !== "string" || !/^\S+$/.test(tokens.access_token)) return redirectFailure(response, "token_failed", verified);
      if (typeof tokens.refresh_token !== "string" || !/^\S+$/.test(tokens.refresh_token)) return redirectFailure(response, "missing_refresh", verified);
      if (typeof tokens.expires_in !== "number" || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || !Number.isFinite(new Date(Date.now() + tokens.expires_in * 1000).getTime())) return redirectFailure(response, "token_failed", verified);
      const scopes = typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : [];
      if (!googleScopesGranted(scopes, ["openid"]) || !googleConnectionScopesGranted(verified.kind, scopes, verified.gmailCapabilities ?? ["readonly"])) return redirectFailure(response, "scope_missing", verified);
      if (verified.kind === "chat" && verified.chatManage && !googleScopesGranted(scopes, [chatManageScope])) return redirectFailure(response, "scope_missing", verified);
      const account = await googleAccount(tokens.access_token);
      if (!account) return redirectFailure(response, "identity_failed", verified);
      const data = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), googleSubject: account.sub, googleEmail: account.email, grantedScopes: scopes, scopeTokenHash: googleScopeTokenHash(tokens.access_token) };
      await this.credentials.saveGoogleOAuth(verified.workspaceId, verified.userId, verified.kind, data, verified.credentialId, verified.gmailCapabilities, verified.chatManage);
      const connected = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
      connected.searchParams.set("workspace", verified.workspaceId);
      connected.searchParams.set("connected", verified.kind === "chat" ? "google-chat" : verified.kind === "calendar" ? "google-calendar" : verified.kind);
      return response.redirect(connected.toString());
    } catch (error) {
      const detail = error instanceof BadRequestException ? error.getResponse() : undefined;
      const code = detail && typeof detail === "object" && "code" in detail ? detail.code : undefined;
      const reason = error instanceof GoogleOAuthStateUnavailableError ? "redis_unavailable" : code === "GOOGLE_OAUTH_ACCOUNT_MISMATCH" ? "account_mismatch" : code === "GOOGLE_OAUTH_LEGACY_IDENTITY_UNKNOWN" ? "legacy_identity_unknown" : code === "GOOGLE_CREDENTIAL_CHANGED" ? "changed" : verified ? "failed" : "invalid_state";
      return redirectFailure(response, reason, verified);
    }
  }

}

function requireUserId(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new Error("Authentication guard did not attach a user.");
  return request.currentUser.id;
}

function requiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI") {
  const value = process.env[name];
  if (!value) throw new BadRequestException({ code: "GOOGLE_OAUTH_NOT_CONFIGURED", message: `${name} is not configured.` });
  return value;
}

function redirectFailure(response: Response, reason: string, state?: { workspaceId: string; credentialId?: string; kind: GoogleConnectionKind; gmailCapabilities?: GmailCapability[]; chatManage?: boolean }) {
  const recovery = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  recovery.searchParams.set("google_oauth", reason);
  if (state) {
    recovery.searchParams.set("workspace", state.workspaceId);
    recovery.searchParams.set("kind", state.kind);
    if (state.credentialId) recovery.searchParams.set("credentialId", state.credentialId);
    if (state.kind === "gmail" && state.gmailCapabilities) recovery.searchParams.set("capabilities", state.gmailCapabilities.join(","));
    if (state.kind === "chat" && state.chatManage) recovery.searchParams.set("manage", "1");
  }
  return response.redirect(recovery.toString());
}
