import assert from "node:assert/strict";
import test from "node:test";
import { reportJiraPrivacyAccount } from "./jira-privacy-report";

const account = "5be24ad8b1653240376955d2", oldest = new Date("2026-01-01T00:00:00Z");
test("Jira reporting posts oldest date with bounded, fixed endpoint and honors cycle", async () => {
  const result = await reportJiraPrivacyAccount("synthetic-token", account, oldest, async (input, init) => {
    assert.equal(input, "https://api.atlassian.com/app/report-accounts/");
    assert.equal(init?.redirect, "error");
    assert.deepEqual(JSON.parse(String(init?.body)), { accounts: [{ accountId: account, updatedAt: oldest.toISOString() }] });
    return new Response(null, { status: 204, headers: { "Cycle-Period": "14" } });
  });
  assert.deepEqual(result, { action: null, cycleDays: 14 });
});
test("Jira reporting records required actions, respects rate limits, rejects malformed responses", async () => {
  assert.deepEqual(await reportJiraPrivacyAccount("x", account, oldest, async () => Response.json({ accounts: [{ accountId: account, status: "closed" }] })), { action: "closed", cycleDays: 7 });
  assert.deepEqual(await reportJiraPrivacyAccount("x", account, oldest, async () => new Response(null, { status: 429, headers: { "Retry-After": "30" } })), { retrySeconds: 30 });
  await assert.rejects(reportJiraPrivacyAccount("x", "unknown", oldest));
  await assert.rejects(reportJiraPrivacyAccount("x", account, oldest, async () => Response.json({ accounts: [{ accountId: "other", status: "closed" }] })));
  await assert.rejects(reportJiraPrivacyAccount("x", account, oldest, async () => new Response(null, { status: 500 })));
});
