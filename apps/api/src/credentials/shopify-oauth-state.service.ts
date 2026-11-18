import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import IORedis from "ioredis";
import type { Request, Response } from "express";
import { consumeOAuthState, issueOAuthState } from "./oauth-state-store";
import { shopifyShop } from "./shopify-oauth-protocol";

type ShopifyState = { workspaceId: string; userId: string; shop: string; credentialId?: string; kind: "shopify"; nonce: string; issuedAt: number };
@Injectable()
export class ShopifyOAuthStateService implements OnApplicationShutdown {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true, connectTimeout: 2000, commandTimeout: 3000, maxRetriesPerRequest: 1 });
  constructor() { this.redis.on("error", () => {}); }
  onApplicationShutdown() { this.redis.disconnect(); }
  issue(input: Omit<ShopifyState, "nonce" | "issuedAt" | "kind">, request: Request, response: Response) { return issueOAuthState({ ...input, kind: "shopify" }, request, response, this.redis, "shopify"); }
  consume(value: string, request: Request, response: Response) { return consumeOAuthState<ShopifyState>(value, request, response, this.redis, "shopify", (s) => s.kind === "shopify" && typeof s.workspaceId === "string" && typeof s.userId === "string" && Boolean(shopifyShop(s.shop)) && (s.credentialId === undefined || typeof s.credentialId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s.credentialId))); }
}
