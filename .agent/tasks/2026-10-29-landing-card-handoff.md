# Task contract

## Identity
- Task ID: `2026-10-29-landing-card-handoff`
- Base commit: `f22297b56262a6def1c772c948e3695dd82ed3c3`
- Working branch: `codex/landing-card-handoff` (local only)
- Implementer: Codex, current session model
- Reviewer: Codex evidence review, owner visual acceptance

## Outcome
One continuous scroll-controlled lime statement card grows, collapses to a
Fluxora badge and docks into the existing reliability app diagram.

## Target slice IDs
- `L12.3`

## Reopen justification
The owner's new three-state brief and five Relay screenshots identify a concrete
missing behavior: LandingStatement only scales X 0.76–1 and rotates; its badge
and LandingReliability's center are independent, with no pinned collapse or
docking. The owner confirmed implementation after the source/browser audit.
This is a bounded correction, not a repeat of the completed landing/ribbon work.

## In scope
- Statement/reliability choreography, measured responsive docking and fallback.
- Reuse GSAP/ScrollTrigger and the existing landing pause preference.
- Focused browser regression, temporal recording, docs and code graph.

## Explicitly out of scope
- Provider/runtime/database changes, new integrations, ribbon redesign.
- Push, PR, merge, production deployment or copied template assets.

## Acceptance criteria
- [x] A: initial dark Fluxora icon with lime outline opens into a readable lime
  plate and holds. Owner clarified this with an additional screenshot during
  implementation; copy/grid reveal only as the plate opens.
- [x] B (0.4–0.7): copy/grid fade, plate collapses, badge remains legible.
- [x] C (0.7–1): same visible badge docks precisely in the existing diagram.
- [x] Reverse scroll retraces the transition without duplicate visible nodes.
- [x] Resize/deep reload, mobile and native no-WebGL scrolling remain correct.
- [x] Pause/reduced motion/no-JS show readable static sections; route cleanup.

## Required evidence
- Tests: geometry/opacity at scroll checkpoints, reverse, resize, fallback.
- Commands: agent:task:check, codegraph:generate, focused E2E, npm run verify.
- UI/manual proof: desktop/mobile screenshots and a forward/reverse recording.

## Safety boundaries
- Read repository operating docs; no provider credentials or external calls.
- Commit only locally after the quality gate; preserve main/develop policy.
- Update the generated graph and produce a factual report.
