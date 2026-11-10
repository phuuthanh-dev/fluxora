import test from "node:test";
import assert from "node:assert/strict";
import { JiraWebhookAdapter } from "./jira-webhook-adapter";
import { ProviderWebhookError } from "./provider-webhook-adapter";

const auth = { cloudId: "12345678-1234-1234-1234-123456789abc", accessToken: "example-token" };
const input = { url: "https://api.example.test/webhooks/example", projectId: "10001", event: "jira:issue_created" as const };

test("Jira dynamic webhook uses the selected project and one event", async () => {
  let sent: RequestInit | undefined;
  const adapter = new JiraWebhookAdapter(async (url, init) => {
    assert.equal(url, `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/api/3/webhook`);
    sent = init;
    return Response.json({ webhookRegistrationResult: [{ createdWebhookId: 42 }] });
  });
  assert.equal(await adapter.create(auth, input), 42);
  assert.equal(sent?.method, "POST");
  assert.deepEqual(JSON.parse(String(sent?.body)), { url: input.url, webhooks: [{ events: [input.event], jqlFilter: "project = 10001" }] });
});

test("Jira registration rejects invalid input and does not retry ambiguous writes", async () => {
  let calls = 0;
  const adapter = new JiraWebhookAdapter(async () => { calls++; throw new Error("network"); });
  await assert.rejects(adapter.create(auth, { ...input, projectId: "1 OR project = 2" }), (e: unknown) => e instanceof ProviderWebhookError && e.code === "INVALID_INPUT");
  assert.equal(calls, 0);
  await assert.rejects(adapter.create(auth, input), (e: unknown) => e instanceof ProviderWebhookError && e.code === "OUTCOME_UNKNOWN");
  assert.equal(calls, 1);
});

test("Jira refresh and deletion target only the recorded webhook", async () => {
  const requests: { url: string; method: string; body: unknown }[] = [];
  const adapter = new JiraWebhookAdapter(async (url, init) => {
    requests.push({ url: String(url), method: String(init?.method), body: JSON.parse(String(init?.body)) });
    return Response.json({ expirationDate: "2099-12-01T00:00:00Z" });
  });
  assert.equal((await adapter.refresh(auth, 42)).toISOString(), "2099-12-01T00:00:00.000Z");
  await adapter.remove(auth, 42);
  assert.deepEqual(requests.map(({ method, body }) => ({ method, body })), [
    { method: "PUT", body: { webhookIds: [42] } },
    { method: "DELETE", body: { webhookIds: [42] } },
  ]);
  assert.ok(requests[0]!.url.endsWith("/webhook/refresh"));
  assert.ok(requests[1]!.url.endsWith("/webhook"));
});

test("Jira inspection compares the recorded hook before lifecycle operations", async () => {
  const adapter = new JiraWebhookAdapter(async (_url, init) => {
    assert.equal(init?.method, "GET");
    return Response.json({ isLast: true, values: [{ id: 42, url: input.url, jqlFilter: "project = 10001", events: [input.event], expirationDate: "2026-12-01T00:00:00Z" }] });
  });
  const result = await adapter.inspect(auth, { id: 42, ...input });
  assert.equal(result.found, true);
  assert.equal(result.matches, true);
  assert.equal(result.expirationDate?.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal((await adapter.inspect(auth, { id: 42, ...input, projectId: "999" })).matches, false);
  assert.equal((await adapter.inspect(auth, { id: 43, ...input })).found, false);
});
