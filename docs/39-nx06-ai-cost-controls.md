# NX-06 AI capabilities and cost-control boundary

Gemini Generate Content and OpenAI Responses receive the existing graph's
`maxOutputTokens` (default 1,024) as the provider output limit. The prompt is
limited to 100,000 JavaScript UTF-16 code units, the output limit to 1–8,192
and the timeout to 1–120 seconds. A provider response body is bounded to one
million bytes and extracted text to 100,000 characters. These are per request,
not per workflow, workspace, user, billing account, or month. OpenAI counts
reasoning tokens in `max_output_tokens`; Gemini documents a similar combined
output/thinking limit for its current thinking models. Low values can yield an
incomplete response. Gemini candidate output and thinking usage are separate;
OpenAI's output usage includes reasoning. Counts are returned only when present
and valid; missing usage is not zero.

The operator can set `AI_MAX_OUTPUT_TOKENS` on **every API and worker process**
to an integer from 1 to 8192. The default ceiling is 8192. Invalid values fail
AI requests closed. A node value above the ceiling, including the legacy default
of 1024 when the ceiling is lower, fails before credentials or provider dispatch;
it is never silently clamped. Apply the same value across all running workers
and drain old workers before relying on a newly reduced limit. The editor states
that a lower operator ceiling may apply; the failure gives the actual ceiling.
The setting applies to both test and live node execution and to the server-side
generation helpers. It does not modify saved or published graph JSON.

Each node invocation issues at most one generation request in the production
transport: unsafe redirects are rejected and provider, transport, timeout,
response, and schema failures do not cause an automatic generation retry,
including 429. This is not a global request quota or exactly-once guarantee:
multiple nodes, runs, manual retries, external clients, a process crash, or
concurrent/old deployments can result in additional calls. A timeout or failed
response can still have been processed and billed; check provider usage before
manually rerunning. Model-list discovery is a separate read, not generation.

A token or request limit is **not a monetary cap**. Input, reasoning, pricing,
model choice, separate executions and other account usage affect charges. This
implementation has no pricing catalog, account spend feed, atomic reservation,
or reconciliation of ambiguous/late provider charges. Operators needing a
monetary boundary must configure and monitor the provider's own organization,
project or billing controls, understand their provider-specific enforcement and
lag, and prevent ungoverned usage of those credentials. A Fluxora-enforced spend
cap would require authoritative pricing/account integration and concurrency-safe
reservations/reconciliation; it is not implemented here. OpenAI documents a
hard spend limit separately from alerts. Gemini's project cap is experimental
and can overrun during billing delay; availability varies by billing account.

Model discovery does not prove an ID supports the selected API or JSON schema.
For structured output, the connector sends the configured schema, validates the
returned JSON locally, and reports provider rejection without retry; unknown IDs
are not labeled compatible. Gemini 2.0 structured output is explicitly blocked
by this connector because Google requires `propertyOrdering` and this connector
does not yet construct it; the provider itself does support that capability with
the requirement. Other models and custom IDs are decided by the provider, not
by name-prefix guesses. Mock output checks local schema syntax and represents no
provider capability, availability, semantic quality or price guarantee.

References, consulted 2026-11-03:

- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI spend limits](https://developers.openai.com/api/docs/guides/rate-limits#spend-limits)
- [Gemini Generate Content structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Gemini Generate Content thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- [Gemini billing and spend caps](https://ai.google.dev/gemini-api/docs/billing)

Draft only: no provider calls or qualification, tests, build, typecheck or
verification were run for this worktree.
