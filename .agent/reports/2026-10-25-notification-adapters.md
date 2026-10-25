# Agent handoff report

## Outcome

- Status: `complete`
- One-sentence result: Unified Google Chat, Discord, Telegram, and approval HTTP webhooks behind a provider-neutral notification dispatcher and adapter architecture returning normalized, persisted-safe delivery results while preserving distinct UI nodes, vault-only secrets, strict destination sanitization, and explicit ok:true 2xx response validation.

## Commit and scope

- Base commit: `85c52c874430d92dd801643b32e7a5444e4a0fc1`
- Implementation commit(s):
  - `4d92fd80a4c4409e7c022a3b496eb6dbf9fafbd1`
  - `af794d4c9634f7683beec7e5580dbe5b50310152`
  - `a0d221746d5d9a484a5838e08e9c6de7e9558095`
- Branch: `codex/notification-adapters`
- Scope respected: `yes` — Separate UI nodes preserved; provider-neutral notification contracts, dispatcher, and adapters introduced; normalized safe delivery result returned; HTTP webhook destination strictly sanitized (no credentials, queries, fragments, or API keys in result/persisted output); Telegram only returns delivered:true on explicit ok:true (malformed JSON, empty {}, and ok:false fail safely without leaking tokens or provider description); approval notifications routed through dispatcher; no email, OAuth, queue, CI, or deployment changes.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Separate provider nodes in UI; no generic node | Preserved `action.google-chat.webhook`, `action.discord.webhook`, and `action.telegram.message` in `apps/web/src/features/workflow/node-catalog.ts` and `workflow-editor.tsx`. | pass |
| Google Chat, Discord, and Telegram action execution call one dispatcher and return normalized safe delivery result | `executeGoogleChatWebhook`, `executeDiscordWebhook`, and `executeTelegramMessage` delegate to `defaultNotificationDispatcher.dispatch(...)` and return `{ delivered, provider, destination, messageId?, sentAt, mode }`. Covered in `apps/api/src/execution/notifications.test.ts`. | pass |
| Discord supports validated `content`, optional `embeds`, and default-deny mention policy; Telegram uses vault-only bot token and node-level destination | Discord adapter sets `allowed_mentions: { parse: [] }` by default and validates JSON array embeds; Telegram adapter prioritizes node `chatId` destination and supports vault-only `botToken`. Tested in `notifications.test.ts`. | pass |
| Telegram only returns delivered:true on explicit ok:true; malformed JSON, empty {}, or ok:false fail safely | Telegram adapter enforces `!response.ok || !json || json.ok !== true`, mapping retryability from error_code/status while never exposing tokens or provider description. Regression tests in `notifications.test.ts` verify 200 + malformed JSON, 200 + {}, and 200 + ok:false. | pass |
| Approval delivery uses the dispatcher and existing Google Chat/HTTP-webhook behavior remains covered | `ExecutionService.notifyApproval` routes both Google Chat and HTTP webhook approvals through `defaultNotificationDispatcher.dispatch(...)` without broadening approval UI options. Integration tests in `notifications.test.ts` prove delegation and payload formation. | pass |
| Adapter error paths preserve redaction, SSRF safety, timeouts, and retry classification | Outbound requests use `fetchSafeOutbound` with 15s timeout; Discord URL validation rejects non-official hosts/paths without leaking credentials; Telegram errors redact bot tokens; 429/5xx classified as retryable, 4xx non-retryable. Tested in `notifications.test.ts`. | pass |
| Unit/integration tests prove adapter request/result mapping and approval reuse; browser tests use mock transport only | `apps/api/src/execution/notifications.test.ts` passed 79 tests (including regression tests for query API keys, 200 `ok: false`, 200 malformed JSON, 200 `{}`, and approval delegation); `e2e/notifications-v1.spec.ts` and all 10 Playwright tests passed using deterministic mock transport. | pass |
| `npm run verify` passes and the handoff report contains only verified Git SHAs | Full quality gate (`harness:check`, `db:validate`, `db:generate`, `test`, `lint`, `typecheck`, `build`, `test:e2e`) passed with zero errors; commits verified with `git rev-parse --verify`. | pass |

## Validation receipts

| Command | Result | Relevant output or artifact |
|---|---|---|
| `npm run codegraph:generate` | pass | Wrote `docs/11-code-graph.json` |
| `npm run codegraph:check` | pass | Code graph check passed cleanly |
| `npm --prefix apps/api test` | pass | 82 tests, 79 passed, 3 skipped (Redis integration) in 1623ms |
| `npm run typecheck` | pass | Zero TypeScript compiler errors across `@workflow/api`, `@workflow/web`, and `@workflow/contracts` |
| `npx playwright test e2e/notifications-v1.spec.ts` | pass | 1 passed (1.5s) |
| `npx playwright test` | pass | 10 passed across all 4 test suites (10.7s) |
| `npm run verify` | pass | All gates passed (`harness:check`, `db:validate`, `db:generate`, `test`, `lint`, `typecheck`, `build`, `test:e2e`) |
| `npm run harness:report -- .agent/reports/2026-10-25-notification-adapters.md` | pass | Format and length valid (< 12,000 characters) |

## Files changed

- `apps/api/src/execution/node-failure.ts`: Extracted `NodeFailure` error class and `nodeFailureFromOutboundPolicy` helper for shared use by execution and notification adapters.
- `apps/api/src/notifications/notification-contracts.ts`: Provider-neutral interfaces and types (`NotificationProvider`, `NotificationPayload`, `NormalizedDeliveryResult`, `NotificationAdapter`, `DiscordAllowedMentions`).
- `apps/api/src/notifications/google-chat.adapter.ts`: Google Chat incoming webhook adapter with stripped-secret destination masking and response message ID parsing.
- `apps/api/src/notifications/discord.adapter.ts`: Discord webhook adapter with strict URL validation, token-masked destination, embeds parsing, default-deny allowed mentions (`{ parse: [] }`), and response ID parsing.
- `apps/api/src/notifications/telegram.adapter.ts`: Telegram Bot API adapter with node-level destination priority, vault-only bot token, legacy credential fallback, token redaction in errors, `message_id` response parsing, and explicit `ok: true` enforcement (safely rejecting 2xx with malformed JSON, empty `{}`, or `ok: false` without leaking tokens or provider descriptions).
- `apps/api/src/notifications/http-webhook.adapter.ts`: HTTP webhook adapter for approval requests with authenticated headers/query-params, guaranteed destination sanitization (stripping username, password, query parameters, fragments, API keys, and unparseable input).
- `apps/api/src/notifications/notification-dispatcher.ts`: Central notification registry and dispatcher routing payloads to provider adapters.
- `apps/api/src/notifications/index.ts`: Public module barrel export.
- `apps/api/src/execution/execution.service.ts`: Replaced bespoke webhook handling with `defaultNotificationDispatcher.dispatch(...)` for `executeGoogleChatWebhook`, `executeDiscordWebhook`, `executeTelegramMessage`, and `notifyApproval` (preserving Google Chat and HTTP webhook approval formats).
- `apps/api/src/execution/notifications.test.ts`: Added tests for Google Chat adapter, Discord embeds/mention policies, Telegram vault-only credentials and destination handling, dispatcher routing, HTTP query API key sanitization, Telegram 200 `ok: false`, 200 malformed JSON, 200 `{}`, and approval webhook delegation.
- `apps/web/src/features/credentials/credential-panel.tsx`: Updated Telegram preset to vault-only `{"botToken": ""}` with guidance noting node-level destination and deprecated credential fallback.
- `apps/web/src/features/workflow/workflow-editor.tsx`: Added optional embeds JSON field to Discord inspector; updated Telegram destination label.
- `apps/web/src/features/workflow/node-catalog.ts`: Added `embeds: ""` to default Discord configuration.
- `docs/02-architecture.md`: Documented notification dispatcher and adapter architecture.
- `docs/04-roadmap.md`: Updated Phase 2 with notification adapters slice.
- `docs/06-loop-engineering.md`: Added L6.4 Notification adapters entry marked Complete locally.
- `docs/11-code-graph.json`: Regenerated code graph including new notification module nodes and edges.
- `e2e/notifications-v1.spec.ts`: Updated Telegram credential preset hint expectation and asserted normalized result structure.

## Risks and follow-up

- Legacy Telegram credentials: Saved credentials containing `chatId` continue to work via fallback, but documentation encourages configuring destination on the node for multi-chat flexibility.
- Discord rate limits: Discord enforces channel-level rate limits (5 requests per 2 seconds); transient retries handle 429 responses, but application-level rate scheduling can be considered in Phase 3.
- Approval provider options: Approval node UX currently supports `google_chat` and `http_webhook` (and now dispatcher-ready for `discord` and `telegram` if extended in the approval UI).

The reviewer must inspect the commit diff and independently verify critical tests. This report is not proof by itself.
