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

Trello Create Card now has a distinct vault credential and guided board/list
pickers, with a pre-write list membership check and non-retryable uncertain write
errors. Local migration and browser/full verification remain pending. Re-running
after an interrupted worker can still duplicate a card. Sentry List Issues has a
separate token, selectable Cloud region, organization/project discovery and
bounded issue metadata; targeted mocked tests passed. Vercel List Deployments
uses a separate token and guided account/team and project pickers; targeted
mocked tests passed. Reddit, Uptime Kuma and Supabase have provider notes only.
The category grouping is the start of UI/UX work, not a full redesign.
No changes were pushed, merged or deployed.
