# GitHub webhook adapter bootstrap repair

## Outcome

Deploy run `40696163966` failed after migration because Nest reflected the
`typeof fetch` parameter of `GitHubWebhookAdapter` as `Object`, which had no
provider. The adapter now consumes an explicit fetch-provider token and the
production module graph can construct it.

## Commit and scope

Pending commit on `codex/fix-github-webhook-adapter-di`. The change is limited
to the GitHub webhook HTTP transport binding, a no-I/O application-bootstrap
regression test, and delivery-state records. It does not call GitHub or read a
credential.

## Acceptance criteria

- Nest resolves `GitHubWebhookAdapter` through `AppModule` without external I/O.
- Adapter unit tests retain deterministic injected transport.
- Full repository verification passes.

## Validation receipts

- Focused API bootstrap/adapter tests: 8/8 passed.
- `npm run verify`: API 203/203, web 22/22, Playwright 40/40 passed.
- `git diff --check` passed.

## Files changed

- `apps/api/src/webhooks/github-webhook-adapter.ts`
- `apps/api/src/webhooks/webhook.module.ts`
- `apps/api/src/app-bootstrap.test.ts`
- Delivery ledger, state gate, task contract, and this report.

## Risks and follow-up

No local test can prove the already-failed VPS deployment recovered. Review,
merge, and the automatic immutable-image deploy must show API/worker health
before production is considered restored. The existing database backup was
created by the failed deployment; no rollback or VPS mutation was made here.
