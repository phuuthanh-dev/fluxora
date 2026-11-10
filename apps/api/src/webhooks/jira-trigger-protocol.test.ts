import test from "node:test";
import assert from "node:assert/strict";
import { JwtService } from "@nestjs/jwt";
import { jiraDeliveryToken, normalizeJiraIssueEvent, verifyJiraBearer } from "./jira-trigger-protocol";

test("Jira webhook bearer must be signed and time bounded", () => {
  const secret = "synthetic-secret", now = 1_800_000_000_000;
  const endpointId = "endpoint", delivery = jiraDeliveryToken(secret, endpointId);
  const signed = new JwtService().sign({ iat: now / 1000, exp: now / 1000 + 60 }, { secret, algorithm: "HS256" });
  assert.equal(verifyJiraBearer(`Bearer ${signed}`, secret, endpointId, delivery, now), true);
  assert.equal(verifyJiraBearer(`Bearer ${signed}`, secret, "other", delivery, now), false);
  assert.equal(verifyJiraBearer(`Bearer ${signed}`, secret, endpointId, undefined, now), false);
  assert.equal(verifyJiraBearer(`Bearer ${signed}`, "wrong-secret", endpointId, delivery, now), false);
  assert.equal(verifyJiraBearer(`Bearer ${signed}`, secret, endpointId, delivery, now + 120_000), false);
  assert.equal(verifyJiraBearer("Bearer invalid", secret, endpointId, delivery, now), false);
});

test("Jira events are bound to their project, remote hook and event", () => {
  const payload = { webhookEvent: "jira:issue_created", matchedWebhookIds: [42], issue: { id: "10001", key: "DEMO-1", fields: { project: { id: "12" }, summary: "Example" } } };
  const input = { projectId: "12", event: "jira:issue_created" as const, remoteHookId: 42, deliveryId: "delivery-1" };
  assert.deepEqual(normalizeJiraIssueEvent(payload, input), { source: "jira", event: input.event, issue: { id: "10001", key: "DEMO-1", summary: "Example" }, deliveryId: "delivery-1" });
  assert.equal(normalizeJiraIssueEvent(payload, { ...input, projectId: "13" }), null);
  assert.equal(normalizeJiraIssueEvent(payload, { ...input, remoteHookId: 43 }), null);
  assert.equal(normalizeJiraIssueEvent(payload, { ...input, event: "jira:issue_updated" }), null);
  assert.equal(normalizeJiraIssueEvent(payload, { ...input, deliveryId: undefined }), null);
});
