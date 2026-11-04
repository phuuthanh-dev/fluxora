import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizeSentryIssueCreated, readSentryIssueCreatedFilter, verifySentryIntegrationSignature } from "./sentry-trigger-protocol";

const secret = "synthetic-client-secret", installationId = "64bf2cf2-37ee-46ae-a093-b7a52bd41a2a";
const filter = { installationId, project: "fluxora-test" };
const payload = (action = "created", project = "fluxora-test") => Buffer.from(JSON.stringify({ action, installation: { uuid: installationId }, data: { issue: { id: "12345", title: `Issue ${secret}`, level: "error", project: { slug: project }, secret: "not forwarded" } } }));

test("Sentry custom-integration signature authenticates exact body bytes", () => {
  const raw = payload(), signature = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifySentryIntegrationSignature(raw, signature, secret), true);
  assert.equal(verifySentryIntegrationSignature(Buffer.concat([raw, Buffer.from(" ")]), signature, secret), false);
  assert.equal(verifySentryIntegrationSignature(raw, "bad", secret), false);
});

test("Sentry issue-created filtering uses signed installation and project identifiers", () => {
  const result = normalizeSentryIssueCreated(payload(), "issue", filter, secret);
  assert.deepEqual(result, { kind: "accepted", deliveryKey: `${installationId}:12345`, payload: { source: "sentry", event: "issue.created", installationId, project: "fluxora-test", issueId: "12345", title: "Issue [REDACTED]", level: "error" } });
  assert.equal(normalizeSentryIssueCreated(payload("resolved"), "issue", filter).kind, "ignored");
  assert.equal(normalizeSentryIssueCreated(payload("created", "other-project"), "issue", filter).kind, "ignored");
  assert.equal(normalizeSentryIssueCreated(payload(), "installation", filter).kind, "ignored");
  assert.throws(() => readSentryIssueCreatedFilter({ installationId: "bad", project: "fluxora-test" }));
});

test("Sentry refuses to persist a signing secret echoed in an identifier", () => {
  assert.throws(() => normalizeSentryIssueCreated(payload(), "issue", filter, "12345"), (error: unknown) => error instanceof Error && !error.message.includes("12345"));
});
