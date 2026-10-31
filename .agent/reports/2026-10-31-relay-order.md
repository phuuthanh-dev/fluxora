# Relay feature order — local verification

- Reopened L12.3 for the owner's requested reference order: trace, approval and chart now precede the statement and reliability sequence. The existing lifecycle section was moved after use cases; Fluxora-specific preview, lifecycle and FAQ remain documented deviations.
- Each illustration owns a scoped repeating GSAP timeline, starts when visible, stops offscreen, and reverts on pause or reduced motion. Original Relay cube/cap assets remain local and sample values are labelled.
- Typecheck and 18 targeted Playwright checks passed. A new browser assertion checks feature order and viewport pause.
- First full verification had 105 passes and two unrelated navigation timeouts in account recovery and Connections onboarding. Both passed when rerun individually. A complete second `npm run verify` passed all 107 Playwright tests.
- Inspected desktop 1440px and mobile 375px screenshots locally. No deployment, remote push, real provider calls or production data changes.
- Exact reference parity is not claimed: see docs/31-relay-parity-audit.md for remaining section and choreography differences.
