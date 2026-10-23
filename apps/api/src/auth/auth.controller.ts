import { BadRequestException, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

const SESSION_COOKIE = "workflow_session";

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
      secure: process.env.NODE_ENV === "production",
    });
  }
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
