# Agent Current State Gate

This file is the compact, machine-checked handoff point for the next coding
loop. It prevents an agent from proposing implementation work that is already
complete in the delivery ledger.

## How to use it

Before planning or proposing a goal, run:

```bash
npm run agent:state
```

Before handing a new task to an implementer, add the target IDs to the task
contract and run:

```bash
npm run agent:task:check -- .agent/tasks/<task>.md
```

The completed L0–L11.5 rows in `docs/06-loop-engineering.md` are closed for
new implementation. Reopening one requires an explicit `## Reopen
justification` section in the task contract with a concrete regression,
security finding, or changed requirement.

## Last audited repository state

The table and individual slice notes below are historical snapshots, not the
current deployment state. PR #31 merged and deployed as `16d53a5`; the two
production migrations noted in the earlier slices were applied. A GitHub Push
trigger-only live qualification succeeded on 2026-10-28. Consult the latest
slice report and verify the current Git/GitHub state before planning work.

The application-bootstrap repair merged as PR #35 and production deploy run
`40703958116` completed with healthy API and web readiness. This is deployment
evidence only; it does not substitute for future provider-specific smoke tests.

| Field | Value |
|---|---|
| Local base commit | `6565a3c` (subsequent changes are on `codex/webhook-registration-ux`) |
| Release PR | `#27` — merged |
| Quality gate | See individual slice reports; local verification includes pre-existing, uncommitted CI changes |
| Source tree | Current branch contains the GitHub Create Issue/idempotency, Add Label, Add Comment, Merge Pull Request operations, and the signed GitHub Issue opened, Pull request opened, Push, and Workflow run completed triggers |
| Uncommitted changes | Existing OPS edits are preserved separately; the local CI correction passed verification and still needs GitHub review |

## Closed follow-up slices

- `P2-1` — GitHub connector vertical slices complete locally through the current acceptance boundary: separate encrypted connector credential, mock/live-guarded Create Issue, readiness, retry/error classification, idempotency, Add Label, Add Comment, Merge Pull Request, Issue opened, Pull request opened, Push, and Workflow run completed. No real provider smoke is implied; that remains owner-approved external validation.
- `WEBHOOK-REG-1` — Per-workflow GitHub signing secrets and compact editor guidance implemented locally; `npm run verify` passed (154 API, 19 web, 30 Playwright). Migration has not been applied and real delivery remains unverified.
- `GH-UX-2` — Bounded GitHub repository pagination, manual/expression fallback, and recoverable picker states implemented locally; `npm run verify` passed with 31 Playwright tests. Provider calls in tests were mocked.
- `OPS-2` — Status-based saved views scoped to user/workspace, server-side triage and retention policy visibility implemented locally. Full quality gate passed; both new migrations were applied to an isolated fresh PostgreSQL database and an isolated synthetic upgrade from `6565a3c`. Workflow, date, and mode filters remain future extensions; production migration and live validation are outstanding.
- `GOOGLE-UX-1` — Google Sheets and Drive text-file pickers use an owner-scoped server proxy. On 2026-10-28, the owner-approved configured Google OAuth connection loaded 20 spreadsheets and 100 Drive files without opening or modifying files; refresh expiry and write semantics remain unverified. See `.agent/reports/2026-10-28-google-oauth-live.md`.
- `GH-HARDEN-1` — Signed GitHub setup pings are acknowledged without running inactive workflows; repeated deliveries use registration-scoped delivery IDs. Full gate passed with mocked providers. Deduplication is bounded by execution retention and is not replay protection: the delivery header is not covered by the body HMAC.
- `WEBHOOK-VERSION-UX-1` — Registration UI uses the published trigger, warns about endpoints pinned to older versions, and blocks registration for unpublished triggers. Full gate passed with 35 Playwright tests and mocked providers.
- `WEBHOOK-ATOMIC-1` — Registration writes and audit writes share a database transaction; a synthetic PostgreSQL test confirms an audit error rolls back secret rotation. The full gate passed. A lost response after a successful commit can still require another rotation.
- `WEBHOOK-UNCERTAIN-UX-1` — An unsuccessful registration request clears the previously displayed secret, reloads endpoint status, and warns of an uncertain outcome. Playwright simulates a lost response; the full gate passed. This does not recover a lost secret or prove a still-running request has finished.
- `WEBHOOK-CONCURRENCY-1` — Workflow-row locking and observed version checks prevent concurrent app requests from silently creating duplicate registrations or replacing another rotation. Synthetic PostgreSQL and full-gate tests passed. Older clients must reload; the application lock does not constrain direct database writes.
- `WEBHOOK-SECRET-CONTRACT-1` — Owner approved a one-time GitHub signing-secret display; generic webhooks retain the same one-time model after provider comparison. The response is non-cacheable, guidance is aligned, and focused and full-gate tests passed. Existing secrets remain unavailable on later reads.
- `GH-HOOK-AUTO-1` — Provider-managed GitHub webhook status/create/delete now include a safe recorded-identity reconciliation action in the owner-scoped API and editor panel. A matching active hook can restore `DELETE_UNCERTAIN`; drift, ambiguous inspection and unknown create identity remain manual boundaries. Mutations are feature-flagged, require `PUBLIC_API_ORIGIN` in production, use only the workspace GitHub credential, and return no token, signing secret, callback URL or remote hook ID. Local lifecycle/API/browser proof is complete; live provider qualification and operator evidence remain gated.
- `CONNECTOR-AUDIT-1` — Every catalog app is now mapped to its operations, availability, credential, resource-picker, executor, and production-proof boundary in `docs/20-connector-audit.md`. The available HTTP node now exposes runtime headers through a reusable key/value Inspector field; roadmap-only nodes remain disabled. Web catalog tests 20/20, full quality gate, and Playwright 38/38 passed without provider calls.
- `CONNECTOR-FIELD-UX-1` — Google Drive hides upload-only fields until `uploadText` is selected, and Google Sheets uses a reusable table editor that preserves the existing matrix runtime payload. Web catalog tests 21/21, Playwright 39/39, and the full quality gate passed without provider calls.
- `CONNECTOR-CONTRACT-1` — Shared executable node capabilities now align the UI catalog and execution boundary while preserving schema-only roadmap imports. Web 22/22, API 198/198, Playwright 39/39, and the full quality gate passed without provider calls.
- `WEBHOOK-UI-POLISH-1` — Resource pickers separate search/select/manual entry and webhook setup is reachable from the selected trigger with published-version and multiple-draft safeguards. The owner-approved GitHub Push qualification for `phuuthanh-dev/math-util` returned HTTP 201 for the signed ping and branch push, and the pinned live trigger execution succeeded; action nodes and sustained stability remain unverified. See `.agent/reports/2026-10-28-webhook-ui-polish.md`.
- `GH-PICKER-OWNER-1` — GitHub repository picker filters loaded results by owner, preserves filtered/unloaded values, and explicitly avoids implying permissions. The provider query and credential scope were not changed; focused and full-gate evidence is recorded in `.agent/reports/2026-10-28-github-picker-owner.md`.
- `LIVE-1` — The owner-approved live smoke was rerun after rotating the Steam credential. Published workflow v13 succeeded for the connected Steam, Google Chat, Discord, and Telegram nodes; Google Drive remains unqualified because it is disconnected from the graph. Evidence is recorded in `.agent/reports/2026-10-28-live-provider-smoke.md`.
- `EMAIL-SMTP-1` — Dedicated SMTP Email action is implemented locally with encrypted `SMTP` credentials, TLS-only submission policy, mock/live contract, redaction and provider-failure classification. It has no owner-approved SMTP provider smoke yet; attachments, Gmail OAuth, bulk sending and inbound email are intentionally out of scope.

## Next approved slices

These are the only currently approved follow-up directions. A task must target
one of these IDs or explicitly reopen a completed ledger slice.

| ID | Outcome | Status | Owner/evidence boundary |
|---|---|---|---|
| `OPS-1` | Complete the VPS production qualification evidence: DNS/TLS, env shape, backup/isolated restore, rollback, and fixed-target smoke | operator-gated | Requires operator access and must not print secrets |
| `LIVE-1` | Validate one explicitly approved real Steam → Google Chat run plus configured OAuth callbacks | pending | Steam → Google Chat/Discord/Telegram is proven after credential rotation; Google Drive and any additional OAuth callback/write semantics remain separate owner-approved checks |
| `RELEASE-REPAIR-1` | Repair and prove production application bootstrap after the GitHub webhook adapter DI regression | operator-gated | Local no-I/O app boot and full quality gate passed; PR review/merge and post-deploy application health evidence remain required, with no provider credential or live webhook needed |

## Closed boundary

The following are not next implementation goals because they are already
implemented and verified in the repository ledger: authentication and identity
readiness, workspace/dashboard/workflow lifecycle, editor and node library,
credential lifecycle and dependency references, execution engine and worker qualification, node debug,
Go Live/activation guards, execution center, notification adapters, theme and
Relay-inspired design system, accessibility hardening, CI/CD, immutable image
deployment, release security contracts, production release candidate
documentation, dense-canvas navigation/minimap, and the reusable provider
resource-picker foundation.

## Recently closed slices

- `L13.1` reopen / auth and control polish (2026-10-29) — Owner-requested
  login/register visual follow-up is complete locally: dedicated `/register`
  sharing the login form, password visibility and pending/error feedback,
  16px inspector title, native-select chevron inset, and connection creation
  directly below its toolbar/above saved cards. Full gate: 213 API / 23 web /
  82 E2E. Evidence: `.agent/reports/2026-10-29-auth-control-polish.md`.
  Local develop delivery only; this is not deployed or a new OAuth integration.
  Subsequent owner-reported header alignment is also fixed in shared brand CSS:
  inline baseline space removed and Gilroy optically aligned. Full gate remains
  213 API / 23 web / 82 E2E; `.agent/reports/2026-10-29-header-brand-alignment.md`.

- `L13.1` reopen / product experience (2026-10-29) — New owner-requested
  refinement complete locally: workflow-first dashboard, searchable saved
  connections and guided draft-secret fields, shared dialog headers,
  deterministic menu dismissal, readable inspector/palette and theme parity.
  Full gate: 213 API / 23 web / 79 E2E. Task branch remains local and is
  integrated into develop; this UI refinement is not part of public PR #43.
  Evidence: `.agent/reports/2026-10-29-product-experience.md`. Do not propose
  these completed changes again without a concrete new finding.

- `PUBLIC-READY-1` (2026-10-29) — Public privacy/terms/support, contact redirect,
  footer/login links, metadata, robots/sitemap and social image shipped through
  PR #43 (develop → main), release `bff788782f6be8034629595abfc522f446eda6ac`.
  PR quality run 40889119558, main quality run 40890095004 and production deploy
  40891122177 passed. External public routes returned 200, contact returned
  308 → /support, and API/database/queue readiness returned ready. Website
  publication does not imply Google verification. Evidence:
  `.agent/reports/2026-10-29-public-site.md`.

- `UI-MOTION-1` / `L12.3` / `L13.1` (2026-10-29) — Owner-reported FAQ jump
  corrected with reversible shared GSAP disclosures, independent answers,
  hidden/inert resting state and persistent ribbon resources. Page-height
  changes now morph the existing field over 600ms while preserving Lenis,
  shader time and absolute scroll coordinates. Shared
  menu/dialog/inspector/progress, execution panels, hero tilt and product tabs
  now use the documented motion layer. Unused Motion package removed; dark
  Account menu first-frame contrast corrected. Full default verify passed:
  213 API, 23 web, 72 E2E (3.3m E2E). Evidence:
  `.agent/reports/2026-10-29-shared-gsap-motion.md`. This is local delivery;
  no remote push or deployment. Do not repeat this migration without a new
  concrete regression or owner request. Native-device performance and owner
  visual acceptance are distinct from passing Chromium tests.
- `L12.3` / `L6.1` readability and GSAP skills follow-up (2026-10-29) —
  Public type/footer readability and scoped GSAP section reveals are implemented.
  Eight official skills are pinned in user/project skill directories, with MIT
  notice, provenance and AGENTS selection rules in `docs/26-gsap-workflow.md`.
  Skill review removed redundant nested context. API 213, web 23 and all 66
  E2E are qualified across a full run and targeted recovery; two existing E2E
  synchronizations were corrected with their assertions retained. Fresh default
  full-suite CI is required before a future PR merges. Current evidence:
  `.agent/reports/2026-10-29-landing-readability-motion.md`. Do not reinstall
  these skills or repeat the typography/reveal migration without a new request
  or concrete regression. Owner visual acceptance remains separate.
- `L12.3` statement-to-diagram correction (2026-10-29) — The owner's new
  brief and initial-icon screenshot reopen only this missing choreography:
  dark outlined Fluxora badge → lime statement → collapsed badge → existing
  runtime diagram. The same object tracks measured geometry, clears desktop
  copy, reverses on scroll, and supports pause/reduced-motion/no-JS fallback.
  Full default verify passed: 213 API, 23 web, 62 E2E. Temporal recording uses
  the SVG fallback; existing WebGL lifecycle tests also passed. See
  `.agent/reports/2026-10-29-landing-card-handoff.md`. Local delivery only;
  no push/deploy or final owner visual acceptance is implied. Do not repeat
  the completed landing/ribbon work without a new specific requirement.
- `UI-CORE-1` / `L13.1` — Owner-requested visual unification across all six
  existing routes: compact glass landing navigation, shared BrandLockup and
  PageHeader, theme-aware product shell/overlays and common typography/control
  roles. Native visual review and full verify passed (213 API, 23 web, 58 E2E).
  See `docs/25-ui-core-unification.md` and `.agent/reports/2026-10-29-ui-core.md`.
  The owner subsequently authorized release through develop → main in PR #40.
  Its first CI exposed a disabled-button theme-transition contrast regression;
  the release follow-up is recorded in the same task/report. Production rollout
  requires passing replacement CI; owner visual approval is separate. Do not
  repeat this migration without a specific regression or changed requirement.
- `LANDING-1` — The public root is now a clean-room Fluxora landing with an
  explicit `/login` route for the existing email/password and OAuth UI.
  Session expiry and sign-out route to `/login`; source/template assets were
  not imported into this public repository. Focused browser coverage, desktop
  and mobile visual review, and the full quality gate passed.
- `LANDING-ANIMATION-1` — The public landing now has bounded Motion polish and
  two client-only React Three Fiber islands. Both unmount when off-screen or
  hidden, reduce-motion and no-WebGL paths stay semantic HTML/CSS, and no
  authenticated product surface imports the animation stack. Focused fallback
  Playwright, desktop/mobile visual review, and the full quality gate passed.
- `LANDING-V2-1` through `LANDING-V2-4` — Fluxora’s clean-room public landing
  now includes responsive navigation, hero/product proof, a readable workflow
  narrative, lifecycle, illustrative usage planning, FAQ disclosure, CTA, and
  footer. The initial delivery used bounded landing-only R3F islands. The owner
  subsequently reopened L12.3 with the supplied Relay MP4 and an explicit
  Catmull-Rom/GLSL/ScrollTrigger/Lenis brief; see the current revision below.
- `L12.3` visual revision (2026-10-29) — The landing now has an original local
  workflow replay, keyboard product tabs, a continuous Catmull-Rom ribbon with
  Perlin GLSL, shared GSAP/Lenis/R3F ticker, fold plate, reliability section,
  sample daily dashboard and workflow cases. It restores native scrolling on
  route exit, pause or reduced motion. This supersedes the older no-Lenis /
  hero-only boundary; do not reimplement the original landing slices. Current
  acceptance and verification live in
  `.agent/reports/2026-10-29-landing-art-direction.md`. Local changes do not imply
  a PR, deployment or qualification of real provider integrations.
- `L12.3` motion fidelity correction (2026-10-29) — Owner feedback rejected the
  thin-wire approximation. Temporal review separates the autonomous entrance
  from scrolling; a broad implicit ribbon field replaces the offset mesh,
  adds converging/diverging filaments, soft focus and drifting light, and
  preserves the existing cleanup/fallback boundary. Current evidence is
  `.agent/reports/2026-10-29-ribbon-motion-fidelity.md`. Visual acceptance by
  the owner remains distinct from functional test results; do not claim Relay
  equivalence from static frames or tests alone.
- `L12.3` detail/color refinement (2026-10-29) — The owner requested sharper
  lower sections and more particles in varied bright colors. The existing
  shader now retains 48 fine cores with separate glow and two multicolor
  particle fields. Native-GPU preview and full verify passed (213 API, 23 web,
  55 E2E). Latest evidence: `.agent/reports/2026-10-29-ribbon-detail.md`.
  Owner visual acceptance remains pending; no push or deployment is implied.

## Latest auth-header correction

- `L13.1` (2026-10-29): owner rejected the split-color header and inset showcase
  experiment. Auth body restored to `ddaa9e9`; only auth navigation styling and
  header controls differ. Full verify passed (213 API, 23 web, 82 E2E), and all
  12 route/theme/viewport screenshots were reviewed. See
  `.agent/reports/2026-10-29-auth-header-composition.md`.
  Owner follow-up after `8e25593`: the pale bar still blended into the light form;
  the auth header now uses the landing's dark marketing palette in both modes.
  Body layout and theme selection remain unchanged. Repeated full verify passed
  (213 API, 23 web, 82 E2E); rendered contrast and keyboard focus also passed.
  The owner has now authorized merge. Refreshed GitHub state shows PR #45 was
  already merged at the earlier split-header revision; the two local correction
  commits require the next develop-to-main PR and its passing CI before merge.

## Non-negotiable loop

```text
read this state → select one non-closed ID → define proof
→ implement one vertical slice → run agent:task:check
→ run npm run verify → review diff and CI → merge only with owner approval
```

If no item can proceed without credentials, operator evidence, or a product
choice, report that blocker instead of inventing another feature or repeating a
completed slice.
