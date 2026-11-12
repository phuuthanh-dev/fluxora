# Connection picker and existing-feature qualification

## Identity

- Task ID: `2026-11-12-connection-picker-qualification`
- Base commit: `0193678402be9b8e7a9e78439c470a7df6602741`
- Working branch: `develop`; stable checkout
- Implementer/reviewer: Codex

## Outcome

Make finding a connection provider practical as the catalog grows; qualify existing Airtable and multi-trigger behavior, audit user-facing issues, reconcile stale progress, and measure modest isolated load.

## Target slice IDs

- `EDITOR-QUALIFICATION-1` — improve an existing provider picker and inspect the rendered UI.
- `MULTI-TRIGGER-1` — qualify existing behavior without reimplementation.
- `APP-EXPANSION-1` — qualify the existing Airtable connector only.

## In scope

- Accessible searchable categorized selection with existing provider identities and existing form behavior.
- Test only approved isolated resources, preserve live workflows, document any blocked live qualification.
- Correct evidenced issues and stale current-status documentation; moderate isolated load measurement.
- Review real UI in both themes, final audit and verification, one develop-to-main PR and merge after passing gates.

## Explicitly out of scope

- New connectors or trigger features, independent backup, speculative architecture or compatibility layers, and deleting unknown data or unrelated changes.

## Acceptance criteria

- [x] Providers can be searched and selected with a pointer or keyboard without a long native select.
- [x] OAuth and manual credential configuration preserve current behavior.
- [x] Qualification and load evidence state the limits of what was actually observed.
- [x] Inspect actual UI in both themes and run final verification.

## Evidence and limits

- Inspected the rendered picker on the dashboard in light and dark themes, including search and selection, and in the editor's narrow credential panel.
- A second production user authorized only a new Airtable test base; discovery and one live read succeeded. The test workflow was deactivated. Token refresh, writes, and isolation-denial cases were not tested live.
- A separate local PostgreSQL/Redis/API setup validated a manual-plus-webhook workflow and 50 mock runs at concurrency five. This is not a production capacity or provider throughput test.
- First final verification passed 251 of 252 E2E cases; the remaining case revealed a test-helper race. After correcting it, the full `npm run verify` passed: 252 E2E, 1,224 backend tests (one skipped), and 78 web tests.

## Safety boundaries

Do not disclose credentials; preserve the existing unrelated next-env change and production workflows. Follow the owner's requested final-only verification and existing develop-to-main delivery process.
