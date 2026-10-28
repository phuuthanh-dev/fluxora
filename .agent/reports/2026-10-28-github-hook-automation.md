# GitHub-managed webhook work in progress

Compared against [n8n's GitHub trigger lifecycle](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Github/GithubTrigger.node.ts), [Make's GitHub connection guidance](https://apps.make.com/github), and [GitHub's repository webhook API](https://docs.github.com/en/rest/repos/webhooks). The existing Fluxora manual registration remains the only user-facing path.

Implemented a narrow provider lifecycle interface and a GitHub adapter with fixed API host, HTTPS callback validation, bounded events and IDs, no provider-body logging, and explicit uncertain write outcomes. A GitHub 404 is not treated as proof that a webhook was removed. Five mocked adapter tests and the full quality gate passed (173 API tests and 38 browser tests); no live provider requests were made.

Not implemented: persistence of provider hook identity and durable operation state, safe reconciliation after timeouts or process restarts, coordinated version/rotation/deactivation lifecycle, activation and editor UI, migrations, and live acceptance. The adapter is not wired into the running application. Do not treat this slice as completed or deploy it as automatic webhook support.

The unfinished adapter now has a read-only inspection operation for a previously recorded hook ID. It compares callback URL and event against expected values and returns only match flags and active state, so provider URLs or response bodies are not surfaced. Invalid or mismatched responses are errors; inspection cannot verify a signing secret, establish ownership by URL, or prove that a 404 means deletion. The adapter is still not wired to a user-visible lifecycle.

On the inspection follow-up, the full `npm run verify` passed with 175 API tests and 38 Playwright tests. All provider responses in these tests were mocked; no webhook was created or changed on GitHub.
