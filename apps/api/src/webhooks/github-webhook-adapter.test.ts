import { strict as assert } from "node:assert";
import { test } from "node:test";
import { GitHubWebhookAdapter } from "./github-webhook-adapter";
import { ProviderWebhookError } from "./provider-webhook-adapter";

test("creates a GitHub webhook on the fixed host with JSON, event and secret", async () => {
  let call: { url: string; init?: RequestInit } | undefined;
  const adapter = new GitHubWebhookAdapter(async (input, init) => {
    call = { url: String(input), init };
    return new Response(JSON.stringify({ id: 42 }), { status: 201 });
  });
  assert.deepEqual(await adapter.create("token", { repository: "owner/repo", url: "https://example.test/hook", event: "push", secret: "test-secret" }), { repository: "owner/repo", hookId: 42 });
  assert.equal(call?.url, "https://api.github.com/repos/owner/repo/hooks");
  assert.equal(call?.init?.redirect, "error");
  assert.deepEqual(JSON.parse(String(call?.init?.body)), { name: "web", active: true, events: ["push"], config: { url: "https://example.test/hook", content_type: "json", insecure_ssl: "0", secret: "test-secret" } });
});

test("rejects untrusted targets and does not call GitHub", async () => {
  let calls = 0;
  const adapter = new GitHubWebhookAdapter(async () => { calls++; return new Response(); });
  for (const spec of [
    { repository: "../repo", url: "https://example.test/hook", event: "push", secret: "x" },
    { repository: "owner/repo", url: "http://example.test/hook", event: "push", secret: "x" },
    { repository: "owner/repo", url: "https://example.test/hook", event: "*", secret: "x" },
  ]) await assert.rejects(adapter.create("token", spec), (error: unknown) => error instanceof ProviderWebhookError && error.code === "INVALID_INPUT");
  assert.equal(calls, 0);
});

test("reports uncertain write outcomes without leaking provider response or token", async () => {
  const adapter = new GitHubWebhookAdapter(async () => { throw new Error("private token or body"); });
  await assert.rejects(adapter.create("private-token", { repository: "owner/repo", url: "https://example.test/hook", event: "push", secret: "secret" }), (error: unknown) => error instanceof ProviderWebhookError && error.code === "OUTCOME_UNKNOWN" && !error.message.includes("private"));
  await assert.rejects(adapter.exists("token", { repository: "owner/repo", hookId: 1 }), (error: unknown) => error instanceof ProviderWebhookError && error.code === "UNAVAILABLE" && error.retryable);
});

test("does not treat GitHub 404 as proof the owned webhook is absent", async () => {
  const adapter = new GitHubWebhookAdapter(async () => new Response("sensitive response", { status: 404 }));
  await assert.rejects(adapter.exists("token", { repository: "owner/repo", hookId: 1 }), (error: unknown) => error instanceof ProviderWebhookError && error.code === "NOT_FOUND");
  await assert.rejects(adapter.remove("token", { repository: "owner/repo", hookId: 1 }), (error: unknown) => error instanceof ProviderWebhookError && error.code === "NOT_FOUND");
});

test("treats a successful create with missing hook ID as an unknown outcome", async () => {
  const adapter = new GitHubWebhookAdapter(async () => new Response("{}", { status: 201 }));
  await assert.rejects(adapter.create("token", { repository: "owner/repo", url: "https://example.test/hook", event: "push", secret: "secret" }), (error: unknown) => error instanceof ProviderWebhookError && error.code === "OUTCOME_UNKNOWN");
});

test("inspection detects drift without returning the provider URL or secret", async () => {
  const adapter = new GitHubWebhookAdapter(async () => new Response(JSON.stringify({ id: 42, active: false, events: ["push", "issues"], config: { url: "https://example.test/?token=private", secret: "hidden" } })));
  const result = await adapter.inspect("token", { repository: "owner/repo", hookId: 42 }, { url: "https://example.test/hook", event: "push" });
  assert.deepEqual(result, { urlMatches: false, eventsMatch: false, active: false });
  assert.doesNotMatch(JSON.stringify(result), /private|hidden/);
  const matching = new GitHubWebhookAdapter(async () => new Response(JSON.stringify({ id: 42, active: true, events: ["push"], config: { url: "https://example.test/hook" } })));
  assert.deepEqual(await matching.inspect("token", { repository: "owner/repo", hookId: 42 }, { url: "https://example.test/hook", event: "push" }), { urlMatches: true, eventsMatch: true, active: true });
});

test("inspection rejects malformed or mismatched provider responses without leaking them", async () => {
  for (const body of [{ id: 43, active: true, events: ["push"], config: { url: "secret" } }, { id: 42, active: true, events: [3], config: { url: "secret" } }, null]) {
    const adapter = new GitHubWebhookAdapter(async () => new Response(JSON.stringify(body)));
    await assert.rejects(adapter.inspect("token", { repository: "owner/repo", hookId: 42 }, { url: "https://example.test/hook", event: "push" }), (error: unknown) => error instanceof ProviderWebhookError && error.code === "UNAVAILABLE" && !error.message.includes("secret"));
  }
});
