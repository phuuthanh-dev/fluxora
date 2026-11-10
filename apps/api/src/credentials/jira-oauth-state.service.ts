import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import IORedis from "ioredis";
import type { Request, Response } from "express";
import { consumeOAuthState, issueOAuthState } from "./oauth-state-store";
type JiraState = { workspaceId: string; userId: string; credentialId?: string; kind: "jira"; nonce: string; issuedAt: number };
@Injectable()
export class JiraOAuthStateService implements OnApplicationShutdown {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true, connectTimeout: 2000, commandTimeout: 3000, maxRetriesPerRequest: 1 });
  constructor() { this.redis.on("error", () => {}); }
  onApplicationShutdown() { this.redis.disconnect(); }
  issue(input: Omit<JiraState, "nonce" | "issuedAt" | "kind">, request: Request, response: Response) { return issueOAuthState({ ...input, kind: "jira" }, request, response, this.redis, "jira"); }
  consume(value: string, request: Request, response: Response) { return consumeOAuthState<JiraState>(value, request, response, this.redis, "jira", (s) => s.kind === "jira" && typeof s.workspaceId === "string" && typeof s.userId === "string" && (s.credentialId === undefined || typeof s.credentialId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s.credentialId))); }
}
