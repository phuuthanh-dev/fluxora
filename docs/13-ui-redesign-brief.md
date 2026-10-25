# UI/UX redesign brief and delivery plan

**Decision date:** 2026-10-25

## Brief

Redesign Workflow Automation into a coherent desktop-first control plane that feels clear on first use, credible in a portfolio demo, and efficient during repeated workflow operations. The redesign must improve hierarchy and interaction feedback without changing workflow semantics, credential boundaries, or execution safety.

The visual direction is **operational calm with Relay-inspired character**:

- dark navigation and command surfaces communicate system control;
- a light, high-contrast canvas keeps workflow graphs readable;
- restrained lime/mint is reserved for successful or primary execution actions;
- violet identifies product/navigation focus, not every clickable element;
- amber identifies live external side effects and approval attention;
- provider marks retain recognizable brand colors;
- motion explains state changes and hierarchy, never delays work.

Relay is a reference for typography, contrast, token discipline, and tactile motion. It is not the information architecture for the authenticated application. Marketing-only WebGL, smooth scrolling, and large storytelling layouts remain outside the dashboard and editor.

## Primary users and jobs

The MVP owner must be able to:

1. understand runtime and workspace status from the dashboard;
2. find, create, filter, and open a workflow;
3. assemble a graph without learning internal node types;
4. configure credentials without exposing or confusing secret values;
5. distinguish save, publish, test, and live execution;
6. see progress, errors, input, and output without hunting across panels.

## Experience architecture

### Dashboard

The dashboard is the product home, not a workflow modal. It should contain:

- persistent product/workspace navigation;
- a compact runtime-health summary;
- workflow search, status filters, and sort;
- a primary create action with template choice as a secondary path;
- workflow cards/rows with draft, published, live, and last-run state;
- recent executions and actionable failures after the workflow list is stable.

### Workflow editor

The editor follows a three-region model:

```text
Node Library (optional) | Canvas (owns remaining space) | Inspector
```

- Collapsing the Node Library must remove its grid track and give all reclaimed width to the canvas.
- The inspector remains stable so configuration fields do not jump horizontally.
- The top command bar groups navigation, edit operations, workflow management, persistence, and execution.
- Test and live execution must remain visually and semantically distinct.
- Canvas overlays must not cover nodes, minimap, controls, or each other at supported desktop sizes.

### Credentials and executions

- Credentials are managed on a dedicated dashboard surface in the target design; the editor may link to that surface and provide contextual selection.
- Existing secret values are never redisplayed. Rename, rotate, reconnect, and delete are explicit separate actions.
- Execution detail uses a stable summary followed by node timeline and JSON tree/table/raw views.

## Design-system contract

### Foundations

- Tailwind CSS v4 and CSS variables provide tokens.
- Existing CSS is migrated incrementally, not rewritten in one change.
- Lucide handles product concepts; offline provider icons handle brands.
- Typography uses a readable sans family for product UI and monospace only for IDs, expressions, logs, and JSON.

### Shared primitives

Build these before broad page restyling:

1. Button and IconButton with primary, secondary, ghost, danger, and live variants.
2. Menu and DropdownMenu with consistent grouping and keyboard behavior.
3. Field, Select, Textarea, Checkbox, validation message, and help text.
4. Dialog and Drawer with focus management and responsive sizing.
5. Badge, StatusDot, EmptyState, Skeleton, Progress, and Toast.
6. Card, SectionHeader, PageHeader, and Toolbar.

### Interaction states

Every interactive surface must define default, hover, focus-visible, active, disabled, loading, success, and error states. Async operations expose a textual status and `aria-live` feedback. Animations respect `prefers-reduced-motion`.

## Debrief of the current UI

### What is already strong

- Dashboard and editor are separate routes.
- Editor actions are grouped into Edit and Manage menus.
- Node Library groups nodes by user purpose and supports search/filtering.
- Runtime readiness, progress, validation, loading, and provider icons exist.
- Execution input/output supports JSON tree, table, and raw views.
- Credential lifecycle and live-run confirmation have real safety behavior.

### What remains inconsistent

- Component styling is mostly page-specific CSS, so buttons, panels, and form controls drift.
- Dashboard, editor chrome, credentials, and overlays do not yet share one spacing/type/elevation scale.
- Credentials still behave like an editor utility panel instead of a first-class management area.
- The inspector disappears at a breakpoint rather than becoming an intentional drawer.
- Several overlay panels use duplicated CSS and have no shared dialog behavior.
- Responsive and reduced-motion behavior need explicit regression coverage.
- The editor's grid previously kept three columns after the Node Library was removed, shrinking the canvas to the old palette width. This slice fixes and tests that defect.

## Delivery roadmap

### R0 — Layout integrity and design contract

- Fix collapsible editor regions.
- Record this brief and the visual/interaction rules.
- Add browser regression proof for layout changes.

### R1 — Tokens and primitives

- Define semantic color, spacing, type, radius, elevation, and motion tokens.
- Implement the shared primitives listed above.
- Add a local component showcase route or development story surface.

### R2 — Dashboard redesign

- Introduce persistent navigation and a consistent page header.
- Rebuild workflow list/search/filter/create hierarchy.
- Consolidate runtime health and recent execution status.
- Preserve current workspace race protection and failure retries.

### R3 — Editor shell redesign

- Migrate the command bar, Node Library, canvas overlays, and inspector to primitives.
- Make left and right regions independently collapsible.
- Provide intentional inspector drawer behavior at narrower desktop widths.
- Standardize save/publish/test/live progress and confirmation states.

### R4 — Credentials and execution management

- Add dedicated dashboard routes for credentials and executions.
- Reuse contextual drawers from the editor without duplicating business logic.
- Improve credential provider cards, compatibility labels, and safe lifecycle actions.

### R5 — Motion, accessibility, and purchased Relay audit

- Add restrained spring motion only where CSS transitions are insufficient.
- Test keyboard navigation, focus return, contrast, zoom, and reduced motion.
- After Relay is purchased, inspect its real manifest and license before importing any source component.

## Acceptance rules for every redesign slice

- One user-visible outcome per slice.
- No change to published-version or credential security semantics unless separately specified.
- Keyboard and focus-visible behavior must remain usable.
- Loading, empty, error, disabled, and success states must be addressed where applicable.
- Add narrow regression coverage and run `npm run verify`.
- Visually inspect the changed route at desktop width before committing.
