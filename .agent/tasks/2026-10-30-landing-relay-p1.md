# Task contract

## Identity

- Task ID: `2026-10-30-landing-relay-p1`
- Base commit: `820a2231c03948a8dbedd35674ebb2fdc0fbfb51`
- Working branch: `codex/landing-relay-p0`
- Implementer: Codex
- Reviewer: automated checks and project owner

## Outcome

Complete the Relay-informed landing mid-page finish without adding fictional
product claims: integrations arrive as a compact signal rail, reliability
cards stage independently, and the existing Relay-adapted footer receives
bounded fine-pointer surface polish.

## Target slice IDs

- `L12.3`

## Reopen justification

The owner explicitly requested P0–P2 of the 2026-10-30 Relay fidelity audit
after reviewing the current landing. The latest completed landing slice has the
right semantic sections, but the requested mid-page choreography was not yet
implemented as a bounded, maintainable enhancement.

## In scope

- Landing-only integration rail and reliability-card entrances.
- Existing footer interaction polish using existing content and local artwork.
- Reduced-motion/pause-safe browser evidence.

## Explicitly out of scope

- New integrations, product claims, pricing, provider calls, deployment, or
  changes outside the public landing.

## Acceptance criteria

- [ ] Supported integrations remain readable without JavaScript and stage only
  with scoped, transform/opacity-based motion.
- [ ] Reliability cards do not compete with the measured statement docking
  geometry and each appears as a bounded surface.
- [ ] Footer preserves working public links and improves only on fine pointers.
- [ ] Pause and reduced-motion paths revert owned effects cleanly.

## Required evidence

- Tests to add or update: landing integration/footer pause and reduced-motion
  browser assertions.
- Commands to run: task check, focused Playwright, code graph generation and
  the final repository verification.
- UI/manual proof: 375px and 1440px integrations/reliability/footer review.

## Safety boundaries

- Do not use, print, commit, or request provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make provider calls.
- Keep Relay supplied artwork local and preserve its private provenance.
