# Task contract

## Identity

- Task ID: `2026-10-25-notifications-v1`
- Base commit: `00327983809af4c6a0f5dedb7429aa1b6dd48bff`
- Working branch: `codex/dashboard-regression`
- Implementer: Antigravity (Claude 3.7 Sonnet)
- Reviewer: Codex

## Outcome

Implement vertical slice L6.3 Notifications v1: add Discord Incoming Webhook and Telegram Bot API as executable Action nodes with encrypted credentials, safe expression interpolation, SSRF protection, secret redaction, transient retry handling, live-readiness enforcement, and clear node configuration UX.

## In scope

- Node types `@workflow/contracts`: `"action.discord.webhook"`, `"action.telegram.message"`.
- Credential providers in Prisma: `DISCORD_WEBHOOK`, `TELEGRAM_BOT`.
- Database migration for new credential providers.
- Credential vault and preset schemas:
  - Discord: `webhookUrl`
  - Telegram: `botToken`, `chatId`
- Backend execution in `execution.service.ts`:
  - Discord webhook action: mock and live execution, payload assembly (`content`, `username`, `avatar_url`), SSRF validation via `fetchSafeOutbound`, timeout (15s), retry classification (429, 5xx, timeout).
  - Telegram message action: mock and live execution, payload assembly (`chat_id`, `text`, `parse_mode`), URL formation (`/bot<token>/sendMessage`), SSRF validation, timeout (15s), token redaction in URLs and error messages, retry classification.
- Live readiness requirements for Discord and Telegram nodes in `live-readiness.ts`.
- Redaction enhancements in `redaction.ts` for Telegram bot token URLs and sensitive keys.
- Frontend editor and credentials:
  - Credential panel types, presets, and selector options for `DISCORD_WEBHOOK` and `TELEGRAM_BOT`.
  - Node catalog additions for Discord Webhook and Telegram Message under `action` category with `available: true`.
  - Inspector form controls in `workflow-editor.tsx` for Discord and Telegram nodes.
- Unit and integration tests for:
  - Request formation and payload assembly for Discord and Telegram.
  - Secret redaction (tokens in URLs and payloads).
  - Invalid configuration and credential error handling.
  - Transient retry classification (429, 5xx, network timeout vs 4xx).
  - Live readiness credential derivation.
- Playwright E2E browser tests using mocked HTTP endpoints verifying node configuration, credential association, and mock/live run output.
- Documentation updates: `docs/01-product-spec.md`, `docs/02-architecture.md`, `docs/04-roadmap.md`, `docs/06-loop-engineering.md`, and code graph if source imports change.
- Handoff report in `.agent/reports/2026-10-25-notifications-v1.md`.

## Explicit out of scope

- Real Discord or Telegram provider calls or real credentials.
- Modifying authentication, session handling, or membership logic.
- Arbitrary JavaScript evaluation or unsafe template execution.
- Production deployment, merging to main, or creating pull requests.

## Acceptance criteria

- [ ] Discord Webhook (`action.discord.webhook`) and Telegram Message (`action.telegram.message`) exist in `@workflow/contracts` and node catalog as available Action nodes.
- [ ] Prisma schema and migration add `DISCORD_WEBHOOK` and `TELEGRAM_BOT` to `CredentialProvider`.
- [ ] Discord credential schema (`webhookUrl`) and Telegram credential schema (`botToken`, `chatId`) are supported in vault and frontend credential panel.
- [ ] Message body supports safe expression interpolation (e.g. `{{ steps.trigger.output.name }}`).
- [ ] Outbound requests use SSRF protection (`fetchSafeOutbound`), 15s timeout, and classify 429/5xx/timeout as retryable.
- [ ] Telegram bot tokens are redacted from persisted output, URLs, and error messages.
- [ ] Live-readiness enforcement requires matching valid credentials before live execution or publishing.
- [ ] Node inspector provides intuitive configuration for Discord (content, username, avatar) and Telegram (chatId, text, parseMode) with credential pickers.
- [ ] Unit/integration tests cover request formation, redaction, retryability, invalid config, and live readiness.
- [ ] Playwright E2E test covers workflow creation, Discord/Telegram node configuration, credential creation/selection, and execution output using mocked HTTP.
- [ ] `npm run verify` passes completely.

## Required evidence

- Tests to add or update:
  - `apps/api/src/execution/notifications.test.ts` (unit tests for request formation, retry classification, redaction, invalid inputs).
  - `apps/api/src/execution/live-readiness.test.ts` (Discord and Telegram readiness requirements).
  - `apps/api/src/execution/redaction.test.ts` or `execution-foundations.test.ts` (token masking in URLs/payloads).
  - `e2e/notifications-v1.spec.ts` (Playwright E2E with mocked HTTP).
- Commands to run:
  - `npm run db:deploy`
  - `npm run db:generate`
  - `npm --prefix apps/api test`
  - `npm run typecheck`
  - `npm run codegraph:generate`
  - `npm run codegraph:check`
  - `npm run verify`

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
