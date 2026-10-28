# Connector audit and Google configuration

`docs/20-connector-audit.md` inventories each app, available versus roadmap functionality, evidence boundaries and prioritized gaps. Google Drive fields are now shown only for their applicable operation; Sheets value entry appears only for append/update. Hiding a field does not modify its stored value.

The focused suite passed 9 Playwright tests, including operation switching and preservation. The first full `npm run verify` had 38 passes and one editor navigation timeout unrelated to the modified fields; a second complete run passed all 39 Playwright tests and the preceding quality checks. No real provider requests or production writes were performed for this change.

This is one slice of the broader connector goal. Automatic GitHub webhook lifecycle remains on a separate unfinished branch; PR #32 is separate and unmerged. Multi-row Sheets editing, other connector UX and provider-specific production qualification remain open.
