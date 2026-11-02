# Node library preference storage

Targets: `APP-EXPANSION-1`, `EDITOR-QUALIFICATION-1`.

The node library now treats browser preference storage as optional. A blocked or
full store no longer interrupts adding or dragging a node; favorites and
category state remain available until the current session ends. Existing keys
and behavior remain unchanged when storage succeeds.

The browser regression test rejects writes only for node-library preference
keys and checks adding a node, favorites, and category collapse in a mocked
workflow. No external service or real user workflow is used. Final isolated
verification and deployment evidence must be recorded before release.
