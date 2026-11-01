# Email connection choice

## Outcome

- Grouped Gmail API and SMTP under Email in the connection form. Selection
  changes the guided fields; providers, saved connections and existing nodes
  retain their separate semantics. Gmail API reads; SMTP sends.
- Corrected unsupported status values in `docs/19-agent-state.md` and noted the
  earlier isolated-verify limitation in the Gmail read report.
- Google Calendar and Gmail trigger were not implemented by this slice.

## Validation

- `npm run typecheck` and `npm run agent:state` passed.
- Focused `product-experience.spec.ts` passed against a synthetic database and
  isolated ports, with assertions for both Gmail and SMTP fields. The first
  isolated attempt failed due to a test URL hardcoded to port 3001; the local
  temporary test copy was pointed at its isolated API and passed on rerun.
- Full `npm run verify` was not rerun for this slice.
