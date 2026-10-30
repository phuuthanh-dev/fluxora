# Task contract

## Identity

- Task ID: `2026-10-30-landing-relay-p2`
- Base commit: `820a2231c03948a8dbedd35674ebb2fdc0fbfb51`
- Working branch: `codex/landing-relay-p0`
- Implementer: Codex
- Reviewer: automated checks and project owner

## Outcome

Make the P0/P1 landing motion maintainable: explicit user-paced sample timing,
layout-effect-safe GSAP setup, cursor exit cleanup, and browser assertions that
cover motion enhancement, pause and reduced motion without weakening product
behavior tests.

## Target slice IDs

- `L12.3`

## Reopen justification

The owner explicitly requested P0–P2 of the 2026-10-30 Relay fidelity audit.
The revised acceptance boundary includes stability of the newly requested
cursor/rail choreography and a sample sequence readable under normal browser
rendering pressure.

## In scope

- Landing-only motion lifecycle and regression coverage.
- Human-readable sample-run pacing and test timing that reflects the intentional
  visual sequence rather than external provider latency.

## Explicitly out of scope

- Global GSAP defaults, a second ticker, provider calls, operating screens,
  deployment and CI timeout changes.

## Acceptance criteria

- [ ] Every new effect uses the landing's existing GSAP/Lenis ownership and
  cleans up on pause, preference change and route exit.
- [ ] The sample exposes its first active step to a visitor before continuing,
  without delaying reduced motion or contacting an API.
- [ ] Browser coverage protects the signal rail/footer semantics and reduced
  motion behavior.

## Required evidence

- Tests to add or update: sample replay timing and integration/footer motion
  coverage.
- Commands to run: task check, focused Playwright, code graph generation and
  the final repository verification.
- UI/manual proof: desktop cursor/product/rail and mobile footer review.

## Safety boundaries

- Do not use, print, commit, or request provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make provider calls.
