# Gmail workflow ideas and next steps

These are proposals, not features already delivered. Gmail reading requires a
separate consent and may need Google restricted-scope verification.

1. Inbox triage: new message from a selected sender → summarize with Gemini →
   send a short notification to Google Chat. Requires the durable Gmail trigger.
2. Support handoff: find messages by subject → create a GitHub issue with a
   manually reviewed summary. Requires reliable pagination and a human approval
   step before external writes.
3. Daily digest: Schedule → Read Gmail messages → deliver an aggregate to
   Telegram or Chat. The first read slice returns a bounded list; it does not
   automatically deduplicate messages across scheduled runs.
4. Invoice review: find an invoice message → ask for approval → file its
   attachment. Attachment download and binary Drive upload are not supported.
5. Project updates: detect a GitHub notification email → extract information →
   add a Notion page. Prefer the existing native GitHub trigger when available;
   Notion create-page and the Gmail trigger are not yet implemented.

Prioritize the durable Gmail trigger and an explicit data-retention decision
before automating business-critical inboxes. Never claim exactly-once delivery:
test de-duplication, history expiration, recovery, retries and active-version
switches against the real queue and database first.

## New-message trigger: implementation contract

- Use Gmail history polling for an independently connected mailbox. Establish
  a history checkpoint as part of activation so that the activation window is
  explicit. Explain that delivery is delayed by the polling interval.
- Persist checkpoint and ownership per workflow version and trigger node in
  PostgreSQL. Only the active published version may poll; use a bounded lease
  with ownership checks to prevent concurrent pollers advancing the checkpoint.
- Page through history without discarding unprocessed pages. Generate stable
  execution idempotency keys from the version, node and Gmail message ID, and
  make checkpoint advancement contingent on durable dispatch/recovery.
- Never silently reset an expired Gmail history ID: surface an actionable error
  and offer an explicit re-baseline choice that explains the possible gap.
- Test account reconnect, workflow deactivation/reactivation and publish of a
  new version, competing pollers, crashes between persistence and enqueue,
  queue unavailability, pagination, and retention expiry of idempotency keys.
  No live mailbox tests until the owner authorizes the exact test mailbox.

Google also supports push through Cloud Pub/Sub. That requires separate Cloud
resources, subscription verification and watch renewal; it is not implied by
this polling design or by an existing Google OAuth credential.

References: [Gmail OAuth scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push),
and [n8n Gmail Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gmailtrigger/).
