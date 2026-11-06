# Node mock metadata and editor guidance

## Identity

- Task ID: `2026-11-06-node-mock-metadata`
- Base commit: `1f2bc8e37b8bf455556d8ffb3c1aa6acc3f1c9e3`
- Working branch: `develop`
- Implementer: Codex
- Reviewer: Codex

## Outcome

Make a selected node's test behavior clear using the existing operation metadata.

## Target slice IDs

- `APP-EXPANSION-1`, `EDITOR-QUALIFICATION-1`

## In scope

- Add truthful metadata for mock execution and the existing history-redaction boundary.
- Show useful node-specific mock guidance in the inspector and verify registry behavior with synthetic fixtures.
- Document what the metadata does and does not guarantee.

## Explicitly out of scope

- New provider operations, live provider tests, binary/database triggers, new retry settings, changes to runtime redaction or workflow semantics, legacy node compatibility layers.

## Acceptance criteria

- [x] Executable and planned nodes have mock classifications; approval, trigger and condition behavior are distinct from simulated external actions.
- [x] The editor displays guidance that distinguishes sample data from live provider validation.
- [x] Redaction metadata describes the key-based history filter without promising comprehensive secret detection or controlling runtime policy.
- [x] Tests exercise configured mock executors and registry/UI distinctions using synthetic fixtures.

## Required evidence

- Tests to add or update: registry behavior and inspector guidance, including both themes.
- Commands to run: codegraph generation when imports change; one final `npm run verify`.
- UI/manual proof, if relevant: mock guidance visible for representative action and trigger nodes.

Final isolated `npm run verify`: 1,071 API tests with no skips, 73 web tests,
and 215 Playwright tests passed. The editor E2E exercised Steam in both themes,
the Schedule trigger, and Google Chat write guidance. No real provider was
called. Chromium logged existing GSAP target and WebGL extension warnings.

## Safety boundaries

- No provider credentials, external requests, data deletion, or scheduler activation.
- Existing data and unrelated work stay intact; use the owner's develop-to-main release workflow.
