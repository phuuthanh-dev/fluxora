# Task contract

## Identity

- Task ID: `2026-10-30-landing-relay-p0`
- Base commit: `820a2231c03948a8dbedd35674ebb2fdc0fbfb51`
- Working branch: `codex/landing-relay-p0`
- Implementer: Codex
- Reviewer: automated checks and project owner

## Outcome

Correct the public landing's immediately visible Relay-fidelity regressions:
the unreadable lime Product surface, permanently-heavy navigation, and flat hero
stage. Add fine-pointer-only cursor/hero depth without changing Fluxora's
truthful copy or product behaviour.

## Target slice IDs

- `L12.3`

## Reopen justification

The owner supplied a concrete screenshot on 2026-10-30 showing the Product
intro on lime with insufficient text contrast, then explicitly requested P0 of
the Relay fidelity audit. The latest L12.3 delivery implements the section
structure but not the requested fixed/transparent navigation transition,
source-style hero depth, or cursor treatment. This is a specific visual
regression/changed acceptance requirement, not a reimplementation of the
completed landing.

## In scope

- Landing-only navigation state, hero fine-pointer depth, and cursor ring.
- Correct Product foreground/background contrast and preserve the bounded
  frosted slab/ribbon contract.
- Landing-focused browser assertions and visual evidence.

## Explicitly out of scope

- Relay branding/copy/pricing/claims, provider calls, product-route motion,
  deployment, remote push, and importing unreviewed vendor assets.

## Acceptance criteria

- [ ] Product heading, copy, tabs, and panel remain readable on every
  background state; the lime treatment is an accent, never a low-contrast
  reading surface.
- [ ] Navigation starts visually light over the hero, becomes a bounded frosted
  plate only after scrolling, and remains keyboard/mobile usable.
- [ ] Fine desktop pointers get bounded hero depth and a cursor ring; touch,
  reduced-motion and no-JS paths receive neither.
- [ ] All additions clean up on pause, preference change and route exit.

## Required evidence

- Tests to add or update: landing nav/hero/motion and contrast assertions.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-30-landing-relay-p0.md`, focused Playwright, `npm run codegraph:generate`, `npm run verify`.
- UI/manual proof: desktop top/scrolled nav, product section, and 375px landing screenshots.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
