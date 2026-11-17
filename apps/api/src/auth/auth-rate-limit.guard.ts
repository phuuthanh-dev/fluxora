import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_ENTRIES = 10_000;
const MIN_SWEEP_INTERVAL_MS = 1_000;

type RateLimitEntry = { attempts: number; resetAt: number };

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly entries = new Map<string, RateLimitEntry>();
  private nextSweepAt = Infinity;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = this.tracker(request);
    const now = Date.now();
    if (now >= this.nextSweepAt) this.sweep(now);
    const current = this.entries.get(key);
    if (!current && this.entries.size >= MAX_ENTRIES) this.reject();
    const entry = !current || current.resetAt <= now ? { attempts: 0, resetAt: now + WINDOW_MS } : current;
    entry.attempts += 1;
    this.entries.set(key, entry);
    if (!current || current.resetAt <= now) this.nextSweepAt = Math.min(this.nextSweepAt, entry.resetAt);
    if (entry.attempts > MAX_ATTEMPTS) this.reject();
    return true;
  }

  private sweep(now: number) {
    let earliest = Infinity;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
      else earliest = Math.min(earliest, entry.resetAt);
    }
    this.nextSweepAt = Math.max(earliest, now + MIN_SWEEP_INTERVAL_MS);
  }

  private reject(): never {
    throw new HttpException({ code: "AUTH_RATE_LIMITED", message: "Too many attempts. Please try again later." }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private tracker(request: Request) {
    const email = typeof request.body?.email === "string" ? request.body.email.trim().normalize("NFC").toLowerCase() : "";
    return createHash("sha256").update(JSON.stringify([request.ip, email])).digest("hex");
  }
}
