# Sentry and Vercel webhook candidate: coordinator audit

Candidate: `/private/tmp/fluxora-nx05-observability-20261102`, base `3c9ac35`.
Status: isolated and hard-disabled; not part of the current Fluxora runtime.
This is a source review, not an execution or live-provider qualification.

## Findings

1. **P1 — Personal Vercel events are rejected.** `observability-webhook-protocol.ts`
   requires `payload.team.id`, while the [Vercel event reference](https://vercel.com/docs/webhooks/webhooks-api#deployment.ready)
   explicitly says the team may be null. Its registration input also requires
   a team ID. Supporting personal scope needs a separately specified, signed
   owner/user identity and authorization check; treating a missing team as a
   wildcard would be unsafe. The fixture covers only a team-scoped event.
2. **P1 — The candidate does not integrate the current worker protocol.** Its
   outbox expects a queue generation/worker fence absent from the candidate's
   base and different from the coordinator's initial-only/approval nonce
   implementation. The candidate itself hard-disables dispatch. Copying the
   parser or opening its gates would not establish safe duplicate/restart or
   mixed-worker behavior.
3. **P1 — Credential locking is incomplete across the application.** The
   candidate documents that its advisory lock is not used by all credential
   mutation, publication and lifecycle paths. A successful resource check can
   therefore race with a change elsewhere; it is not an atomic guarantee.
4. **P2 — Retention is not production-ready.** Replay receipts retain related
   execution history indefinitely and block some deletion paths; cleanup and
   capacity handling can cause provider retries to expire. The candidate's own
   design describes the limit and unresolved tombstone/cleanup contract.
5. **P2 — Remote registration state is unknown.** Rotation and revocation are
   local changes only. There is no provider-side reconciliation; the UX must not
   imply that a remote hook has been registered, rotated, or deleted.

## Decision

Do not integrate the disabled candidate unchanged. Reuse its raw-body HMAC
requirements and provider distinctions only after the shared ingress, recovery,
worker cutover and deletion/retention contracts are reconciled. Prove provider
scope with representative synthetic payloads and qualify actual delivery only
after explicit user authorization. This review does not assert that the
candidate contains no other defects, and no tests were run in this review.
