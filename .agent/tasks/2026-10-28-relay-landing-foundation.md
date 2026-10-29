# Task contract

## Identity

- Task ID: `2026-10-28-relay-landing-foundation`
- Base commit: `6428264ce06b2c1bfa13402c1cd588f4d074a993`
- Branch: `codex/relay-landing-foundation`
- Implementer: Codex
- Reviewer: project owner

## Outcome

Ship a clean-room Fluxora public landing page at `/`, while preserving the
existing email/password and OAuth sign-in experience at `/login`. The landing
establishes reusable, accessible marketing-surface primitives without changing
the authenticated workflow application.

## Target slice IDs

- `LANDING-1`

## Scope and boundaries

- Treat the purchased Relay prompt as art direction only. Do not download,
  extract, copy, or commit Relay/Templify source, renderer, assets, or fonts.
- Provide a complete landing journey: product header, hero, concrete workflow
  preview, capability/use-case sections, safe/live execution distinction, and
  footer with clear sign-in calls to action.
- Keep the landing static: no provider requests, credential handling, or
  authenticated API calls.
- Move the existing login/register UI to `/login`; session-expiry and sign-out
  redirects must go to that route.
- Use existing semantic tokens/shared UI primitives where appropriate and add
  only Fluxora-owned CSS/SVG motion that respects reduced motion.

## Explicitly out of scope

- Importing any licensed Relay source into this public repository.
- Three.js, new runtime dependencies, telemetry, analytics, payment, signup
  policy changes, API changes, deployment, or live provider calls.
- Redesigning authenticated dashboard/editor/connector behavior in this slice.

## Acceptance criteria

- [ ] `/` renders an accessible, complete Fluxora landing without an
  authenticated API dependency.
- [ ] Primary landing actions route to `/login`; the existing login/register
  and OAuth controls remain functional there.
- [ ] Session-expiry/sign-out navigation routes to `/login`, never the public
  marketing root.
- [ ] The landing uses tokenized colors/type/motion and remains readable with
  reduced-motion enabled.
- [ ] Browser coverage proves the public journey and login route; no existing
  dashboard/editor regression is introduced.

## Required evidence

- Tests to add or update: focused Playwright landing/auth-route coverage.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-28-relay-landing-foundation.md`, `npm run codegraph:generate`, focused Playwright, `npm run verify`.
- UI/manual proof: local desktop inspection of `/` and `/login` in default and
  reduced-motion modes.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Produce a commit and report using `.agent/report-template.md`.
