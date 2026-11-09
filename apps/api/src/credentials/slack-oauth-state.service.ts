import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import IORedis from "ioredis";
import type { Request, Response } from "express";
import { consumeOAuthState, issueOAuthState } from "./oauth-state-store";

type SlackState = { workspaceId: string; userId: string; credentialId?: string; eventAccess?: boolean; kind: "slack"; nonce: string; issuedAt: number };

@Injectable()
export class SlackOAuthStateService implements OnApplicationShutdown {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true, connectTimeout: 2000, commandTimeout: 3000, maxRetriesPerRequest: 1 });
  constructor() { this.redis.on("error", () => {}); }
  onApplicationShutdown() { this.redis.disconnect(); }

  issue(input: Omit<SlackState, "nonce" | "issuedAt" | "kind">, request: Request, response: Response) {
    return issueOAuthState({ ...input, kind: "slack" }, request, response, this.redis, "slack");
  }

  consume(value: string, request: Request, response: Response) {
    return consumeOAuthState<SlackState>(value, request, response, this.redis, "slack", (s) => s.kind === "slack" && (s.eventAccess === undefined || typeof s.eventAccess === "boolean") && typeof s.workspaceId === "string" && typeof s.userId === "string" && (s.credentialId === undefined || typeof s.credentialId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s.credentialId)));
  }
}
