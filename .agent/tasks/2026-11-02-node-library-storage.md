# Node library when preference storage is unavailable

## Target slice IDs
- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome
- Adding or dragging an available node must not fail when the browser rejects
  writes to optional library preferences. Favorites and collapsed categories
  continue to work in the current session without persistent storage.
- Preserve the existing preference keys, node types and normal persistence.

## Evidence and boundaries
- `rememberRecent` currently calls `localStorage.setItem` before `onAdd` and
  `onDragStart` without catching errors. Browsers can reject storage writes.
- Exercise the failure with browser storage mocked to throw; do not use live
  provider credentials, external writes, or alter the user's workflows.
- Run the full verification gate in isolation after the implementation.
