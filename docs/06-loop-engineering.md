# Loop Engineering Protocol

This repository is developed through small, verified delivery loops. A loop is complete only when its acceptance criteria, automated checks, and documentation status agree.

## Loop sequence

1. **Select one vertical slice.** It must have a user-visible outcome and no hidden dependency on an unfinished later slice.
2. **Define proof before implementation.** Add or update the narrowest relevant test first where practical.
3. **Implement only the selected slice.** Keep the browser free of provider secrets and provider calls.
4. **Run the quality gate.** The required command is `npm run verify`; targeted tests and a local manual check supplement it.
5. **Review against the product acceptance criteria.** Mark the loop as done only with reproducible evidence.
6. **Commit a focused change.** Update this file and the implementation plan when the delivered behavior changes.

## Automated quality gate

`npm run verify` runs, in order:

1. Prisma schema validation
2. Unit and integration tests
3. TypeScript checks
4. Production build

CI runs the same gate for every pull request and push to `main`.

## Active delivery loops

| Loop | Outcome | Status | Proof required |
|---|---|---:|---|
| L0 | Repeatable repository quality gate and CI | Complete | `npm run verify` passed locally; GitHub Actions checks the same gate |
| L1 | Authenticated owner can create, save, reload, and publish a workflow | Complete | HTTP and browser checks passed locally |
| L2 | Pinned version can run with persisted node I/O | In progress | Inline mock and authenticated SSE delivery passed locally; BullMQ Redis worker validation remains |
| L3 | Credential vault plus Steam → Google Chat mock and live-capable adapters | In progress | Mock flow passed; live check needs user-provided credentials |
| L4 | Cron, webhook, approval, Google Drive/Sheets, execution UI and polish | In progress | Cron, webhook, approval pause/resume plus optional Chat app-link notification, signed Google OAuth with token refresh, and Drive → Sheets mock E2E exist; live OAuth/notification validation and acceptance walkthrough remain |

## External-boundary rule

Real Steam, Google Chat, and Google OAuth calls are enabled only after a user supplies their credentials through the application. Until then, adapters use deterministic mock transport; no secret belongs in source, tests, logs, or frontend state.
