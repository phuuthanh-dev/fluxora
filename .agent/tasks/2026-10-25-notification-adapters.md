# Task contract — notification adapters

## Identity

- Task ID: `2026-10-25-notification-adapters`
- Base commit: `85c52c874430d92dd801643b32e7a5444e4a0fc1`
- Working branch: `codex/notification-adapters`
- Implementer: Antigravity using Gemini 3.8 Flash (Medium reasoning)
- Reviewer: Codex

## Outcome

An owner configures distinct Google Chat, Discord, or Telegram action nodes, while the execution engine and approval delivery reuse one provider-neutral notification dispatcher with a redacted, consistent delivery result.

## In scope

- Introduce small, testable notification contracts and a dispatcher with provider adapters for Google Chat webhook, Discord webhook, and Telegram Bot API.
- Route the three existing Action nodes through that dispatcher without changing their node-specific editor UX.
- Return a normalized, persisted-safe delivery result: `delivered`, `provider`, `destination`, `messageId?`, and `sentAt`.
- Parse provider success responses where available (Telegram `message_id`; Discord webhook response only when the endpoint returns one).
- Add Discord `embeds` and safe-by-default `allowedMentions`; default to no parsed mentions when dynamic content is sent.
- Move Telegram `chatId` to node configuration as the destination; new credentials contain only `botToken`. Preserve already-saved legacy credential `chatId` only as a backwards-compatible fallback and document it as deprecated.
- Refactor approval notification delivery to use the dispatcher. Keep existing Google Chat and HTTP-webhook behavior working; add Discord and Telegram selection only if the current approval configuration model can express them without a broad redesign.
- Preserve SSRF rules, provider-specific Discord URL validation, 15-second timeout, retry classification, and secret redaction.
- Add focused unit/integration tests and mocked Playwright coverage for the normalized result and approval reuse.
- Update product/architecture/roadmap/loop docs, code graph if imports change, task report, and any migration only when required.

## Explicitly out of scope

- Email delivery, workflow succeeded/failed event-notification policies, notification preferences, retries beyond the existing execution retry policy, rate-limit scheduling, provider OAuth, real provider calls, or real credentials.
- Changing authentication, membership, generic HTTP behavior, queue architecture, deployment, CI secrets, or broad editor redesign.
- Merging or creating a pull request.

## Acceptance criteria

- [ ] The browser still exposes separate provider nodes; no generic notification node is introduced.
- [ ] Google Chat, Discord, and Telegram action execution call one dispatcher and return the normalized safe delivery result.
- [ ] Discord supports validated `content`, optional `embeds`, and a default-deny mention policy; Telegram uses a vault-only bot token and a node-level destination.
- [ ] Approval delivery uses the dispatcher and existing Google Chat/HTTP-webhook behavior remains covered.
- [ ] Adapter error paths preserve redaction, SSRF safety, timeouts, and retry classification.
- [ ] Unit/integration tests prove adapter request/result mapping and approval reuse; browser tests use mock transport only.
- [ ] `npm run verify` passes and the handoff report contains only verified Git SHAs.

## Required evidence

- Tests to add or update: notification adapter/dispatcher tests, approval notification tests, and focused Playwright mock coverage.
- Commands to run: `npm run codegraph:generate` when imports change, targeted tests, `npm run harness:report -- .agent/reports/2026-10-25-notification-adapters.md`, then `npm run verify`.
- UI/manual proof: explain node-specific configuration, normalized delivery result, and approval routing in the report.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a focused commit and a report using `.agent/report-template.md`.
