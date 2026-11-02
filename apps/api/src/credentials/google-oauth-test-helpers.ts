import type { Response } from "express";
import { GoogleOAuthController } from "./google-oauth.controller";
import { GoogleOAuthStateService } from "./google-oauth-state.service";

// Fake Redis implements the state store's atomic compare-and-consume contract.
export function oauthHarness(credentials: unknown, userId = "owner") {
  const values = new Map<string, string>();
  let storeUnavailable = false;
  const cookies = new Map<string, string>([["workflow_session", `session-${userId}`]]);
  const request = { currentUser: { id: userId }, headers: { cookie: "" } };
  let redirect = "";
  const sync = () => { request.headers.cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); };
  const response = {
    cookie: (key: string, value: string) => { cookies.set(key, value); sync(); },
    clearCookie: (key: string) => { cookies.delete(key); sync(); },
    setHeader: () => {},
    redirect: (url: string) => { redirect = url; },
  } as unknown as Response;
  const store = new GoogleOAuthStateService();
  (store as unknown as { redis: unknown }).redis = {
    set: async (key: string, value: string) => { if (storeUnavailable) throw new Error("synthetic Redis failure"); if (values.has(key)) return null; values.set(key, value); return "OK"; },
    eval: async (_script: string, _count: number, key: string, binding: string) => {
      if (storeUnavailable) throw new Error("synthetic Redis failure");
      const value = values.get(key);
      if (!value?.startsWith(`${binding}:`)) return null;
      values.delete(key); return value.slice(binding.length + 1);
    },
    disconnect: () => {},
  };
  const auth = { getCurrentUser: async (token?: string) => {
    if (!token?.startsWith("session-")) throw new Error("not authenticated");
    return { id: token === "session-owner-second" ? "owner" : token.slice("session-".length) };
  } };
  sync();
  return { controller: new GoogleOAuthController(credentials as never, store, auth as never), request: request as never, response, cookies, sync, failStateStore: (value: boolean) => { storeUnavailable = value; }, redirect: () => redirect };
}

export function oauthEnvironment() {
  const names = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "APP_ENCRYPTION_KEY", "WEB_ORIGIN"] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const fetch = globalThis.fetch;
  Object.assign(process.env, { GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", GOOGLE_REDIRECT_URI: "https://api.example.test/callback", APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"), WEB_ORIGIN: "https://example.test" });
  return () => { globalThis.fetch = fetch; for (const name of names) { const value = previous.get(name); if (value === undefined) delete process.env[name]; else process.env[name] = value; } };
}
