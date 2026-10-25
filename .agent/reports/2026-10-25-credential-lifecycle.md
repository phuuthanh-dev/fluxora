# Agent handoff report

## Outcome

- Status: `complete`
- One-sentence result: Workspace owners can rename credentials and rotate encrypted secrets without breaking node bindings, duplicate label collisions yield user-facing conflict alerts, and deletion is reference-guarded against active draft/published versions and in-flight executions.

## Commit and scope

- Base commit: `c2282415240a0e4779c3b5c596e57dc47245f7ac`
- Implementation commit(s): `ed0f40a9bab18288e8e9930c9f759219ffed00e9`, `2c2cda9cf8154bc49b08b377d6ba20162647d8f7`, `f2e5a4464c826700cf4baa53b40483dd5d34f58c`
- Branch: `codex/credential-lifecycle`
- Scope respected: `yes` — implemented owner-protected rename/rotate/delete endpoints, unique label conflict handling, reference checking for current draft/published versions and active executions (`QUEUED`, `RUNNING`, `WAITING_APPROVAL`), canonical Google OAuth server-side rejection for create/rename/delete (`CREDENTIAL_MANAGED_BY_OAUTH`), strict exact-canonical / `isManaged` UI detection allowing names containing "OAuth" (e.g. "OAuth backup") full actions, Telegram legacy `chatId` fallback retention through rotation without exposing it to the client, credential card actions with warnings and inline error preservation, and Playwright lifecycle tests without touching out-of-scope files or real credentials.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| The API supports credential rename/secret rotation while retaining provider and ID, encrypting replacement data, returning summaries only, and writing redacted audit records | `credential.service.test.ts` ("update renames credential while preserving ID and provider", "update rotates secret payload, encrypts data, and records redacted audit log") | Passed |
| Duplicate labels yield a stable conflict message for both create and rename rather than a 500 error | `credential.service.test.ts` ("create rejects duplicate label with CREDENTIAL_LABEL_CONFLICT", "update rejects duplicate label conflict on rename"); Playwright test asserts inline alert with preserved inputs | Passed |
| Delete blocks with `CREDENTIAL_IN_USE` for current draft/published node references and non-terminal execution references, identifies affected workflow/execution references without secrets, and permits an unreferenced credential to be deleted | `credential.service.test.ts` ("delete blocks with CREDENTIAL_IN_USE when referenced by current draft version", "delete blocks with CREDENTIAL_IN_USE when referenced by notificationCredentialId in published version", "delete blocks with CREDENTIAL_IN_USE when referenced by active execution", "delete allows cleanup when credential is unreferenced or only in historic version with completed executions"); Playwright test verifies blocked and allowed deletion | Passed |
| Canonical Google OAuth identity (`provider: GOOGLE, label: "Google OAuth"`) is reserved server-side; manual create and rename-to-canonical reject with `CREDENTIAL_MANAGED_BY_OAUTH`, while `upsertGoogleOAuth` remains the only path to manage it; manual Google credentials like "OAuth backup" remain fully functional | `credential.service.test.ts` ("create rejects canonical Google OAuth credential with CREDENTIAL_MANAGED_BY_OAUTH", "create allows manual Google credentials including names that contain OAuth", "update rejects renaming a manual Google credential to canonical Google OAuth with CREDENTIAL_MANAGED_BY_OAUTH", "update allows renaming a manual Google credential to names that contain OAuth"); `credential-lifecycle.spec.ts` verifies rejected manual create and rename, valid "OAuth backup" creation and card actions | Passed |
| Canonical Google OAuth credential is protected server-side (`CREDENTIAL_MANAGED_BY_OAUTH`) against direct PATCH and DELETE, and the UI displays managed OAuth guidance and Reconnect action without Rename, Rotate, or Delete controls | `credential.service.test.ts` ("update rejects canonical Google OAuth credential with CREDENTIAL_MANAGED_BY_OAUTH on rename and rotation", "delete rejects canonical Google OAuth credential with CREDENTIAL_MANAGED_BY_OAUTH"); `credential-panel.tsx` renders `.credential-card__oauth-managed` without Rename/Rotate/Delete buttons; `credential-lifecycle.spec.ts` asserts UI elements and verifies direct API `PATCH`/`DELETE` return 400 `CREDENTIAL_MANAGED_BY_OAUTH` | Passed |
| Rotating a `TELEGRAM_BOT` credential preserves legacy encrypted `chatId` server-side when omitted from replacement payload without returning it to the browser, while vault-only credentials remain vault-only | `credential.service.test.ts` ("update TELEGRAM_BOT preserves existing legacy chatId when replacement payload omits chatId", "update TELEGRAM_BOT keeps current vault-only credential vault-only when replacement omits chatId", "update TELEGRAM_BOT overwrites legacy chatId if replacement payload explicitly provides chatId"); `credential-panel.tsx` explains legacy fallback retention; `credential-lifecycle.spec.ts` tests rotation with replacement omitting `chatId` | Passed |
| The UI makes Rename, Rotate secret, and Delete discoverable from a credential card; rotate/delete have explicit, accessible warnings; errors are actionable and input remains intact | `apps/web/src/features/credentials/credential-panel.tsx` renders grouped action buttons on each card with inline form states, accessible `role="alert"` messages, and preserved input fields | Passed |
| A renamed or rotated credential remains selected by existing node configuration because its ID does not change | Verified in Playwright E2E: Discord node retains selected credential after rename and rotation | Passed |
| Tests cover service/controller behavior, redaction/reference safety, and a mocked Playwright credential lifecycle. `npm run verify` passes | 103 API tests pass (100 passed, 3 skipped redis); 10 web unit tests pass; 11 Playwright E2E tests pass; full `npm run verify` passed with 0 errors | Passed |

## Validation receipts

| Command | Result | Relevant output or artifact |
|---|---|---|
| `npm run codegraph:check` | pass | Clean exit code 0 |
| `npm --prefix apps/api test` | pass | 103 tests (100 passed, 3 skipped, 0 failures) |
| `npx playwright test e2e/credential-lifecycle.spec.ts` | pass | 1 passed (3.1s) |
| `npm run verify` | pass | Passed codegraph check, prisma validate, prisma generate, 113 unit tests across workspaces (110 passed, 3 skipped), lint, typecheck, build, and 11 Playwright E2E tests |

## Files changed

- `apps/api/src/credentials/credential.controller.ts` — Added owner-protected `@Patch(":credentialId")` and `@Delete(":credentialId")` endpoints.
- `apps/api/src/credentials/credential.service.ts` — Added duplicate label conflict checks, `update()` with rename and vault re-encryption, `delete()` with workflow draft/published and active execution reference scanning, server-side reservation of canonical Google OAuth identity for create/update/delete, Telegram legacy chatId fallback retention, and `isManaged` on summaries.
- `apps/api/src/credentials/credential.service.test.ts` — Added comprehensive unit tests for conflict handling, rename/rotation safety, canonical Google OAuth reservation (create/rename/rotation/delete rejection), manual Google credential support with "OAuth backup", and reference-guarded deletion.
- `apps/web/src/features/api/api-client.ts` — Added `ApiClientError` exposing API `code` and `details`.
- `apps/web/src/features/credentials/credential-types.ts` — Added `CredentialReferenceDetails` and updated `CredentialSummary` with `isManaged?: boolean`.
- `apps/web/src/features/credentials/credential-panel.tsx` — Implemented card-level Rename, Rotate secret, and Delete actions, exact canonical / `isManaged` detection (no `includes("oauth")`), inline accessible alerts, Google OAuth redirect handling, and input preservation.
- `apps/web/src/app/globals.css` — Added styling for credential cards, action buttons, danger confirmation, and reference blockers.
- `e2e/credential-lifecycle.spec.ts` — Added end-to-end Playwright test covering duplicate-label collision handling, credential rename, secret rotation, node binding preservation, reference-blocked deletion, rejected manual create and rename to canonical Google OAuth, manual "OAuth backup" card actions, seeded canonical Google OAuth card verification, and successful cleanup.
- `docs/01-product-spec.md` — Documented credential lifecycle management, conflict responses, and reference-checked deletion behavior.
- `docs/06-loop-engineering.md` — Added loop L6.5 Credential lifecycle record.

## Risks and follow-up

- Deletion scans current draft and published version graphs for `credentialId` and `notificationCredentialId` and active executions (`QUEUED`, `RUNNING`, `WAITING_APPROVAL`). Completed executions or historic versions that are no longer draft or published do not block cleanup, preventing permanent credential locks.
- Real OAuth token exchange or third-party credential rotation remains bounded by offline mocks and requires user-provided credentials when live.
- The pre-existing uncommitted `apps/web/next-env.d.ts` change was preserved and not staged or committed.

The reviewer must inspect the commit diff and independently verify critical tests. This report is not proof by itself.
