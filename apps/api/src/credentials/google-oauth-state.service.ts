import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import IORedis from "ioredis";
import type { Request, Response } from "express";
import { validGmailCapabilities, type GmailCapability, type GoogleConnectionKind } from "./google-oauth-policy";

const lifetime = 10 * 60_000;
const cookiePrefix = "fluxora_google_oauth_";
export class GoogleOAuthStateUnavailableError extends Error {}

type State = { workspaceId: string; userId: string; kind: GoogleConnectionKind; credentialId?: string; gmailCapabilities?: GmailCapability[]; chatManage?: boolean; nonce: string; issuedAt: number };

@Injectable()
export class GoogleOAuthStateService implements OnModuleDestroy {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true, connectTimeout: 2000, commandTimeout: 3000, maxRetriesPerRequest: 1 });

  constructor() { this.redis.on("error", () => {}); }
  onModuleDestroy() { this.redis.disconnect(); }

  async issue(input: Omit<State, "nonce" | "issuedAt">, request: Request, response: Response) {
    const session = cookie(request, "workflow_session");
    if (!session) throw new Error("Session unavailable");
    const nonce = randomBytes(24).toString("base64url");
    const browser = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ ...input, nonce, issuedAt: Date.now() })).toString("base64url");
    const state = `${payload}.${mac(payload)}`;
    const binding = mac(`${nonce}:${session}:${browser}`);
    let saved: string | null;
    try { saved = await this.redis.set(`google-oauth:${nonce}`, `${binding}:${verifier}`, "PX", lifetime, "NX"); }
    catch { throw new GoogleOAuthStateUnavailableError("OAuth state store unavailable"); }
    if (saved !== "OK") throw new GoogleOAuthStateUnavailableError("OAuth state store unavailable");
    response.cookie(`${cookiePrefix}${nonce}`, browser, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: lifetime });
    return { state, challenge: createHash("sha256").update(verifier).digest("base64url") };
  }

  async consume(value: string, request: Request, response: Response) {
    const parts = value.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1] || !equal(mac(parts[0]), parts[1])) throw new Error("Invalid state");
    const state: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Invalid state");
    const s = state as Record<string, unknown>;
    if (typeof s.workspaceId !== "string" || typeof s.userId !== "string" || !["google", "chat", "gmail", "calendar"].includes(String(s.kind)) || typeof s.nonce !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(s.nonce) || typeof s.issuedAt !== "number" || s.issuedAt > Date.now() + 60_000 || s.issuedAt + lifetime < Date.now() || (s.credentialId !== undefined && (typeof s.credentialId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(s.credentialId)))) throw new Error("Invalid state");
    if (s.gmailCapabilities !== undefined && (s.kind !== "gmail" || !validGmailCapabilities(s.gmailCapabilities))) throw new Error("Invalid state");
    if (s.chatManage !== undefined && (s.kind !== "chat" || typeof s.chatManage !== "boolean")) throw new Error("Invalid state");
    const session = cookie(request, "workflow_session");
    const browser = cookie(request, `${cookiePrefix}${s.nonce}`);
    if (!session || !browser) throw new Error("Invalid state");
    const binding = mac(`${s.nonce}:${session}:${browser}`);
    // Compare before deleting: a mismatched session cannot consume a legitimate flow.
    let verifier: unknown;
    try {
      verifier = await this.redis.eval("local v=redis.call('GET',KEYS[1]); if not v or string.sub(v,1,string.len(ARGV[1])+1) ~= ARGV[1]..':' then return nil end; redis.call('DEL',KEYS[1]); return string.sub(v,string.len(ARGV[1])+2)", 1, `google-oauth:${s.nonce}`, binding);
    } catch { throw new GoogleOAuthStateUnavailableError("OAuth state store unavailable"); }
    if (typeof verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) throw new Error("Invalid state");
    response.clearCookie(`${cookiePrefix}${s.nonce}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    return { state: s as unknown as State, verifier };
  }
}

function cookie(request: Request, name: string) {
  return request.headers.cookie?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1);
}
function mac(value: string) {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32) throw new Error("OAuth state key unavailable");
  return createHmac("sha256", Buffer.from(key, "base64")).update(value).digest("base64url");
}
function equal(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
