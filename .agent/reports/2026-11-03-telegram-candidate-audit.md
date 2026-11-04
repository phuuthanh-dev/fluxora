# Telegram trigger candidate — coordinator source review

The isolated candidate at `/private/tmp/fluxora-nx05-telegram-20261102` is
hard-disabled and is not integrated. This review is source inspection, not a
test or live-provider result.

1. Registration requires two different stored bot credentials for LIVE and
   TEST. Telegram has one webhook per bot, but requiring a second bot even to
   use LIVE is stricter than necessary and blocks users with one bot. Provide
   a clear single-bot live path; explain that a simultaneous test listener
   needs a separate bot or would replace the live webhook.
2. `getWebhookInfo` followed by `setWebhook`/`deleteWebhook` is not a remote
   compare-and-swap. Another client can replace the hook between inspection
   and mutation; checking once does not prove exclusive ownership. Surface the
   conflict and the replacement risk, never silently overwrite an observed
   foreign URL, and reconcile ambiguous outcomes. Telegram does not return the
   existing secret token via `getWebhookInfo`.
3. The staged provider adapter uses bare `fetch` instead of the repository's
   checked outbound transport. A token appears in the provider URL; errors and
   redirects must remain sanitized and writes must never follow redirects.
4. The candidate's update outbox detects duplicate `(botId, updateId)` but
   does not compare a changed payload for the same key. Its dispatch path is
   gated pending a generation-fenced worker and lifecycle integration; copying
   the files without that boundary would not establish safe recovery.
5. Registration, outbox and restrictive retention currently complicate
   workflow deletion and can retain execution data indefinitely. A bounded
   receipt lifecycle, owner-visible reset and a safe deletion path are needed.

Telegram documents webhook secret headers, retry behavior and the restriction
that polling and a webhook cannot receive updates simultaneously in the
[Bot API](https://core.telegram.org/bots/api#setwebhook). Update IDs may restart
at a random value after a week of inactivity, so they cannot be treated as an
always-increasing cursor. The coordinator has written a separate local
normalizer/filter/secret verifier, not yet connected to a public endpoint.
