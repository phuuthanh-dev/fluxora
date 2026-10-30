import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable } from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class AccountRequestGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === "GET") return true;
    if ((req.headers.origin && req.headers.origin !== (process.env.WEB_ORIGIN ?? "http://localhost:3000")) || (req.method !== "DELETE" && !req.is("application/json"))) throw new ForbiddenException({ code: "REQUEST_ORIGIN_INVALID", message: "This request is not allowed." });
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key);
    const key = req.ip ?? "unknown";
    const entry = this.attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
    if ((!this.attempts.has(key) && this.attempts.size >= 10_000) || ++entry.count > 20) throw new HttpException({ code: "AUTH_RATE_LIMITED", message: "Too many attempts. Please try again later." }, 429);
    this.attempts.set(key, entry);
    return true;
  }
}
