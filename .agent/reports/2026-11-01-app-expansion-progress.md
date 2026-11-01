# App expansion progress — 2026-11-01

The node library groups existing app cards by their established category, keeps
keyboard navigation across groups, and displays both app and operation counts.
An RSS/Atom read action is implemented locally with bounded input and output,
DTD rejection, depth and response limits, normalized items, mock mode and the
existing outbound request policy. RSS read is now executable locally after
connection-time DNS checks were added. It does not implement a trigger.

Evidence so far: targeted API tests 63/63, including RSS, DNS rebinding and
existing GitHub/notification behavior; web unit tests 31/31; API and
web typechecks passed. Browser checks and the full `npm run verify` remain for
the end of the goal. No real RSS feed or other provider was called.

The HTTP dispatcher now validates resolved addresses on socket connection; a
local fake-DNS rebinding test confirms it does not reach a loopback server.
This does not qualify SMTP/database transports or constitute a complete SSRF
security review. No live provider call or full release gate was performed.

Trello, Sentry, Reddit, Uptime Kuma, Vercel and Supabase have provider notes in
`docs/34-app-expansion.md` only; no connector or credentials have been built for
them. The category grouping is the start of UI/UX work, not a full redesign.
No changes were pushed, merged or deployed.
