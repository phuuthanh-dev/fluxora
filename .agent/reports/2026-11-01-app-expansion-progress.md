# App expansion progress — 2026-11-01

The node library groups existing app cards by their established category, keeps
keyboard navigation across groups, and displays both app and operation counts.
An RSS/Atom read action is implemented locally with bounded input and output,
DTD rejection, depth and response limits, normalized items, mock mode and the
existing outbound request policy. After security review the adapter was gated:
RSS appears only as planned and is not executable. It does not implement a trigger.

Evidence so far: RSS focused tests 2/2; existing web unit tests 30/30; API and
web typechecks passed. Browser checks and the full `npm run verify` remain for
the end of the goal. No real RSS feed or other provider was called.

Security review remains open: the shared outbound policy validates DNS before
fetch, which can resolve DNS again. This affects arbitrary user-provided URLs;
connection-time address pinning must be reviewed before production claims.

Trello, Sentry, Reddit, Uptime Kuma, Vercel and Supabase have provider notes in
`docs/34-app-expansion.md` only; no connector or credentials have been built for
them. The category grouping is the start of UI/UX work, not a full redesign.
No changes were pushed, merged or deployed.
