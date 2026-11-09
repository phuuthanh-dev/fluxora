import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type IORedis from "ioredis";

const lifetime = 10 * 60_000;
export class OAuthStateUnavailableError extends Error {}
type RedisStateStore = Pick<IORedis, "set" | "eval">;

/** A short-lived one-use state bound to the user's session and this browser. */
export async function issueOAuthState(input: object, request: Request, response: Response, redis: RedisStateStore, namespace: string) {
  const session = cookie(request, "workflow_session");
  if (!session) throw new Error("Session unavailable");
  const nonce = randomBytes(24).toString("base64url");
  const browser = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ ...input, nonce, issuedAt: Date.now() })).toString("base64url");
  const state = `${payload}.${mac(payload)}`;
  const binding = mac(`${nonce}:${session}:${browser}`);
  let saved: string | null;
  try { saved = await redis.set(`${namespace}-oauth:${nonce}`, `${binding}:${verifier}`, "PX", lifetime, "NX"); }
  catch { throw new OAuthStateUnavailableError("OAuth state store unavailable"); }
  if (saved !== "OK") throw new OAuthStateUnavailableError("OAuth state store unavailable");
  response.cookie(`fluxora_${namespace}_oauth_${nonce}`, browser, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: lifetime });
  return { state, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export async function consumeOAuthState<T extends { nonce: string }>(value: string, request: Request, response: Response, redis: RedisStateStore, namespace: string, validate: (state: Record<string, unknown>) => boolean) {
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || !equal(mac(parts[0]), parts[1])) throw new Error("Invalid state");
  const state: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Invalid state");
  const s = state as Record<string, unknown>;
  if (typeof s.nonce !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(s.nonce) || typeof s.issuedAt !== "number" || s.issuedAt > Date.now() + 60_000 || s.issuedAt + lifetime < Date.now() || !validate(s)) throw new Error("Invalid state");
  const session = cookie(request, "workflow_session");
  const browser = cookie(request, `fluxora_${namespace}_oauth_${s.nonce}`);
  if (!session || !browser) throw new Error("Invalid state");
  const binding = mac(`${s.nonce}:${session}:${browser}`);
  let verifier: unknown;
  try {
    verifier = await redis.eval("local v=redis.call('GET',KEYS[1]); if not v or string.sub(v,1,string.len(ARGV[1])+1) ~= ARGV[1]..':' then return nil end; redis.call('DEL',KEYS[1]); return string.sub(v,string.len(ARGV[1])+2)", 1, `${namespace}-oauth:${s.nonce}`, binding);
  } catch { throw new OAuthStateUnavailableError("OAuth state store unavailable"); }
  if (typeof verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) throw new Error("Invalid state");
  response.clearCookie(`fluxora_${namespace}_oauth_${s.nonce}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return { state: s as unknown as T, verifier };
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
