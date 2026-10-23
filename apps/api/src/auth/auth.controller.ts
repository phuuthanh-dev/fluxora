import { BadRequestException, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from "@nestjs/common";
import { AuthIdentityProvider } from "@prisma/client";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

const SESSION_COOKIE = "workflow_session";
const GOOGLE_STATE_COOKIE = "workflow_google_auth_state";
const GOOGLE_STATE_DURATION_MS = 1000 * 60 * 10;

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("register")
  async register(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.register(parseRegisterDto(request.body));
    this.setSessionCookie(response, session.token);
    return { user: session.user };
  }

  @Post("login")
  @HttpCode(200)
  async login(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const session = await this.authService.login(parseLoginDto(request.body));
    this.setSessionCookie(response, session.token);
    return { user: session.user };
  }

  @Get("me")
  async getCurrentUser(@Req() request: Request) {
    return { user: await this.authService.getCurrentUser(readCookie(request, SESSION_COOKIE)) };
  }

  @Get("providers")
  providers() {
    return { google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_AUTH_REDIRECT_URI) };
  }

  @Get("google/start")
  startGoogleLogin(@Res() response: Response) {
    const config = googleAuthConfig();
    const state = randomBytes(32).toString("base64url");
    response.cookie(GOOGLE_STATE_COOKIE, state, { httpOnly: true, maxAge: GOOGLE_STATE_DURATION_MS, sameSite: "lax", secure: isProduction() });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    }).toString();
    response.redirect(url.toString());
  }

  @Get("google/callback")
  async completeGoogleLogin(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Query("error") error: string | undefined, @Req() request: Request, @Res() response: Response) {
    const clearState = () => response.clearCookie(GOOGLE_STATE_COOKIE, { httpOnly: true, sameSite: "lax", secure: isProduction() });
    if (error) {
      clearState();
      return response.redirect(webRedirect("/", "authError", "google_cancelled"));
    }
    if (!code || !state || !safeEqual(state, readCookie(request, GOOGLE_STATE_COOKIE))) {
      clearState();
      throw new BadRequestException({ code: "GOOGLE_AUTH_INVALID", message: "Google sign-in state is invalid or expired." });
    }

    try {
      const config = googleAuthConfig();
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }),
      });
      const tokens = await tokenResponse.json().catch(() => ({})) as { id_token?: unknown };
      if (!tokenResponse.ok || typeof tokens.id_token !== "string") throw new BadRequestException({ code: "GOOGLE_AUTH_TOKEN_FAILED", message: "Google did not return a valid identity token." });
      const identity = await verifyGoogleIdToken(tokens.id_token, config.clientId);
      const session = await this.authService.loginWithIdentity({ provider: AuthIdentityProvider.GOOGLE, providerAccountId: identity.subject, email: identity.email, displayName: identity.displayName });
      clearState();
      this.setSessionCookie(response, session.token);
      return response.redirect(webRedirect("/dashboard", "auth", "google"));
    } catch (reason) {
      clearState();
      if (reason instanceof BadRequestException) throw reason;
      throw new BadRequestException({ code: "GOOGLE_AUTH_FAILED", message: "Google sign-in could not be completed. Please try again." });
    }
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(readCookie(request, SESSION_COOKIE));
    response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }

  private setSessionCookie(response: Response, token: string) {
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      maxAge: AuthService.getSessionDurationMs(),
      sameSite: "lax",
      secure: isProduction(),
    });
  }
}

type GoogleIdentity = { subject: string; email: string; displayName: string | null };

async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleIdentity> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const claims = await response.json().catch(() => ({})) as Record<string, unknown>;
  const issuer = claims.iss;
  if (!response.ok || claims.aud !== clientId || (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") || claims.email_verified !== "true" || typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new BadRequestException({ code: "GOOGLE_AUTH_IDENTITY_INVALID", message: "Google identity token validation failed." });
  }
  return { subject: claims.sub, email: claims.email, displayName: typeof claims.name === "string" ? claims.name : null };
}

function googleAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new BadRequestException({ code: "GOOGLE_AUTH_NOT_CONFIGURED", message: "Google account sign-in is not configured yet." });
  return { clientId, clientSecret, redirectUri };
}

function safeEqual(value: string, expected: string | undefined) {
  if (!expected) return false;
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

function webRedirect(path: string, key: string, value: string) {
  const url = new URL(path, process.env.WEB_ORIGIN ?? "http://localhost:3000");
  url.searchParams.set(key, value);
  return url.toString();
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  return cookieHeader.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

function parseLoginDto(value: unknown): LoginDto {
  const record = readObject(value);
  const email = readEmail(record.email);
  const password = readString(record.password, "Password", 1, 128);
  return { email, password };
}

function parseRegisterDto(value: unknown): RegisterDto {
  const record = readObject(value);
  const email = readEmail(record.email);
  const password = readString(record.password, "Password", 12, 128);
  const displayName = record.displayName === undefined ? undefined : readString(record.displayName, "Name", 1, 80);
  return { email, password, displayName };
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({ code: "INVALID_INPUT", message: "A JSON object is required." });
  }
  return value as Record<string, unknown>;
}

function readEmail(value: unknown): string {
  const email = readString(value, "Email", 3, 320);
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new BadRequestException({ code: "INVALID_INPUT", message: "A valid email is required." });
  }
  return email;
}

function readString(value: unknown, label: string, minimumLength: number, maximumLength: number): string {
  if (typeof value !== "string" || value.length < minimumLength || value.length > maximumLength) {
    throw new BadRequestException({ code: "INVALID_INPUT", message: `${label} must be between ${minimumLength} and ${maximumLength} characters.` });
  }
  return value;
}
