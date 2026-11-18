import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { ShopifyOAuthController } from "./shopify-oauth.controller";

test("Shopify callback rejects forged signatures and a different signed-in user before token exchange", async (t) => {
  const names = ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_REDIRECT_URI"] as const;
  const previous = names.map((name) => process.env[name]);
  Object.assign(process.env, { SHOPIFY_CLIENT_ID: "fixture-client", SHOPIFY_CLIENT_SECRET: "fixture-secret", SHOPIFY_REDIRECT_URI: "http://localhost:3001/api/v1/oauth/shopify/callback" });
  t.after(() => names.forEach((name, index) => { const value = previous[index]; if (value === undefined) delete process.env[name]; else process.env[name] = value; }));
  let stateChecks = 0, ownershipChecks = 0, providerCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { providerCalls++; throw new Error("Unexpected provider request"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const controller = new ShopifyOAuthController(
    { requireOwner: async () => { ownershipChecks++; } } as never,
    { consume: async () => { stateChecks++; return { state: { userId: "other-user", workspaceId: "workspace", shop: "fixture.myshopify.com" } }; } } as never,
    { getCurrentUser: async () => ({ id: "current-user" }) } as never,
    {} as never, {} as never,
  );
  const params = new URLSearchParams({ code: "fixture-code", shop: "fixture.myshopify.com", state: "fixture-state", timestamp: "1760000000" });
  const signed = new URLSearchParams([...params.entries()].sort(([a], [b]) => a.localeCompare(b))).toString().replace(/\+/g, "%20");
  params.set("hmac", createHmac("sha256", "fixture-secret").update(signed).digest("hex"));
  const redirects: string[] = [];
  const response = { setHeader: () => {}, redirect: (url: string) => { redirects.push(url); } };
  const request = (query: URLSearchParams) => ({ originalUrl: `/api/v1/oauth/shopify/callback?${query}`, headers: { cookie: "workflow_session=fixture-session" } });
  const forged = new URLSearchParams(params); forged.set("shop", "other.myshopify.com");
  await controller.callback(request(forged) as never, response as never);
  assert.equal(stateChecks, 0);
  await controller.callback(request(params) as never, response as never);
  assert.equal(stateChecks, 1);
  assert.equal(ownershipChecks, 0);
  assert.equal(providerCalls, 0);
  assert.ok(redirects.every((url) => new URL(url).searchParams.get("shopify_oauth") === "failed"));
});
