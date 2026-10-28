# GitHub-managed webhook work in progress

Compared against [n8n's GitHub trigger lifecycle](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Github/GithubTrigger.node.ts), [Make's GitHub connection guidance](https://apps.make.com/github), and [GitHub's repository webhook API](https://docs.github.com/en/rest/repos/webhooks). The existing Fluxora manual registration remains the only user-facing path.

Implemented a narrow provider lifecycle interface and a GitHub adapter with fixed API host, HTTPS callback validation, bounded events and IDs, no provider-body logging, and explicit uncertain write outcomes. A GitHub 404 is not treated as proof that a webhook was removed. Five mocked adapter tests and the full quality gate passed (173 API tests and 38 browser tests); no live provider requests were made.

Not implemented: persistence of provider hook identity and durable operation state, safe reconciliation after timeouts or process restarts, coordinated version/rotation/deactivation lifecycle, activation and editor UI, migrations, and live acceptance. The adapter is not wired into the running application. Do not treat this slice as completed or deploy it as automatic webhook support.
