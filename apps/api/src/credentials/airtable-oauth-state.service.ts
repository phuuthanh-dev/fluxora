import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import IORedis from "ioredis";
import type { Request, Response } from "express";
import { consumeOAuthState, issueOAuthState } from "./oauth-state-store";

type AirtableState = { workspaceId: string; userId: string; credentialId?: string; kind: "airtable"; nonce: string; issuedAt: number };
@Injectable()
export class AirtableOAuthStateService implements OnApplicationShutdown {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true, connectTimeout: 2000, commandTimeout: 3000, maxRetriesPerRequest: 1 });
  constructor() { this.redis.on("error", () => {}); }
  onApplicationShutdown() { this.redis.disconnect(); }
  issue(input: Omit<AirtableState, "nonce" | "issuedAt" | "kind">, request: Request, response: Response) { return issueOAuthState({ ...input, kind: "airtable" }, request, response, this.redis, "airtable"); }
  consume(value: string, request: Request, response: Response) { return consumeOAuthState<AirtableState>(value, request, response, this.redis, "airtable", (s) => s.kind === "airtable" && typeof s.workspaceId === "string" && typeof s.userId === "string" && (s.credentialId === undefined || typeof s.credentialId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s.credentialId))); }
}
