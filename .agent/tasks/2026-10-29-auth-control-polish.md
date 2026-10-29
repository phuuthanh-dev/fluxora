# Task contract

## Identity
- Task ID: `2026-10-29-auth-control-polish`
- Base commit: `20d14e7917cb6880f7c823aa350c5c158322d417`
- Working branch: `codex/auth-and-control-polish`
- Implementer/reviewer: Codex

## Outcome
Refine login/register and the specific inspector/connection controls reported by the owner.

## Target slice IDs
- `L13.1`

## Reopen justification
The owner's 2026-10-29 screenshots after the product-experience slice show an oversized inspector title, native select arrows flush with the edge, and the new connection form below saved cards. The owner explicitly requests login/register refinement and creation directly below the toolbar. This changes the prior composition contract; it does not repeat completed dashboard or credential work.

## In scope
Shared authentication UI with /login and /register routes, password visibility and loading feedback, compact inspector typography, connection form order and shared native-select inset. Tests, screenshots and documentation.

## Explicitly out of scope
Authentication API semantics, provider calls, schemas, databases, landing choreography, CI/infra or deployment.

## Acceptance criteria
- [x] Both auth routes share a responsive theme-aware form, accessible password visibility and truthful provider/pending states.
- [x] Connection creation opens below the toolbar and above saved connections, including in the editor manager.
- [x] Inspector heading is proportionate and select arrows have consistent right padding without replacing native interaction.
- [x] Focused regressions, visual review and npm run verify pass; commit and integrate into local develop only.

## Required evidence
Synthetic E2E for auth navigation/password/pending states, form position and native-select inset; desktop/mobile light/dark screenshots; full quality gate and report.

## Safety boundaries
No production data, real credentials, external provider calls, push, PR or deployment. Reuse shared components, font/theme tokens and GSAP lifecycle. Preserve existing credential payloads and auth behavior.
