# Connector audit and Google configuration

`docs/20-connector-audit.md` inventories each app, available versus roadmap functionality, evidence boundaries and prioritized gaps. Google Drive fields are now shown only for their applicable operation; Sheets value entry appears only for append/update. Hiding a field does not modify its stored value.

The focused suite passed 9 Playwright tests, including operation switching and preservation. The first full `npm run verify` had 38 passes and one editor navigation timeout unrelated to the modified fields; a second complete run passed all 39 Playwright tests and the preceding quality checks. No real provider requests or production writes were performed for this change.

This is one slice of the broader connector goal. Automatic GitHub webhook lifecycle remains on a separate unfinished branch; PR #32 is separate and unmerged. Other connector UX and provider-specific production qualification remain open.

Follow-up on the same branch replaces comma-splitting with a cell-based editor that supports multiple rows and columns, preserving untouched values and their types. Focused browser tests include commas and multiple rows; 39 Playwright tests passed in `npm run verify` after visual inspection and a light-mode button contrast fix. The editor also offers confirmed removal of the final row or column and resets its confirmation when switching nodes. Live Sheets write semantics have not been qualified.

After adding row/column removal and the node-switch safeguard, the first full verification had one notification-test timeout (38 passed). That test passed in isolation, and a second complete `npm run verify` passed all 39 Playwright tests and preceding checks. Light and dark confirmation states were visually inspected using mocked browser data. The timeout's cause remains unconfirmed.
