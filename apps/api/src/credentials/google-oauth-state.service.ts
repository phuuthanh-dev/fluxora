import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import IORedis from "ioredis";
import type { Request, Response } from "express";
import { validGmailCapabilities, type GmailCapability, type GoogleConnectionKind } from "./google-oauth-policy";
import { consumeOAuthState, issueOAuthState, OAuthStateUnavailableError } from "./oauth-state-store";

export { OAuthStateUnavailableError as GoogleOAuthStateUnavailableError };
type State = { workspaceId: string; userId: string; kind: GoogleConnectionKind; credentialId?: string; gmailCapabilities?: GmailCapability[]; chatManage?: boolean; allowUnverifiedLegacy?: boolean; nonce: string; issuedAt: number };

@Injectable()
export class GoogleOAuthStateService implements OnApplicationShutdown {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true, connectTimeout: 2000, commandTimeout: 3000, maxRetriesPerRequest: 1 });

  constructor() { this.redis.on("error", () => {}); }
  onApplicationShutdown() { this.redis.disconnect(); }

  issue(input: Omit<State, "nonce" | "issuedAt">, request: Request, response: Response) {
    return issueOAuthState(input, request, response, this.redis, "google");
  }

  consume(value: string, request: Request, response: Response) {
    return consumeOAuthState<State>(value, request, response, this.redis, "google", (s) => {
      if (typeof s.workspaceId !== "string" || typeof s.userId !== "string" || !["google", "chat", "gmail", "calendar"].includes(String(s.kind)) || (s.credentialId !== undefined && (typeof s.credentialId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(s.credentialId)))) return false;
      if (s.gmailCapabilities !== undefined && (s.kind !== "gmail" || !validGmailCapabilities(s.gmailCapabilities))) return false;
      if (s.chatManage !== undefined && (s.kind !== "chat" || typeof s.chatManage !== "boolean")) return false;
      if (s.allowUnverifiedLegacy !== undefined && (s.allowUnverifiedLegacy !== true || typeof s.credentialId !== "string")) return false;
      return true;
    });
  }
}
