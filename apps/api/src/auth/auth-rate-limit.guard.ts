import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

type RateLimitEntry = { attempts: number; resetAt: number };

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly entries = new Map<string, RateLimitEntry>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = this.tracker(request);
    const now = Date.now();
    const current = this.entries.get(key);
    const entry = !current || current.resetAt <= now ? { attempts: 0, resetAt: now + WINDOW_MS } : current;
    entry.attempts += 1;
    this.entries.set(key, entry);
    if (entry.attempts > MAX_ATTEMPTS) {
      throw new HttpException({ code: "AUTH_RATE_LIMITED", message: "Too many attempts. Please try again later." }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private tracker(request: Request) {
    const email = typeof request.body?.email === "string" ? request.body.email.trim().normalize("NFC").toLowerCase() : "";
    return `${request.ip}|${email}`;
  }
}
