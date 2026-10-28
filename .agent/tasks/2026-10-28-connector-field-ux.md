# Connector field UX contract

## Target slice IDs

`CONNECTOR-FIELD-UX-1`

## User-visible outcome

Make the currently executable Google Workspace nodes expose only the fields
needed by the selected operation. Google Sheets values must be edited as a
real table instead of a comma-separated single row, while Google Drive upload
fields must stay hidden for list/search/download operations.

## Scope

- Add reusable conditional visibility metadata to declarative node fields.
- Add a reusable table field for matrix-shaped provider input.
- Apply both to Google Drive and Google Sheets without changing stable node
  types or runtime payload contracts.
- Add focused catalog regression coverage and update the audit/loop ledger.
- Do not call Google, deploy, or change protected OPS files.

## Acceptance criteria

- Drive `name` and `text` appear only for `uploadText`.
- Sheets values support existing data, add/remove rows, add/remove columns, and
  persist `Array<Array<string>>` accepted by the existing executor.
- Existing draft graphs and Advanced JSON remain compatible.
- The field primitives are reusable by future connectors and remain keyboard
  accessible in light and dark themes.
- Focused tests and `npm run verify` pass.

## Reopen justification

This is a new connector field gap identified by `CONNECTOR-AUDIT-1`; it does
not reopen a completed GitHub or Google resource-picker slice.

## Evidence boundary

Provider calls remain mocked or absent. Live Google OAuth/resource qualification
stays owner-gated in the release documents.
