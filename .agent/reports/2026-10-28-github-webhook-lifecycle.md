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
authoritative result. The lifecycle is still not production-ready: no public
route/UI activation flow or live-provider qualification exists yet, and
uncertain operations still need operator-facing reconciliation before enabling
the feature.
