import { BadRequestException, Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { CredentialService } from "./credential.service";

const googleScopes = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"];
const chatScopes = ["https://www.googleapis.com/auth/chat.messages.create", "https://www.googleapis.com/auth/chat.spaces.readonly"];
const gmailScopes = ["https://www.googleapis.com/auth/gmail.readonly"];
type GoogleConnectionKind = "google" | "chat" | "gmail";
const stateMaxAgeMs = 10 * 60_000;

@Controller()
export class GoogleOAuthController {
  constructor(@Inject(CredentialService) private readonly credentials: CredentialService) {}

  @Get("workspaces/:workspaceId/credentials/google/connect")
  @UseGuards(AuthenticationGuard)
  async connect(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    return this.begin(workspaceId, request, response, "google");
  }

  @Get("workspaces/:workspaceId/credentials/google-chat/connect")
  @UseGuards(AuthenticationGuard)
  async connectChat(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    return this.begin(workspaceId, request, response, "chat");
  }

  @Get("workspaces/:workspaceId/credentials/gmail/connect")
  @UseGuards(AuthenticationGuard)
  async connectGmail(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    return this.begin(workspaceId, request, response, "gmail");
  }

  private async begin(workspaceId: string, request: AuthenticatedRequest, response: Response, kind: GoogleConnectionKind) {
    const clientId = requiredEnv("GOOGLE_CLIENT_ID");
    const redirectUri = requiredEnv("GOOGLE_REDIRECT_URI");
    const userId = requireUserId(request);
    await this.credentials.requireOwner(workspaceId, userId);
    const state = signState({ workspaceId, userId, kind });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: kind === "google" ? "true" : "false", scope: (kind === "chat" ? chatScopes : kind === "gmail" ? gmailScopes : googleScopes).join(" "), state }).toString();
    response.redirect(url.toString());
  }

  @Get("oauth/google/callback")
  @UseGuards(AuthenticationGuard)
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    if (!code || !state) throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Google OAuth callback is missing code or state." });
    const verified = verifyState(state);
    if (verified.userId !== requireUserId(request)) throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Google OAuth state does not match this session." });
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: requiredEnv("GOOGLE_CLIENT_ID"), client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"), redirect_uri: requiredEnv("GOOGLE_REDIRECT_URI"), grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!tokenResponse.ok) throw new BadRequestException({ code: "GOOGLE_OAUTH_TOKEN_FAILED", message: "Google token exchange failed." });
    const tokens = await tokenResponse.json() as Record<string, unknown>;
    if (typeof tokens.access_token !== "string" || !/^\S+$/.test(tokens.access_token)) throw new BadRequestException({ code: "GOOGLE_OAUTH_TOKEN_FAILED", message: "Google did not return a usable access token." });
    if (typeof tokens.refresh_token !== "string" || !/^\S+$/.test(tokens.refresh_token)) {
      const recovery = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
      recovery.searchParams.set("workspace", verified.workspaceId);
      recovery.searchParams.set("google_oauth", verified.kind === "chat" ? "chat_missing_refresh" : verified.kind === "gmail" ? "gmail_missing_refresh" : "missing_refresh");
      response.redirect(recovery.toString());
      return;
    }
    if (typeof tokens.expires_in !== "number" || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || !Number.isFinite(new Date(Date.now() + tokens.expires_in * 1000).getTime())) {
      throw new BadRequestException({ code: "GOOGLE_OAUTH_TOKEN_FAILED", message: "Google did not return a usable token expiry. Any existing connection was not changed." });
    }
    const data = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString() };
    if (verified.kind === "chat") {
      const granted = typeof tokens.scope === "string" ? tokens.scope.split(/\s+/) : [];
      if (!chatScopes.every((scope) => granted.includes(scope))) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Google Chat permissions were not granted. The existing connection was not changed." });
      await this.credentials.upsertGoogleChatOAuth(verified.workspaceId, verified.userId, data);
    } else if (verified.kind === "gmail") {
      const granted = typeof tokens.scope === "string" ? tokens.scope.split(/\s+/) : [];
      if (!gmailScopes.every((scope) => granted.includes(scope))) throw new BadRequestException({ code: "GOOGLE_OAUTH_SCOPE_MISSING", message: "Gmail permission was not granted. The existing connection was not changed." });
      await this.credentials.upsertGmailOAuth(verified.workspaceId, verified.userId, data);
    } else await this.credentials.upsertGoogleOAuth(verified.workspaceId, verified.userId, data);
    if (verified.kind === "chat" || verified.kind === "gmail") {
      const connected = new URL("/dashboard/connections", process.env.WEB_ORIGIN ?? "http://localhost:3000");
      connected.searchParams.set("workspace", verified.workspaceId);
      connected.searchParams.set("connected", verified.kind === "chat" ? "google-chat" : "gmail");
      response.redirect(connected.toString());
    } else response.redirect(`${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/editor?connected=google`);
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

function signState(value: { workspaceId: string; userId: string; kind: GoogleConnectionKind }) {
  const payload = Buffer.from(JSON.stringify({ ...value, issuedAt: Date.now() })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function verifyState(value: string) {
  const [payload, expected] = value.split(".");
  if (!payload || !expected || !constantTimeEquals(signature(payload), expected)) throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Google OAuth state is invalid." });
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const record = parsed as Record<string, unknown>;
    if (typeof record.workspaceId !== "string" || typeof record.userId !== "string" || typeof record.issuedAt !== "number" || record.issuedAt > Date.now() + 60_000 || record.issuedAt + stateMaxAgeMs < Date.now()) throw new Error();
    if (record.kind !== undefined && record.kind !== "google" && record.kind !== "chat" && record.kind !== "gmail") throw new Error();
    return { workspaceId: record.workspaceId, userId: record.userId, kind: record.kind === "chat" ? "chat" as const : record.kind === "gmail" ? "gmail" as const : "google" as const };
  } catch {
    throw new BadRequestException({ code: "GOOGLE_OAUTH_INVALID", message: "Google OAuth state is invalid." });
  }
}

function signature(value: string) {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) throw new BadRequestException({ code: "ENCRYPTION_KEY_REQUIRED", message: "APP_ENCRYPTION_KEY must be configured before Google OAuth." });
  return createHmac("sha256", Buffer.from(key, "base64")).update(value).digest("base64url");
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
