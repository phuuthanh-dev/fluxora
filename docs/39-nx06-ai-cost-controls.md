# NX-06 AI capabilities and cost-control boundary

## Release and verification status — 2026-11-05

The per-request controls, structured-output handling and provider usage fields
described below are present in the source deployed through
[PR #88](https://github.com/phuuthanh-dev/fluxora/pull/88). The PR and main
quality gates and deployment passed; this does not establish real-provider
spending behavior or prove every model accepts a schema. See the current
[NX audit](37-node-expansion-audit.md) for verification scope and the two local
Playwright timeouts. The monetary limit described below is **not implemented by
Fluxora**.

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

The editor retains an explicitly cleared or zero numeric field instead of
silently replacing it with the default. For AI output tokens, it also shows an
inline warning; the backend remains authoritative and rejects invalid limits
before reading a credential or calling a provider. An omitted field in an older
graph still receives its historical default.

The operator can set `AI_MAX_OUTPUT_TOKENS` on **every API and worker process**
to an integer from 1 to 8192. The default ceiling is 8192. Invalid values fail
AI requests closed. A node value above the ceiling, including the legacy default
of 1024 when the ceiling is lower, fails before credentials or provider dispatch;
it is never silently clamped. Apply the same value across all running workers
and drain old workers before relying on a newly reduced limit. The editor states
that a lower operator ceiling may apply; the failure gives the actual ceiling.
The setting applies to both test and live node execution and to the server-side
generation helpers. It does not modify saved or published graph JSON.

The optional `AI_MAX_PROMPT_CHARACTERS` setting caps each prompt at 1–100000
JavaScript UTF-16 code units, defaulting to 100000 for existing deployments.
An invalid setting fails closed and an oversized prompt is rejected rather than
truncated, before the credential is read or a generation request is sent.
Set the same value on all API and worker processes and drain old workers before
relying on a change. This is a size bound, not a token count or spending cap.
When an operator runs the local production environment validator, it now checks
these optional variables against the same ranges, including rejecting an
explicitly empty value. The deploy script does not automatically invoke this
validator. It does not validate a running process or guarantee all workers
actually received the same value. The validation test passed in the isolated
full quality gate for snapshot `388ac7b`.

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
reservations/reconciliation; it is not implemented here. [OpenAI project limits](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)
distinguish alerts from an explicitly enabled hard limit, and note that
enforcement can lag. [Gemini project caps](https://ai.google.dev/gemini-api/docs/billing#project-spend-caps)
are experimental and can overrun during billing delay; availability varies by
billing account. Neither control is configured or verified by Fluxora.

Model discovery does not prove an ID supports the selected API or JSON schema.
Google now limits Gemini 2.5 access based on prior usage; its
[Gemini 2.5 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash)
reports that restriction, while listing the stable model as still served. New
Gemini nodes start with no model selected and ask the user
to select or enter one for their own project. Saved graphs keep their existing
model, and a model list is not proof of generation access. Gemini 404 responses
now suggest checking the model and project access; they are not retried.
Google's [Gemini 2.0 Flash page](https://ai.google.dev/gemini-api/docs/models/gemini-2.0-flash)
lists that model as shut down. These are provider statements consulted on
2026-11-05, not proof of access for any specific project.
For structured output, numeric JSON values that cannot be preserved through
JavaScript's JSON number representation now fail with `INVALID_STRUCTURED_OUTPUT`
instead of silently passing a rounded value to another node. This intentionally
changes existing structured-output behavior: affected workflows take their error
branch and a manual retry can incur another charge. Use schema strings for exact
high-precision values. This check compares decimal JSON round trips, not exact
binary floating-point arithmetic; ordinary decimals such as `0.1` are accepted.
Node 22's JSON reviver source is required; no structured result is accepted if
its numeric source is unavailable. No real provider has been tested for this change.

For structured output, the connector sends the configured schema, validates the
returned JSON locally, and reports provider rejection without retry; unknown IDs
are not labeled compatible. Gemini 2.0 structured output is explicitly blocked
by this connector because Google requires `propertyOrdering` and this connector
does not yet construct it; the provider itself does support that capability with
the requirement. Other models and custom IDs are decided by the provider, not
by name-prefix guesses. Mock output checks local schema syntax and represents no
provider capability, availability, semantic quality or price guarantee.

The OpenAI connector also treats a response containing both text and a refusal
as a non-retryable `PROVIDER_REFUSAL` in plain-text mode, as it already did for
structured output. Previously a plain-text workflow could receive partial text
as success and continue to later nodes; this intentional safety correction can
instead take its error branch. The refusal text and partial content are not
stored in the error. Regression coverage passed in the isolated full quality
gate for snapshot `388ac7b`. OpenAI documents refusals as a distinct
response content type; this policy is Fluxora's handling of a mixed response.

References, consulted 2026-11-03:

- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI spend limits](https://developers.openai.com/api/docs/guides/rate-limits#spend-limits)
- [Gemini Generate Content structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Gemini Generate Content thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- [Gemini billing and spend caps](https://ai.google.dev/gemini-api/docs/billing)

Provider qualification and actual spending behavior remain unverified. The
quality-gate and production-release evidence, including its limits, is tracked
in [the NX audit](37-node-expansion-audit.md).
