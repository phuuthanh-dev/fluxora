# Node library preference storage

Targets: `APP-EXPANSION-1`, `EDITOR-QUALIFICATION-1`.

The node library now treats browser preference storage as optional. A blocked or
full store no longer interrupts adding or dragging a node; favorites and
category state remain available until the current session ends. Existing keys
and behavior remain unchanged when storage succeeds.

The browser regression test rejects writes only for node-library preference
keys and checks adding a node, favorites, and category collapse in a mocked
workflow. No external service or real user workflow is used. The shared helper
also protects the drag path; the browser test does not simulate dragging.

Final isolated `npm run verify` passed: API 352 passed and one skipped; web 32
passed; Playwright 145 passed. An earlier attempt used the wrong `WEB_ORIGIN`
for unit-test fixtures. The next full run passed 144/145 browser cases, with
one unrelated Connections-to-Executions navigation timeout; that case passed
twice in isolation and in the final full run. The timeout cause remains
unconfirmed. The local Redis test instance was stopped after verification.
The change has not been released to production.
