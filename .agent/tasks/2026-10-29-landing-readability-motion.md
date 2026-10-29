# Task contract

## Identity
- Task ID: `2026-10-29-landing-readability-motion`
- Base commit: `62a9057767b25e0fbb15f44392b2f5647119b776`
- Working branch: `codex/landing-readability-motion` (local)
- Implementer: Codex
- Reviewer: automated gate and owner visual acceptance

## Outcome
Readable homepage typography, a clearer footer and shared GSAP section reveals.

## Target slice IDs
- `L12.3`
- `L6.1`

## Reopen justification
Owner identified 8–13px public copy and requested larger type, improved section
animation and more GSAP. This revises readability and entrance motion only;
the completed ribbon and icon-to-diagram handoff are retained.
The owner also explicitly requested installation/configuration of the official
GreenSock skills for Codex and this repository during implementation. Reopen
L6.1 only for pinned skill distribution, discovery and project usage guidance.

## In scope
- Homepage type roles, footer, reusable GSAP section reveals, FAQ entrance.
- Pause/reduced-motion/SSR fallback, regression and visual recording.
- Eight official GSAP skills, provenance/license and repository usage rules.
- Synchronize existing template/navigation and notification node-selection
  E2E steps if needed for the gate, preserving runtime and success assertions.

## Explicitly out of scope
- Providers, database, production deployment, push and PR.

## Acceptance criteria
- [x] Public prose is at least 15px, primary FAQ copy 16px or larger.
- [x] Section labels/footer metadata are at least 12px.
- [x] GSAP replaces the existing section reveal rather than stacking engines.
- [x] Pause, reduced motion, no-JS and route cleanup preserve readable content.
- [x] Responsive layout and existing handoff remain correct.
- [x] Eight official skills installed globally/project-locally, with pin,
  license, selection guidance and the skill-driven cleanup correction.

## Required evidence
- Focused landing/browser tests, screenshots and temporal recording.
- Code graph, full npm run verify, factual report.

## Safety boundaries
- Local-only commits after gate, no credentials or provider requests.
