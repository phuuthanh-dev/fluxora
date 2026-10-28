# Fluxora public landing v2

## Purpose

The public root is a product explanation and a clear route into the existing
sign-in surface. It is not a second dashboard, an editor demo requiring a
login, or a reproduction of a third-party marketing template.

The Relay brief is a directional reference for calm technical pacing, dark
surfaces, acid-lime emphasis, glass-like product windows, and restrained 3D
depth. Fluxora owns the implementation, copy, diagrams, interaction model, and
visual assets in this repository.

## Information architecture

1. **Navigation and hero** — explain the product promise and provide a direct
   sign-in CTA.
2. **Product proof** — show the actual Fluxora mental model: draft, immutable
   version, execution, redacted evidence.
3. **Principles and narrative** — explain the trigger → decision → evidence
   loop without asking a visitor to watch a video.
4. **Lifecycle and illustrative usage** — make safety and workload legible.
   The usage meter is explicitly illustrative until commercial pricing is an
   approved product decision.
5. **Example, FAQ, CTA, footer** — answer first-use questions and provide a
   stable close to the page.

## Motion and performance boundaries

- Motion confirms hierarchy; it never withholds semantic content from the
  first render.
- WebGL remains limited to the two lazy marketing islands defined in
  `docs/14-design-system.md`. There is no fixed full-page canvas, scroll
  hijacking, Lenis dependency, remote video, model, texture, or shader bundle.
- The landing must remain complete when JavaScript, WebGL, or motion is
  unavailable. Reduced-motion removes canvas and transition-dependent polish.
- Interactions use native links, buttons, labels, ranges, and disclosure
  relationships. Pointer-only effects cannot be required to understand or
  activate content.

## Regression contract

`e2e/landing.spec.ts` must cover:

- public root and explicit `/login` authentication boundary;
- reduced-motion and no-WebGL fallbacks;
- navigation anchors, interactive illustrative usage meter, and FAQ disclosure;
- tablet and narrow mobile viewports with a usable hero and product proof.

Visual review uses Chromium desktop and iPhone 13 captures. Public landing
work also runs the repository quality gate before handoff.
