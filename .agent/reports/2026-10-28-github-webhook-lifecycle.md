# GitHub provider-managed webhook lifecycle

This slice adds the server-side lifecycle groundwork for provider-managed GitHub
webhooks. It persists a workflow-version/endpoint/credential registration with
encrypted signing material, reserves it under the workflow row lock, claims
create and delete operations with compare-and-set transitions, records
definitive versus uncertain outcomes, and marks stale in-flight operations
uncertain after restart. Deletion uses only the recorded provider identity and
requires a matching metadata inspection before sending DELETE. Recovery is
disabled unless `GITHUB_WEBHOOK_AUTOMATION_ENABLED=true` and never guesses that
an ambiguous provider result succeeded.

Workflow draft save and publish now use the same workflow row lock as managed
webhook reservation. Publish rereads the draft after acquiring the lock and
rejects a workflow that already has a provider-managed registration, preventing
a remote registration from silently pointing at an obsolete published version.

Focused publish tests passed (4/4). An isolated PostgreSQL concurrency check
confirmed that concurrent draft save and publish complete without deadlock or a
lost successful save. The final isolated quality gate passed: 195 API tests,
19 web tests, 38 Playwright tests, and the onboarding publish scenario. The gate used a fresh
database with all migrations applied; no live GitHub request, real provider
credential, production database, or deployment was used.

One earlier localhost gate produced a publish 500 because the already-running
local database did not contain the new provider registration table. That stale
environment is not final evidence; the isolated migrated gate is the
authoritative result. The lifecycle is still not production-ready: live-provider
qualification and operator-facing reconciliation for uncertain operations
remain open.

## Management surface follow-up

The lifecycle is now composed by `GitHubWebhookManagementService` and exposed
through owner-scoped `GET`, `POST`, and `DELETE`
`/workflows/:workflowId/provider-webhook` routes. The editor shows a compact
connection status and keeps manual endpoint instructions as a fallback. The
safe response excludes tokens, signing secrets, callback URLs, and remote hook
IDs. Production startup requires `PUBLIC_API_ORIGIN` when
`GITHUB_WEBHOOK_AUTOMATION_ENABLED=true`; the flag remains false by default.

This follow-up is not a live-provider qualification: tests use a mocked adapter
and no real GitHub request or deployment was performed. Uncertain states remain
blocked until a reconciliation action is designed and qualified.

Follow-up verification passed after applying the pending local migration:
198 API tests, 19 web tests, 38 Playwright tests, API/web production builds,
security scan, deployment contract checks, and code-graph freshness checks.
