# One-time webhook secret contract

The owner selected a one-time display for a newly generated GitHub signing
secret. The authenticated creation/rotation response now uses `Cache-Control:
no-store`; later status reads do not return saved secrets. Security guidance
was aligned with this exception and the outdated connector-secret descriptions
were corrected.

For generic webhooks, official documentation describes differing approaches:
[n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
offers authentication including Header Auth;
[Make](https://help.make.com/webhook-triggered-ai-agent) allows an optional
user-chosen API key in a header; and
[Zapier](https://help.zapier.com/hc/en-us/articles/8496083355661-How-to-get-started-with-Webhooks-by-Zapier)
uses a unique hook URL that it treats as sensitive. These sources do not prove
that any of those platforms use the same one-time secret display policy.
Fluxora retains its existing generated header secret with one-time display,
which is an application choice, not a claim of exact provider parity.

Generic webhook copy now names the `x-workflow-secret` header instead of
instructing users to paste the secret into GitHub. The one-time display does
not recover a secret if its response is lost after the server commits.

`npm run verify` passed with 168 API, 19 web and 36 Playwright tests. The
generic-webhook browser test and copy change were added after that gate began;
the subsequently run focused Playwright suite passed 7 tests and the final
workspace typecheck passed. No real credentials or provider calls were used.
