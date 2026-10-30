import { ArgumentsHost, BadRequestException, Catch, Controller, Delete, ExceptionFilter, Get, Header, HttpCode, HttpException, Inject, Param, Patch, Post, Req, Res, UseFilters, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "./authenticated-request";
import { AccountService } from "./account.service";
import { AccountMailService } from "./account-mail.service";
import { AuthenticationGuard } from "./authentication.guard";
import { AccountRequestGuard } from "./account-request.guard";

@Catch()
export class AccountExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    // Database/SMTP exception objects can contain tokens or passwords. Never log them.
    const response = host.switchToHttp().getResponse<Response>();
    const known = error instanceof HttpException;
    response.setHeader("Cache-Control", "no-store");
    response.status(known ? error.getStatus() : 503).json(known ? error.getResponse() : { code: "ACCOUNT_UNAVAILABLE", message: "Account services are temporarily unavailable. Please try again." });
  }
}

@Controller("auth")
@UseGuards(AccountRequestGuard)
@UseFilters(AccountExceptionFilter)
export class AccountController {
  constructor(@Inject(AccountService) private readonly accounts: AccountService, @Inject(AccountMailService) private readonly mail: AccountMailService) {}
  @Get("account") @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  async account(@Req() req: AuthenticatedRequest) { return { user: await this.accounts.account(req.currentUser!.id) }; }
  @Patch("account") @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  async rename(@Req() req: AuthenticatedRequest) { return { user: await this.accounts.rename(req.currentUser!.id, text(req.body, "displayName", 1, 80).trim() || invalid("Name is required.")) }; }
  @Get("account/sessions") @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  async sessions(@Req() req: AuthenticatedRequest) { return { sessions: await this.accounts.sessions(req.currentUser!.id, sessionToken(req)) }; }
  @Post("account/sessions/revoke-others") @HttpCode(200) @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  revokeOthers(@Req() req: AuthenticatedRequest) { return this.accounts.revoke(req.currentUser!.id, sessionToken(req)); }
  @Delete("account/sessions/:id") @UseGuards(AuthenticationGuard) @Header("Cache-Control", "no-store")
  async revoke(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.accounts.revoke(req.currentUser!.id, sessionToken(req), id);
    if (result.current) clearSession(res);
    return result;
  }
  @Post("account/password") @HttpCode(204) @UseGuards(AuthenticationGuard)
  async password(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    await this.accounts.changePassword(req.currentUser!.id, text(req.body, "currentPassword", 1, 128), text(req.body, "password", 12, 128));
    clearSession(res);
  }
  @Get("password/recovery") @Header("Cache-Control", "no-store")
  recovery() { return { available: Boolean(this.mail.config()) }; }
  @Post("password/forgot") @HttpCode(202) @Header("Cache-Control", "no-store")
  async forgot(@Req() req: Request) {
    const email = text(req.body, "email", 3, 320).trim().toLowerCase();
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) invalid("A valid email is required.");
    await this.accounts.forgot(email);
    return { message: "If an account matches that email, a reset link will arrive shortly." };
  }
  @Post("password/reset") @HttpCode(204)
  async reset(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.accounts.reset(text(req.body, "token", 1, 128), text(req.body, "password", 12, 128));
    clearSession(res);
  }
}
function invalid(message: string): never { throw new BadRequestException({ code: "INVALID_INPUT", message }); }
function text(body: unknown, key: string, min: number, max: number): string {
  const value = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>)[key] : undefined;
  if (typeof value !== "string" || value.length < min || value.length > max) return invalid(`${key} must be between ${min} and ${max} characters.`);
  return value;
}
function sessionToken(req: Request) { return req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith("workflow_session="))?.slice("workflow_session=".length) ?? ""; }
function clearSession(res: Response) { res.setHeader("Cache-Control", "no-store"); res.clearCookie("workflow_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }); }
