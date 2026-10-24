import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { createGitHubAuthorizationUrl, fetchGitHubIdentity, githubAuthConfig } from "./github-oauth";

test("GitHub authorization requests the minimum profile and verified-email scopes", () => {
  const url = new URL(createGitHubAuthorizationUrl({ clientId: "client", clientSecret: "secret", redirectUri: "http://localhost:3001/api/v1/auth/github/callback" }, "state-value"));
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/login/oauth/authorize");
  assert.equal(url.searchParams.get("scope"), "read:user user:email");
  assert.equal(url.searchParams.get("state"), "state-value");
});

test("GitHub identity requires a verified email and never returns the OAuth token", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    if (calls.length === 1) return new Response(JSON.stringify({ access_token: "provider-token" }), { status: 200 });
    if (String(input).endsWith("/user")) return new Response(JSON.stringify({ id: 42, login: "workflow-owner" }), { status: 200 });
    return new Response(JSON.stringify([{ email: "OWNER@example.com", verified: true, primary: true }]), { status: 200 });
  };
  try {
    const identity = await fetchGitHubIdentity("authorization-code", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost/callback" });
    assert.deepEqual(identity, { providerAccountId: "42", email: "owner@example.com", displayName: "workflow-owner" });
    assert.equal(JSON.stringify(identity).includes("provider-token"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub config fails closed when a required variable is absent", () => {
  assert.throws(() => githubAuthConfig({ GITHUB_CLIENT_ID: "client" }), BadRequestException);
});
