# NX execution guidance audit follow-up

## Identity

- Task ID: `2026-11-06-nx-execution-guidance-audit`
- Base commit: `56ae448`
- Working branch: `develop`
- Implementer and reviewer: Codex

## Outcome

Correct two inaccurate descriptions of released item execution behavior while
completing the owner-requested NX audit.

## Target slice IDs

- `APP-EXPANSION-1`

## In scope

- The execution timeline must not assert that an Error branch is disconnected
  when the API reports a stopped run: a connected branch can be skipped for a
  fatal item limit or internal error.
- The list output guidance must reflect supported conditions and Error branches.
- Update the existing focused UI assertion and NX release status documentation.
- Cover the real mock runner-to-editor path for a failed item routed to Error;
  assert the failing node and recovery node show their recorded statuses.
- Resynchronize status when an authorized execution event stream opens or
  reconnects, closing the gap between the initial fetch and SSE subscription.

## Explicitly out of scope

- Changes to the execution engine, provider behavior, additional settings,
  version compatibility, real provider calls or new infrastructure.

## Acceptance criteria

- [x] A stopped failure is explained accurately without guessing whether an
  Error branch exists; routed errors continue naming their target.
- [x] List guidance does not claim that all supported item flows are linear.
- [x] A mock run with a connected Error path displays the failed item node and
  successful recovery node correctly without mocking the execution response.
- [x] Each authorized event-stream subscription requests a current state refresh
  after subscribing; unauthorized requests cannot receive the signal.
- [x] The current audit distinguishes released item routing from unsupported
  joins and approvals after item sources.
- [x] Run verification only once at the end of the full owner-requested goal.

## Required evidence

- Existing web execution-observability unit cases updated for the corrected text.
- Browser E2E using the real mock runner and an isolated database, no provider.
- Controller test for initial event ordering and owner authorization.
- Isolated final `npm run verify` after the full batch, not per task.
- Prior API integration case for fatal item failure with connected Error target.

## Safety boundaries

- Keep the local scheduler disabled and preserve unrelated worktrees and data.
- Do not use real credentials, make real provider calls or emit sensitive data.
- Use the owner-authorized single develop-to-main PR at the end of the batch.
